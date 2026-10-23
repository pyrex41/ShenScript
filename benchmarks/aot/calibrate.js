// Choose fixed request counts before comparing compiler candidates.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

if (process.argv.length !== 4) throw new Error('Usage: calibrate.js ARTIFACT_DIRECTORY NEW_OUTPUT_DIRECTORY');
const root = fileURLToPath(new URL('../../', import.meta.url));
const artifacts = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
fs.mkdirSync(out, { recursive: false });
const counts = {}, receipts = [];
for (const engine of ['node', 'bun']) {
  counts[engine] = {};
  for (const name of ['parser', 'rules', 'lists', 'numerical']) {
    let count = 10;
    for (let attempt = 0; attempt < 3; attempt++) {
      const prefix = path.join(out, `${engine}-${name}-${attempt}`);
      const result = spawnSync(engine, [path.join(root, 'benchmarks/aot/worker.js'), artifacts, name, String(count)], {
        cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 8388608,
        env: { ...process.env, AOT_PROMISES: '', AOT_CPU_PROFILE: '' }
      });
      fs.writeFileSync(prefix + '.stdout', result.stdout || ''); fs.writeFileSync(prefix + '.stderr', result.stderr || '');
      if (result.error || result.status !== 0 || !result.stdout.trimEnd().split('\n').at(-1).startsWith('PASS ')) throw result.error || new Error('Calibration failed: ' + prefix);
      const stage = JSON.parse(result.stdout.split('\n').find(x => x.startsWith('STAGE ') && JSON.parse(x.slice(6)).name === 'persistent').slice(6));
      receipts.push({ engine, app: name, attempt, count, ...stage });
      if (stage.wall_ns >= 1e9 && stage.wall_ns <= 5e9) break;
      if (attempt < 2) count = Math.max(1, Math.min(1000000, Math.round(count * 2e9 / stage.wall_ns)));
    }
    counts[engine][name] = count;
    console.log('AOT_CALIBRATED', engine, name, count);
  }
}
fs.writeFileSync(path.join(out, 'counts.json'), JSON.stringify(counts, null, 2) + '\n');
fs.writeFileSync(path.join(out, 'pilots.json'), JSON.stringify(receipts, null, 2) + '\n');
