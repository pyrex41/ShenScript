// Diagnostic resource counts, separate from uninstrumented timing trials.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

if (process.argv.length !== 4) throw new Error('Usage: profile-promises.js BASELINE NEW_OUTPUT_DIRECTORY');
const root = fileURLToPath(new URL('../../', import.meta.url));
const baseline = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
fs.mkdirSync(out, { recursive: false });
let worker = fs.readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
const before = '  const value = await f();';
if (!worker.includes(before)) throw new Error('worker stage template changed');
worker = "import { createHook } from 'node:async_hooks';\n" + worker;
worker = worker.replace('const gc = [];', `const gc = [];
let resourcePhase = 'outside';
const resources = Object.create(null);
const resourceHook = createHook({ init(_id, type) {
  if (type === 'PROMISE') resources[resourcePhase] = (resources[resourcePhase] || 0) + 1;
} });
resourceHook.enable();`);
worker = worker.replace(before, `  const previous = resourcePhase; resourcePhase = name;
  let value;
  try { value = await f(); } finally { resourcePhase = previous; }`);
worker = worker.replace("console.log('PASS ' + app);", `resourceHook.disable();
fs.writeFileSync(process.env.SS_RESOURCES_OUTPUT, JSON.stringify(resources, null, 2) + '\\n');
console.log('PASS ' + app);`);
const file = path.join(out, 'resource-worker.js'); fs.writeFileSync(file, worker);
for (const app of ['interpreter', 'cminus', 'suite']) {
  for (const [variant, directory] of [['baseline', baseline], ['candidate', root]]) {
    const prefix = path.join(out, variant + '-' + app);
    const result = spawnSync(process.execPath, [file, directory, app], {
      cwd: root, env: { ...process.env, SS_RESOURCES_OUTPUT: prefix + '.json' },
      timeout: 120000, maxBuffer: 4194304, encoding: 'utf8'
    });
    fs.writeFileSync(prefix + '.stdout', result.stdout || '');
    fs.writeFileSync(prefix + '.stderr', result.stderr || '');
    if (result.error || result.status !== 0 || !result.stdout.trimEnd().endsWith('PASS ' + app)) {
      throw result.error || new Error(`Resource profile failed: ${variant} ${app}`);
    }
    console.log('PROMISE_RESOURCES PASS', variant, app);
  }
}
