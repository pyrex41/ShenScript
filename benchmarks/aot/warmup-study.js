import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
if (process.argv.length !== 5) throw new Error('Usage: warmup-study.js ARTIFACTS COUNTS_JSON NEW_OUTPUT');
const root = fileURLToPath(new URL('../../', import.meta.url)), artifacts = path.resolve(process.argv[2]), counts = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')), out = path.resolve(process.argv[4]);
fs.mkdirSync(out, { recursive: false });
const rows = [];
for (const [engine, apps] of Object.entries(counts)) for (const [app, count] of Object.entries(apps)) for (const warmup of [10, 100, 1000]) {
  const prefix = path.join(out, `${engine}-${app}-${warmup}`);
  const result = spawnSync(engine, [path.join(root, 'benchmarks/aot/worker.js'), artifacts, app, String(count), String(warmup)], {
    cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 8388608,
    env: { ...process.env, AOT_PROMISES: '', AOT_CPU_PROFILE: '' }
  });
  fs.writeFileSync(prefix + '.stdout', result.stdout || ''); fs.writeFileSync(prefix + '.stderr', result.stderr || '');
  if (result.error || result.status !== 0 || !result.stdout.trimEnd().split('\n').at(-1).startsWith('PASS ')) throw result.error || new Error('Warmup study failed');
  const stages = result.stdout.split('\n').filter(x => x.startsWith('STAGE ')).map(x => JSON.parse(x.slice(6)));
  rows.push({ engine, app, count, warmup, stages });
  console.log('AOT_WARMUP', engine, app, warmup);
}
fs.writeFileSync(path.join(out, 'rows.json'), JSON.stringify(rows, null, 2) + '\n');
