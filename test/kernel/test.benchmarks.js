// Upstream 9693dc6 operation/call-composition coverage, without timed loops.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import backend from '../../lib/backend.js';
import kernel from '../../lib/kernel.js';
import config from '../../scripts/config.js';

class InStream {
  constructor(buffer) { this.buffer = buffer; this.pos = 0; }
  read() { return this.pos >= this.buffer.length ? -1 : this.buffer[this.pos++]; }
  close() {}
}
class OutStream {
  write(byte) { return byte; }
  close() {}
}
const $ = await kernel(backend({
  InStream, OutStream, stoutput: new OutStream(),
  openRead: p => new InStream(fs.readFileSync(p))
}));
const call = (name, ...args) => $.settle($.lookup(name).f(...args));
// The upstream harness defines its own `power`; this port boots StLib, which
// already protects that name. Allow only this fixture's replacement, in this
// isolated process, while leaving the vendored benchmark source untouched.
const properties = $.valueOf('*property-vector*');
const external = await call('get', $.s`shen`, $.s`shen.external-symbols`, properties);
await call('put', $.s`shen`, $.s`shen.external-symbols`,
  $.toList($.toArray(external).filter(name => name !== $.s`power`)), properties);
await call('cd', path.resolve(config.kernelPath));
await call('load', 'tests/benchmark-coverage.shen');
assert.equal(await call('benchmark-coverage.run'), $.s`benchmark-coverage-ok`);
console.log('BENCHMARK_COVERAGE PASS 29');
