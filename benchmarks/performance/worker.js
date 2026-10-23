// Full Shen applications and certification suite, with separate stage clocks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PerformanceObserver } from 'node:perf_hooks';

const [variant, app] = process.argv.slice(2);
const root = path.resolve(variant);
const gc = [];
const observer = new PerformanceObserver(list => gc.push(...list.getEntries().map(e => ({ kind: e.detail.kind, start_ms: e.startTime, duration_ms: e.duration }))));
observer.observe({ entryTypes: ['gc'] });
const stage = async (name, f) => {
  const cpu = process.cpuUsage(), start = process.hrtime.bigint(), heap = process.memoryUsage(), start_ms = performance.now();
  const value = await f();
  const elapsed = process.cpuUsage(cpu), after = process.memoryUsage();
  console.log('STAGE ' + JSON.stringify({ name, start_ms, end_ms: performance.now(), wall_ns: Number(process.hrtime.bigint() - start), cpu_us: elapsed.user + elapsed.system, heap_used_delta: after.heapUsed - heap.heapUsed, rss: after.rss }));
  return value;
};
const { default: backend } = await import(pathToFileURL(path.join(root, 'lib/backend.js')));
const { default: kernel } = await import(pathToFileURL(path.join(root, 'lib/kernel.js')));
class InStream {
  constructor(buffer) { this.buffer = buffer; this.pos = 0; }
  read() { return this.pos >= this.buffer.length ? -1 : this.buffer[this.pos++]; }
  close() {}
}
class OutStream {
  constructor() { this.buffer = []; }
  write(byte) { this.buffer.push(byte); return byte; }
  close() {}
  text() { return Buffer.from(this.buffer).toString('utf8'); }
}
const output = new OutStream();
const $ = await stage('bootstrap', () => kernel(backend({ InStream, OutStream, openRead: p => new InStream(fs.readFileSync(p)), stoutput: output })));
const { s, settle, lookup, toList, toListTree, toArrayTree, valueOf } = $;
const call = (name, ...args) => settle(lookup(name).f(...args));
$.defun('y-or-n?', _ => s`true`);
const canonical = x => typeof x === 'symbol' ? Symbol.keyFor(x) : Array.isArray(x) ? x.map(canonical) : x;
console.log('READY');
if (app === 'suite') {
  await stage('suite', async () => {
    await call('cd', path.join(root, 'kernel/tests'));
    await call('load', 'harness.shen');
    await call('load', 'kerneltests.shen');
  });
  const log = output.text();
  const count = tag => Number([...log.matchAll(new RegExp(tag + ' \\.\\.\\. (\\d+)', 'g'))].at(-1)?.[1]);
  assert.equal(count('passed'), 154); assert.equal(count('failed'), 0);
  console.log('COMPLETE_SUITE ' + JSON.stringify(log));
} else {
  await call('tc', s`-`); $.assign('*cf.effects*', null); $.assign('*hush*', s`true`);
  const file = app === 'interpreter' ? 'interpreter.shen' : 'c-minus.shen';
  await stage('load', async () => {
    await call('load', path.join(root, 'kernel/tests', file));
    await call('load', path.resolve('benchmarks/performance', `${app}-main.shen`));
  });
  const input = 'main () { int x; ' + Array.from({ length: 30 }, (_, i) => `x = (x + ${i + 1}); `).join('') + 'return x; };';
  const expected = app === 'interpreter' ? 100 : [[], ['main', [], ['compound', ['declare', 'int', ['x']], ...Array.from({ length: 30 }, (_, i) => ['assign', 'x', ['+', 'x', i + 1]]), ['return', 'x']]]];
  const request = () => app === 'interpreter' ? call('cf.interpreter-request', 100) : call('cf.cminus-request', toList([...input]));
  const check = result => assert.deepEqual(canonical(toArrayTree(result)), expected);
  const result = await stage('first', request); check(result);
  console.log('RESULT ' + JSON.stringify(canonical(toArrayTree(result))));
  await stage('persistent-50', async () => { for (let i = 0; i < 50; i++) check(await request()); });
  const type = app === 'interpreter' ? s`l-formula` : s`statement`;
  const term = app === 'interpreter' ? 1 : toListTree([s`cons`, s`return`, [s`cons`, 1, []]]);
  await stage('typechecking-100', async () => { for (let i = 0; i < 100; i++) assert.equal(await call('shen.typecheck', term, type), type); });
  assert.deepEqual(canonical(toArrayTree(valueOf('*cf.effects*'))), [app]);
  assert.equal(await call('cf.binding-caller', 5), 6);
  await $.evalKl([s`defun`, s`cf.rebinding`, [s`X`], [s`+`, s`X`, 100]]);
  assert.equal(await call('cf.binding-caller', 5), 105);
}
await new Promise(resolve => setImmediate(resolve));
await new Promise(resolve => setImmediate(resolve));
observer.disconnect();
console.log('GC ' + JSON.stringify(gc));
console.log('PASS ' + app);
