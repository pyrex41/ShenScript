// Reuse authenticated shakes when comparing stage-2 compiler candidates.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../../', import.meta.url));
const [inputText, outText, ...options] = process.argv.slice(2);
const option = options.includes('--sealed'), noDirect = options.includes('--no-direct'), adaptive = options.includes('--adaptive'), tailLoops = options.includes('--tail-loops');
if (!outText || options.some(x => !['--sealed', '--no-direct', '--adaptive', '--tail-loops'].includes(x)) || ((noDirect || tailLoops) && !option)) throw new Error('Usage: compile.js AUTHENTICATED_SNAPSHOT NEW_OUTPUT [--sealed [--no-direct] [--tail-loops]] [--adaptive]');
const input = path.resolve(inputText), out = path.resolve(outText); fs.mkdirSync(out, { recursive: false });
const original = JSON.parse(fs.readFileSync(path.join(input, 'snapshot.json'), 'utf8'));
for (const [file, hash] of Object.entries(original)) if (createHash('sha256').update(fs.readFileSync(path.join(input, file))).digest('hex') !== hash) throw new Error('Input snapshot changed');
fs.cpSync(path.join(input, 'stage1'), path.join(out, 'stage1'), { recursive: true });
fs.copyFileSync(path.join(input, 'inputs.json'), path.join(out, 'inputs.json'));
const rows = [];
for (const name of ['parser', 'rules', 'lists', 'numerical']) {
  const shake = path.join(out, 'stage1', name), manifest = fs.readFileSync(path.join(shake, 'yggdrasil.manifest.txt'), 'utf8');
  const linked = /^needs-eval=true$/m.test(manifest), sealed = !!option && !linked;
  const artifact = path.join(out, name + '.mjs'), start = performance.now();
  for (const [label, args] of [['build', [path.join(root, 'bin/yggdrasil-build.js'), shake, artifact, '--module', ...(linked ? ['--linked'] : []), ...(sealed ? ['--sealed', ...(noDirect ? ['--no-direct'] : []), ...(tailLoops ? ['--tail-loops'] : [])] : []), ...(adaptive ? ['--adaptive'] : [])]],
    ['validate', [path.join(root, 'benchmarks/aot/worker.js'), out, name, '2', '10']]]) {
    const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 8388608 });
    fs.writeFileSync(path.join(out, name + '-' + label + '.stdout'), result.stdout || ''); fs.writeFileSync(path.join(out, name + '-' + label + '.stderr'), result.stderr || '');
    if (result.error || result.status !== 0) throw result.error || new Error('Candidate ' + label + ' failed: ' + name);
  }
  rows.push({ name, linked, sealed, directCalls: sealed && !noDirect, adaptive, tailLoops: sealed && tailLoops, excluded: !!option && linked ? 'manifest requires eval' : null, buildAndValidationMs: performance.now() - start,
    bytes: fs.statSync(artifact).size, artifact: createHash('sha256').update(fs.readFileSync(artifact)).digest('hex') });
  console.log('AOT_COMPILED', name, sealed ? 'sealed' : 'dynamic');
}
fs.writeFileSync(path.join(out, 'generation.json'), JSON.stringify(rows, null, 2) + '\n');
