// Execute builder profiles and linked future compilation on both qualified hosts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../../', import.meta.url));
if (process.argv.length !== 3) throw new Error('Usage: test.optimizers.js NEW_EVIDENCE_DIRECTORY');
const out = path.resolve(process.argv[2]); fs.mkdirSync(out);
const shake = path.join(out, 'shake'); fs.mkdirSync(shake);
const manifest = 'manifest-version=4\nkernel-version=43.1\nkernel=kernel.kl\ninit=shen.initialise\nuser=app.kl\nneeds-eval=false\n';
fs.writeFileSync(path.join(shake, 'yggdrasil.manifest.txt'), manifest);
fs.writeFileSync(path.join(shake, 'kernel.kl'), '(defun low (X) (+ 1 X))');
fs.writeFileSync(path.join(shake, 'app.kl'), '(defun sum (N X) (if (= N 0) X (sum (- N 1) (+ N X)))) (defun f (X) (+ 1 (host X))) (defun g (X) (+ 1 (f X)))');
const run = (name, engine, args) => {
  const result = spawnSync(engine, args, { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 8388608 });
  fs.writeFileSync(path.join(out, name + '.stdout'), result.stdout || ''); fs.writeFileSync(path.join(out, name + '.stderr'), result.stderr || '');
  assert.equal(result.status, 0, result.stderr); assert.equal(result.error, undefined); return result;
};
for (const [profile, flags] of [['adaptive', ['--adaptive']], ['tail', ['--sealed', '--no-direct', '--tail-loops']], ['combined', ['--sealed', '--adaptive', '--tail-loops']]]) {
  for (const mode of ['self', 'linked', 'web']) {
    const name = profile + '-' + mode, file = path.join(out, name + '.mjs');
    run(name + '-build', process.execPath, ['bin/yggdrasil-build.js', shake, file, ...flags, ...(mode === 'web' ? ['--web'] : ['--module', ...(mode === 'linked' ? ['--linked'] : [])])]);
    const report = JSON.parse(fs.readFileSync(file + '.analysis.json', 'utf8'));
    if (profile !== 'adaptive') assert.equal(report.emitted.tailLoops, 1);
    if (profile !== 'tail') assert.equal(report.adaptiveStats.functions, 2);
    const code = `import $ from ${JSON.stringify(pathToFileURL(file).href)};
      const assert = (test, message) => { if (!test) throw new Error(message); };
      assert(await $.caller('sum')(100000, 0) === 5000050000, 'deep loop');
      $.defun('host', async x => x + 1); assert(await $.caller('g')(2) === 5, 'real suspension');
      $.defun('host', x => x * 2); assert(await $.caller('g')(2) === 6, 'rebind');
      assert($.lookup('g').f(2) instanceof Promise, 'public async ABI'); console.log('OPTIMIZER_PASS');`;
    for (const engine of (process.env.AOT_TEST_ENGINES || 'node,bun').split(',')) assert.equal(run(name + '-' + engine, engine, ['--input-type=module', '-e', code]).stdout, 'OPTIMIZER_PASS\n');
    if (mode === 'web') assert.ok(!/from ['"]node:|process\.|Deno\./.test(fs.readFileSync(file, 'utf8')), 'browser-safe source');
  }
}
fs.writeFileSync(path.join(shake, 'yggdrasil.manifest.txt'), manifest.replace('needs-eval=false', 'needs-eval=true'));
const file = path.join(out, 'dynamic.mjs');
run('dynamic-build', process.execPath, ['bin/yggdrasil-build.js', shake, file, '--module', '--linked', '--adaptive']);
const future = `import $ from ${JSON.stringify(pathToFileURL(file).href)};
  $.defun('host', x => x);
  await $.evalKl($.toListTree([Symbol.for('defun'), Symbol.for('f'), [Symbol.for('X')], [Symbol.for('+'), 10, [Symbol.for('host'), Symbol.for('X')]]]));
  if (await $.caller('g')(2) !== 13 || !($.lookup('f').f(2) instanceof Promise)) throw new Error('future eval');
  console.log('FUTURE_PASS');`;
for (const engine of (process.env.AOT_TEST_ENGINES || 'node,bun').split(',')) assert.equal(run('dynamic-' + engine, engine, ['--input-type=module', '-e', future]).stdout, 'FUTURE_PASS\n');
console.log('AOT_OPTIMIZERS PASS');
