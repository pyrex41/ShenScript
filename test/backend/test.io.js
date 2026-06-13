// Port-authored test suite (NOT part of the canonical Shen kernel suite).
//
// Mirrors shen-go's kl/io_coverage_test.go: open/close, get-time (run + unix),
// load-file side effects, and the file-read primitives. Exercised through the
// full kernel (createShen) so the real KL definitions run, with the Node file
// stream options wired in.
import { equal, ok } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createShen } from '../../lib/shen.node.js';
import { stdStreamOptions } from '../../lib/streams.node.js';

describe('io (port-authored, mirrors shen-go io_coverage)', () => {
  let $;
  let exec;
  let str;

  before(async () => {
    $ = await createShen(stdStreamOptions());
    const ev = $.caller('eval');
    const parse = $.caller('read-from-string');
    str = $.caller('str');
    exec = async source => {
      const forms = $.toArray(await parse(source));
      let result;
      for (const form of forms) {
        result = await ev(form);
      }
      return result;
    };
  });

  const tmp = label => path.join(os.tmpdir(), `ss-io-${label}-${process.pid}-${Date.now()}`);
  const sh = async source => $.asString(await str(await exec(source)));

  describe('open / write-byte / read-byte / close', () => {
    it('round trips bytes through a file, EOF reads -1', async () => {
      const p = tmp('rt.bin');
      await exec(`(let S (open "${p}" out) (do (write-byte 72 S) (do (write-byte 105 S) (close S))))`);
      const list = await exec(
        `(let S (open "${p}" in)
           (let A (read-byte S)
             (let B (read-byte S)
               (let C (read-byte S)
                 (do (close S) (cons A (cons B (cons C ()))))))))`);
      const bytes = [];
      for (let c = list; $.isCons(c); c = c.tail) {
        bytes.push(c.head);
      }
      // 72='H', 105='i', then EOF=-1
      equal('72,105,-1', bytes.join(','));
    });
  });

  describe('read-file primitives', () => {
    it('read-file-as-string returns the file contents', async () => {
      const p = tmp('data.txt');
      fs.writeFileSync(p, 'AB');
      equal('"AB"', await sh(`(read-file-as-string "${p}")`));
    });
    it('read-file-as-bytelist returns the byte codes', async () => {
      const p = tmp('bytes.txt');
      fs.writeFileSync(p, 'AB'); // 65, 66
      const list = await exec(`(read-file-as-bytelist "${p}")`);
      const bytes = [];
      for (let c = list; $.isCons(c); c = c.tail) {
        bytes.push(c.head);
      }
      equal('65,66', bytes.join(','));
    });
  });

  describe('get-time', () => {
    it('returns a number for both unix and run', async () => {
      ok($.isNumber(await exec('(get-time unix)')), 'get-time unix should be a number');
      ok($.isNumber(await exec('(get-time run)')), 'get-time run should be a number');
    });
    it('unix clock is a plausible wall-clock value', async () => {
      const t = await exec('(get-time unix)');
      // After 2020-01-01 (1577836800) — guards against a zero/garbage clock.
      ok(t > 1577836800, `expected a recent unix timestamp, got ${t}`);
    });
  });

  describe('load-file', () => {
    it('evaluates each top-level form for its side effects', async () => {
      const p = tmp('snippet.shen');
      fs.writeFileSync(p, '(set loaded-marker 123)\n');
      await exec(`(load "${p}")`);
      equal('123', await sh('(value loaded-marker)'));
    });
  });
});
