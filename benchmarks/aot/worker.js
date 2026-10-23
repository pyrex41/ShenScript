// Executes only the emitted artifact; never boots a separate full kernel.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PerformanceObserver } from 'node:perf_hooks';
import { application } from './cases.js';

const [directory, name, countText = '10', warmupText = '1000'] = process.argv.slice(2);
const count = Number(countText), warmup = Number(warmupText);
if (!directory || !name || !Number.isSafeInteger(count) || count < 1 || count > 1000000 || !Number.isSafeInteger(warmup) || warmup < 0 || warmup > 10000) throw new Error('Usage: worker.js ARTIFACT_DIRECTORY APP [REQUESTS 1..1000000] [WARMUP 0..10000]');
const collections = [];
const observer = new PerformanceObserver(list => collections.push(...list.getEntries().map(e => ({ kind: e.detail.kind, start_ms: e.startTime, duration_ms: e.duration }))));
observer.observe({ entryTypes: ['gc'] });
let phase = 'outside'; const promises = {};
let cpuSession, cpuPost;
if (process.env.AOT_CPU_PROFILE) {
  const { Session } = await import('node:inspector');
  cpuSession = new Session(); cpuSession.connect();
  cpuPost = (method, params = {}) => new Promise((resolve, reject) => cpuSession.post(method, params, (e, result) => e ? reject(e) : resolve(result)));
}
let hook;
if (process.env.AOT_PROMISES) {
  const { createHook } = await import('node:async_hooks');
  hook = createHook({ init(_id, type) { if (type === 'PROMISE') promises[phase] = (promises[phase] || 0) + 1; } });
  hook.enable();
}
const stage = async (name, body) => {
  const previous = phase; phase = name;
  if (name === 'persistent' && cpuSession) {
    await cpuPost('Profiler.enable'); await cpuPost('Profiler.setSamplingInterval', { interval: 1000 }); await cpuPost('Profiler.start');
  }
  const start_ms = performance.now(), start = process.hrtime.bigint(), cpu = process.cpuUsage(), heap = process.memoryUsage();
  let value;
  try { value = await body(); } finally { phase = previous; }
  const cost = process.cpuUsage(cpu), after = process.memoryUsage();
  console.log('STAGE ' + JSON.stringify({ name, start_ms, end_ms: performance.now(), wall_ns: Number(process.hrtime.bigint() - start), cpu_us: cost.user + cost.system,
    heap_used_delta: after.heapUsed - heap.heapUsed, rss: after.rss }));
  if (name === 'persistent' && cpuSession) {
    const { profile } = await cpuPost('Profiler.stop');
    const fs = await import('node:fs'); fs.writeFileSync(process.env.AOT_CPU_PROFILE, JSON.stringify(profile)); cpuSession.disconnect();
  }
  return value;
};
const { default: $ } = await stage('import', () => import(pathToFileURL(path.resolve(directory, name + '.mjs'))));
console.log('READY ' + JSON.stringify({ uptime_ms: process.uptime() * 1000 }));
const { request, check } = application($, name);
const first = await stage('first', request);
console.log('RESULT ' + JSON.stringify(check(first)));
await stage('warmup-' + warmup, async () => { for (let i = 0; i < warmup; i++) check(await request()); });
await stage('persistent', async () => { for (let i = 0; i < count; i++) check(await request()); });
await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve));
observer.disconnect(); hook?.disable();
console.log('GC ' + JSON.stringify(collections));
if (hook) console.log('PROMISES ' + JSON.stringify(promises));
console.log('PASS ' + JSON.stringify({ name, requests: count, warmup, engine: process.versions.bun ? 'bun' : 'node', version: process.versions.bun || process.version, gc_available: PerformanceObserver.supportedEntryTypes?.includes('gc') || false }));
