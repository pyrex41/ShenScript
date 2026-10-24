// Exercise the shipped stage-2 CLI from a fresh production-only installation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2), fresh = args.includes('--fresh-dependencies');
const positional = args.filter(x => x !== '--fresh-dependencies');
if (positional.length < 1 || positional.length > 2) throw new Error('Usage: test.package.js NEW_EVIDENCE_DIRECTORY [AUTHENTICATED_SNAPSHOT] [--fresh-dependencies]');
const out = path.resolve(positional[0]); fs.mkdirSync(out, { recursive: false });
const run = (label, command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 8388608, env: { ...process.env, NODE_PATH: '' }, ...options });
  fs.writeFileSync(path.join(out, label + '.stdout'), result.stdout || '');
  fs.writeFileSync(path.join(out, label + '.stderr'), result.stderr || '');
  if (result.error || result.status !== 0) throw result.error || new Error(label + ' failed');
  return result;
};
const packed = run('pack', 'npm', ['pack', '--json', '--pack-destination', out]);
const offset = packed.stdout.lastIndexOf('\n[');
const metadata = JSON.parse(offset < 0 ? packed.stdout : packed.stdout.slice(offset + 1))[0];
assert.ok(metadata.files.some(x => x.path === 'scripts/parser.js'));
assert.ok(metadata.files.some(x => x.path === 'scripts/config.js'));
const tarball = path.join(out, metadata.filename), install = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'shenscript-package-')));
fs.writeFileSync(path.join(out, 'installation.json'), JSON.stringify({ directory: install, outsideWorkspace: !install.startsWith(root), nodePathCleared: true }) + '\n');
assert.ok(!install.startsWith(root), 'production install must not inherit checkout node_modules');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const versions = Object.fromEntries(['astring', 'parsimmon'].map(name => [name, lock.packages['node_modules/' + name].version]));
fs.writeFileSync(path.join(install, 'package.json'), JSON.stringify({ private: true, type: 'module', ...(fresh ? {} : { overrides: versions }) }) + '\n');
run('install', 'npm', ['install', '--no-audit', '--no-fund', tarball], { cwd: install });
const pkg = path.join(install, 'node_modules/shen-script');
for (const file of metadata.files.filter(x => x.path.startsWith('lib/') && x.path.endsWith('.js'))) {
  assert.equal(createHash('sha256').update(fs.readFileSync(path.join(pkg, file.path))).digest('hex'), createHash('sha256').update(fs.readFileSync(path.join(root, file.path))).digest('hex'));
}
const installedVersions = Object.fromEntries(Object.keys(versions).map(name => [name, JSON.parse(fs.readFileSync(path.join(install, 'node_modules', name, 'package.json'), 'utf8')).version]));
if (!fresh) assert.deepEqual(installedVersions, versions);
const cli = run('cli', process.execPath, [path.join(pkg, 'bin/shen.js'), 'eval', '-e', '(+ 2 3)'], { cwd: install });
assert.equal(cli.stdout, '5\n');
for (const [profile, flags] of [['ordinary', []], ['sealed', ['--sealed']], ['adaptive', ['--adaptive']], ['combined', ['--sealed', '--adaptive', '--tail-loops']]]) {
  const moduleFile = path.join(install, profile + '.mjs');
  run('build-' + profile, process.execPath, [path.join(pkg, 'bin/yggdrasil-build.js'), path.join(root, 'test/yggdrasil/fixtures/fib'), moduleFile, '--module', ...flags]);
  const code = `import $ from ${JSON.stringify(pathToFileURL(moduleFile).href)};
if (await $.caller('fib')(10) !== 55) throw new Error('packed AOT caller');
if ($.valueOf('*port*') !== ${JSON.stringify(metadata.version)}) throw new Error('packed port version');
console.log('PACKED_AOT_PASS');`;
  const result = run('execute-' + profile, process.execPath, ['--input-type=module', '-e', code], { cwd: install });
  assert.equal(result.stdout, 'fib 20 = 6765\nPACKED_AOT_PASS\n');
}
if (positional[1]) {
  const input = path.resolve(positional[1]);
  const hashes = JSON.parse(fs.readFileSync(path.join(input, 'snapshot.json'), 'utf8'));
  for (const [file, hash] of Object.entries(hashes)) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(input, file))).digest('hex'), hash);
  const artifacts = path.join(out, 'authenticated-applications'); fs.mkdirSync(artifacts);
  for (const name of ['parser', 'rules', 'lists', 'numerical']) {
    const flags = name === 'parser' ? ['--linked', '--adaptive'] : ['--sealed', '--tail-loops', ...(name === 'numerical' ? ['--adaptive'] : [])];
    run('authenticated-build-' + name, process.execPath, [path.join(pkg, 'bin/yggdrasil-build.js'), path.join(input, 'stage1', name), path.join(artifacts, name + '.mjs'), '--module', ...flags]);
    run('authenticated-execute-' + name, process.execPath, [path.join(root, 'benchmarks/aot/worker.js'), artifacts, name, '2', '10']);
  }
}
// Run the real kernel/extension/benchmark suites against the shipped kernel and
// backend. Only fixture/configuration paths continue to point at this checkout.
for (const suite of ['kernel', 'extensions', 'benchmarks']) {
  const source = path.join(root, 'test/kernel/test.' + suite + '.js');
  let code = fs.readFileSync(source, 'utf8').replace(/from '(\.\.[^']+)'/g, (_, target) => `from '${pathToFileURL(path.resolve(path.dirname(source), target)).href}'`);
  for (const name of ['backend', 'kernel', 'config.node']) {
    code = code.replace(pathToFileURL(path.join(root, 'lib', name + '.js')).href, pathToFileURL(path.join(pkg, 'lib', name + '.js')).href);
  }
  const runner = path.join(out, 'installed-' + suite + '.mjs'); fs.writeFileSync(runner, code);
  run('installed-' + suite, process.execPath, [runner]);
}
fs.writeFileSync(path.join(out, 'identity.json'), JSON.stringify({ version: metadata.version, tarball: metadata.filename, sha256: createHash('sha256').update(fs.readFileSync(tarball)).digest('hex'), dependencies: installedVersions, benchmarkDependencies: versions, dependencyMode: fresh ? 'fresh' : 'locked', authenticatedApplications: !!positional[1], installedKernelSuites: { kernel: 154, extensions: 123, benchmarks: 29 } }, null, 2) + '\n');
console.log('PACKAGED_AOT PASS');
