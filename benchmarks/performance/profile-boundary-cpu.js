// Sample an uninstrumented application's persistent stage in an owned worker.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
if (process.argv.length !== 3) throw new Error('Usage: profile-boundary-cpu.js NEW_OUTPUT_DIRECTORY');
const out = path.resolve(process.argv[2]);
fs.mkdirSync(out, { recursive: false });
let worker = fs.readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
const before = '  const cpu = process.cpuUsage(), start = process.hrtime.bigint(), heap = process.memoryUsage(), start_ms = performance.now();';
const after = '  return value;\n};';
const requests = 'for (let i = 0; i < 50; i++) check(await request());';
if (!worker.includes(before) || !worker.includes(after) || !worker.includes(requests)) throw new Error('worker stage template changed');
worker = worker.replace(requests, 'for (let i = 0; i < Number(process.env.SS_CPU_REQUESTS); i++) check(await request());');
worker = worker.replaceAll('persistent-50', 'persistent-sampled');
worker = "import inspector from 'node:inspector';\n" + worker;
worker = worker.replace('const gc = [];', `const gc = [];
const cpuSession = new inspector.Session(); cpuSession.connect();
const cpuPost = (method, params = {}) => new Promise((resolve, reject) => cpuSession.post(method, params, (e, result) => e ? reject(e) : resolve(result)));`);
worker = worker.replace(before, `  if (name === 'persistent-sampled') {
    await cpuPost('Profiler.enable');
    await cpuPost('Profiler.setSamplingInterval', { interval: 1000 });
    await cpuPost('Profiler.start');
  }
${before}`);
worker = worker.replace(after, `  if (name === 'persistent-sampled') {
    const { profile } = await cpuPost('Profiler.stop');
    fs.writeFileSync(process.env.SS_CPU_OUTPUT, JSON.stringify(profile));
    cpuSession.disconnect();
  }
${after}`);
const file = path.join(out, 'cpu-worker.js'); fs.writeFileSync(file, worker);
for (const app of ['interpreter', 'cminus']) {
  const result = spawnSync(process.execPath, [file, root, app], {
    cwd: root, env: { ...process.env, SS_CPU_OUTPUT: path.join(out, app + '.cpuprofile'), SS_CPU_REQUESTS: app === 'interpreter' ? '5000' : '1000' },
    timeout: 60000, maxBuffer: 4194304, encoding: 'utf8'
  });
  fs.writeFileSync(path.join(out, app + '.stdout'), result.stdout || '');
  fs.writeFileSync(path.join(out, app + '.stderr'), result.stderr || '');
  if (result.error || result.status !== 0 || !result.stdout.trimEnd().endsWith('PASS ' + app)) {
    throw result.error || new Error(`CPU profile failed: ${app}`);
  }
  console.log('UNINSTRUMENTED_STAGE_CPU PASS', app);
}
