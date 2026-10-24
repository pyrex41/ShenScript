// Stage-2 profile integration: scope facts, load order and mutation enforcement.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../../', import.meta.url));
if (process.argv.length !== 3) throw new Error('Usage: test.sealed.js NEW_EVIDENCE_DIRECTORY');
const out = path.resolve(process.argv[2]); fs.mkdirSync(out, { recursive: false });
const shake = path.join(out, 'shake'); fs.mkdirSync(shake);
const manifest = ['manifest-version=4', 'kernel-version=43.1', 'kernel=kernel.kl', 'init=shen.initialise', 'user=app.kl', 'needs-eval=false'].join('\n') + '\n';
fs.writeFileSync(path.join(shake, 'yggdrasil.manifest.txt'), manifest);
fs.writeFileSync(path.join(shake, 'kernel.kl'), '(defun low (X) (+ X 1))\n');
fs.writeFileSync(path.join(shake, 'app.kl'), `(defun f (X) (+ X 1))
(set before (f 1))
(defun f (X) (+ X 2))
(set after (f 1))
(defun head (X) (+ (low X) 1))
(defun shadow (low) (low 5))
`);
const run = (label, args, engine = process.execPath, status = 0) => {
  const result = spawnSync(engine, args, { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 8388608 });
  fs.writeFileSync(path.join(out, label + '.stdout'), result.stdout || ''); fs.writeFileSync(path.join(out, label + '.stderr'), result.stderr || '');
  assert.equal(result.status, status, result.stderr); assert.equal(result.error, undefined);
  return result;
};
const builder = path.join(root, 'bin/yggdrasil-build.js');
const plain = path.join(out, 'ordinary.mjs');
run('ordinary', [builder, shake, plain, '--module']); const original = fs.readFileSync(plain, 'utf8');
run('analysis', [builder, shake, plain, '--module', '--analyze']); assert.equal(fs.readFileSync(plain, 'utf8'), original);
const report = JSON.parse(fs.readFileSync(plain + '.analysis.json', 'utf8'));
assert.equal(report.sealed, false); assert.ok(report.functions.find(x => x.name === 'shadow').calls[0].local);
for (const mode of ['self', 'linked', 'web']) {
  const file = path.join(out, mode + '.mjs');
  run('build-' + mode, [builder, shake, file, '--sealed', ...(mode === 'web' ? ['--web'] : ['--module', ...(mode === 'linked' ? ['--linked'] : [])])]);
  const code = `import $ from ${JSON.stringify(pathToFileURL(file).href)};
    const assert = (ok, message) => { if (!ok) throw new Error(message); };
    assert($.valueOf('before') === 2 && $.valueOf('after') === 3, 'top-level order');
    assert(await $.caller('head')(1) === 3, 'head');
    assert(await $.caller('shadow')($.fun(x => x * 2)) === 10, 'lexical shadow');
    $.defun('f', x => x + 100); assert(await $.caller('f')(1) === 101, 'duplicate fallback');
    let rejected = 0;
    try { $.defun('low', x => x); } catch { rejected++; }
    try { $.lookup('low').f = x => x; } catch { rejected++; }
    try { $.globals.delete('low'); } catch { rejected++; }
    assert(rejected === 3, 'binding guard'); console.log('SEALED_PASS');`;
  for (const engine of (process.env.AOT_TEST_ENGINES || 'node,bun').split(',')) assert.equal(run(mode + '-' + engine, ['--input-type=module', '-e', code], engine).stdout, 'SEALED_PASS\n');
}
fs.writeFileSync(path.join(shake, 'yggdrasil.manifest.txt'), manifest.replace('needs-eval=false', 'needs-eval=true'));
run('eval-refusal', [builder, shake, path.join(out, 'refused.mjs'), '--sealed', '--linked'], process.execPath, 1);
console.log('SEALED_PROFILE PASS');
