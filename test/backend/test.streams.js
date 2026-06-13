// Port-authored test suite (NOT part of the canonical Shen kernel suite).
//
// Regression guard for the read-byte async-hang fixed in 4c03a96
// ("Fix file I/O for stage-1 hosting: settle read-byte, sync file streams").
//
// The bug: read-byte inlines to stream.read(); NodeInStream.read() is async,
// so the byte flowing into (= -1 byte) comparisons and trampoline arguments
// was an unsettled Promise. EOF never matched -1, and read-file-as-bytelist
// looped forever consing promises. The kernel certification suite never saw it
// because its fixture streams are synchronous.
//
// These tests exercise BOTH stream flavors:
//   - FileInStream / FileOutStream (sync) — the file I/O write->read round trip
//     and read-file-as-bytelist termination, with EOF returning -1.
//   - an async byte stream (the NodeInStream shape) — read-byte must settle to
//     a Number, never a Promise, and must reach -1 at EOF.
//
// If 4c03a96 were reverted (read-byte no longer maybe-awaits async reads, or
// file streams went back to async fs.createWriteStream), the async EOF assert
// and the read-file-as-bytelist termination would fail / hang here.
import { equal, ok } from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import { createShen } from '../../lib/shen.node.js';
import { FileInStream, FileOutStream, stdStreamOptions } from '../../lib/streams.node.js';

// A minimal async input stream with the same contract as NodeInStream
// (incremental stdin): read() returns a Promise that resolves to the next
// byte, or -1 at EOF, and sets `eof` once exhausted.
class AsyncByteStream {
  constructor(bytes) {
    this.bytes = bytes;
    this.pos = 0;
    this.eof = false;
  }
  async read() {
    await Promise.resolve(); // force a real microtask hop, like the real stream
    return this.pos >= this.bytes.length ? (this.eof = true, -1) : this.bytes[this.pos++];
  }
  close() { return null; }
}

describe('streams (port-authored regression for 4c03a96)', () => {
  let $;
  let tmpdir;

  before(async () => {
    const options = stdStreamOptions();
    const baseIsIn = options.isInStream;
    // Teach the recognizer about our async test stream so read-byte's
    // InStream-typed inline accepts it.
    options.isInStream = x => x instanceof AsyncByteStream || baseIsIn(x);
    $ = await createShen(options);
    tmpdir = os.tmpdir();
  });

  const f = name => $.lookup(name).f;
  const settle = x => $.settle(x);
  const tmp = label => path.join(tmpdir, `ss-streams-${label}-${process.pid}-${Date.now()}.bin`);

  describe('sync file streams', () => {
    it('write-byte -> close -> read-byte round trips, EOF returns -1', async () => {
      const p = tmp('roundtrip');
      const out = f('open')(p, $.s`out`);
      await settle(f('write-byte')(72, out));  // 'H'
      await settle(f('write-byte')(105, out)); // 'i'
      out.close();

      const inn = f('open')(p, $.s`in`);
      equal(72, await settle(f('read-byte')(inn)));
      equal(105, await settle(f('read-byte')(inn)));
      // EOF must be the integer -1, not a Promise and not undefined.
      const eofByte = await settle(f('read-byte')(inn));
      equal(-1, eofByte);
      equal('number', typeof eofByte);
      inn.close();
    });

    it('FileOutStream flushes synchronously: file is on disk after close()', () => {
      const p = tmp('flush');
      const out = new FileOutStream(p);
      out.writeString('payload');
      out.close();
      // A fresh sync read sees the bytes immediately (the contract the
      // ratatoskr bootstrap depends on: write a file, read it right back).
      const inn = new FileInStream(p);
      const bytes = [];
      for (let b = inn.read(); b !== -1; b = inn.read()) {
        bytes.push(b);
      }
      equal('payload', String.fromCharCode(...bytes));
    });

    it('read-file-as-bytelist terminates and yields the file bytes', async () => {
      const p = tmp('bytelist');
      const out = f('open')(p, $.s`out`);
      for (const b of [65, 66, 67]) { // ABC
        await settle(f('write-byte')(b, out));
      }
      out.close();

      // If read-byte leaked an unsettled Promise this call would spin forever
      // consing promises; the test timeout would fire instead of passing.
      const list = await settle(f('read-file-as-bytelist')(p));
      // Walk the cons list explicitly rather than relying on str's rendering.
      const bytes = [];
      for (let c = list; $.isCons(c); c = c.tail) {
        bytes.push(c.head);
      }
      equal('65,66,67', bytes.join(','));
    });

    it('FileInStream read() returns -1 at EOF synchronously', () => {
      const p = tmp('eof');
      const out = new FileOutStream(p);
      out.writeString('x');
      out.close();
      const inn = new FileInStream(p);
      equal(120, inn.read()); // 'x'
      equal(-1, inn.read());
      equal(-1, inn.read()); // stays at EOF
    });
  });

  describe('async incremental streams (the NodeInStream shape)', () => {
    it('read-byte settles to a Number on every read, never a Promise', async () => {
      const stream = new AsyncByteStream([65, 66]);
      const a = await settle(f('read-byte')(stream));
      const b = await settle(f('read-byte')(stream));
      equal(65, a);
      equal(66, b);
      equal('number', typeof a);
      equal('number', typeof b);
    });

    it('read-byte reaches -1 at EOF on an async stream and sets eof', async () => {
      const stream = new AsyncByteStream([65]);
      await settle(f('read-byte')(stream)); // consume the one byte
      const eofByte = await settle(f('read-byte')(stream));
      equal(-1, eofByte);
      equal('number', typeof eofByte);
      ok(stream.eof, 'async stream should report eof after a -1 read');
    });
  });
});
