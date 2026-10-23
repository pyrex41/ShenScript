// Generate authenticated application shakes and stage-2 module artifacts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createShen } from '../../lib/shen.node.js';
import { stdStreamOptions } from '../../lib/streams.node.js';
import { serialize } from './kl.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const names = ['parser', 'rules', 'lists', 'numerical'];
const exporterCommit = '0aa8947e22f54a83cda091d37782c923084c6d66';
if (process.argv.length !== 4) throw new Error('Usage: generate.js EXPORTER_CHECKOUT NEW_OUTPUT_DIRECTORY');
const exporter = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
fs.mkdirSync(out, { recursive: false });
const stage = path.join(out, 'stage1'); fs.mkdirSync(stage); fs.mkdirSync(path.join(stage, 'KLambda'));
const sha = data => createHash('sha256').update(data).digest('hex');
const run = (command, args, options = {}) => {
  const { receipt, ...spawnOptions } = options;
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 8388608, ...spawnOptions });
  if (receipt) {
    fs.writeFileSync(receipt + '.stdout', result.stdout || '');
    fs.writeFileSync(receipt + '.stderr', result.stderr || '');
  }
  if (result.error || result.status !== 0) throw result.error || new Error(result.stderr || 'subprocess failed');
  return result;
};
const exporterSource = run('git', ['-C', exporter, 'show', exporterCommit + ':yggdrasil.shen']).stdout;
const namesKL = run('git', ['-C', exporter, 'ls-tree', '--name-only', exporterCommit, 'KLambda/']).stdout.trim().split('\n').filter(x => x.endsWith('.kl')).map(x => path.basename(x));
const kernelManifest = new Map(fs.readFileSync(path.join(root, 'kernel/klambda/SHA256SUMS'), 'utf8').trim().split('\n').map(line => {
  const [hash, name] = line.split(/\s+/); return [name, hash];
}));
const files = {};
for (const name of namesKL) {
  const data = fs.readFileSync(path.join(root, 'kernel/klambda', name));
  if (sha(data) !== kernelManifest.get(name)) throw new Error('Kernel checksum mismatch: ' + name);
  files['KLambda/' + name] = sha(data); fs.writeFileSync(path.join(stage, 'KLambda', name), data);
}
if (namesKL.length !== 16) throw new Error('Unexpected shake universe');
fs.writeFileSync(path.join(stage, 'yggdrasil.shen'), exporterSource); files['yggdrasil.shen'] = sha(exporterSource);
for (const name of fs.readdirSync(new URL('./sources/', import.meta.url))) {
  const data = fs.readFileSync(new URL('./sources/' + name, import.meta.url));
  fs.writeFileSync(path.join(stage, name), data); files[name] = sha(data);
}
const identity = { exporterCommit, kernelCommit: 'ec16a9fa4fc2e87e2aa336fb1ae30e8ac2266394',
  node: process.version, adapter: sha(fs.readFileSync(new URL('./kl.js', import.meta.url))), files };
fs.writeFileSync(path.join(out, 'inputs.json'), JSON.stringify(identity, null, 2) + '\n');
const $ = await createShen(stdStreamOptions());
$.assign('*hush*', $.s`true`); await $.caller('tc')($.s`-`); await $.caller('cd')(stage);
await $.caller('load')('yggdrasil.shen');
// Both the kernel bootstrap writer and the stage-1 writer require this fix.
$.defun('pr-kl', (expr, sink) => $.caller('pr')(serialize($.toArrayTree(expr)), sink));
$.defun('shen.write-kl', async (forms, sink) => {
  try {
    for (const form of $.toArrayTree(forms)) {
      if (Array.isArray(form) && form.length) await $.caller('pr')(serialize(form) + '\n\n', sink);
    }
  } finally { await $.caller('close')(sink); }
  return null;
});
const receipts = [];
for (const name of names) {
  const directory = path.join(stage, name); fs.mkdirSync(directory);
  let start = performance.now();
  await $.caller('yggdrasil.shake')($.toList([name + '.shen']), name);
  const shakeMs = performance.now() - start;
  const manifest = fs.readFileSync(path.join(directory, 'yggdrasil.manifest.txt'), 'utf8');
  const linked = /^needs-eval=true$/m.test(manifest);
  start = performance.now();
  const result = run(process.execPath, [path.join(root, 'bin/yggdrasil-build.js'), directory, path.join(out, name + '.mjs'), '--module', ...(linked ? ['--linked'] : [])], { receipt: path.join(out, name + '-build') });
  fs.writeFileSync(path.join(out, name + '-build.stdout'), result.stdout);
  fs.writeFileSync(path.join(out, name + '-build.stderr'), result.stderr);
  const buildMs = performance.now() - start;
  const validation = run(process.execPath, [path.join(root, 'benchmarks/aot/worker.js'), out, name, '2'], { receipt: path.join(out, name + '-validation') });
  fs.writeFileSync(path.join(out, name + '-validation.stdout'), validation.stdout);
  fs.writeFileSync(path.join(out, name + '-validation.stderr'), validation.stderr);
  receipts.push({ name, shakeMs, buildMs, linked,
    bytes: fs.statSync(path.join(out, name + '.mjs')).size, artifact: sha(fs.readFileSync(path.join(out, name + '.mjs'))) });
  console.log('AOT_GENERATED', name, linked ? 'linked/eval-capable' : 'self-contained');
}
fs.writeFileSync(path.join(out, 'generation.json'), JSON.stringify(receipts, null, 2) + '\n');
for (const [file, hash] of Object.entries(files)) if (sha(fs.readFileSync(path.join(stage, file))) !== hash) throw new Error('Input changed: ' + file);
