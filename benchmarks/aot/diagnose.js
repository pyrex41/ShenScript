// Separate Node sampling and Promise-resource runs; never used as speed trials.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

if (process.argv.length !== 5) throw new Error('Usage: diagnose.js ARTIFACT_DIRECTORY COUNTS_JSON NEW_OUTPUT_DIRECTORY');
const root = fileURLToPath(new URL('../../', import.meta.url));
const artifacts = path.resolve(process.argv[2]), counts = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')).node, out = path.resolve(process.argv[4]);
fs.mkdirSync(out, { recursive: false });
for (const [name, count] of Object.entries(counts)) {
  for (const mode of ['cpu', 'promises']) {
    const prefix = path.join(out, name + '-' + mode);
    const result = spawnSync('node', [path.join(root, 'benchmarks/aot/worker.js'), artifacts, name, String(mode === 'cpu' ? count : Math.min(count, 100))], {
      cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 8388608,
      env: { ...process.env, AOT_CPU_PROFILE: mode === 'cpu' ? prefix + '.cpuprofile' : '', AOT_PROMISES: mode === 'promises' ? '1' : '' }
    });
    fs.writeFileSync(prefix + '.stdout', result.stdout || ''); fs.writeFileSync(prefix + '.stderr', result.stderr || '');
    if (result.error || result.status !== 0 || !result.stdout.trimEnd().split('\n').at(-1).startsWith('PASS ')) throw result.error || new Error('Diagnostic failed: ' + prefix);
    console.log('AOT_DIAGNOSED', name, mode);
  }
}
