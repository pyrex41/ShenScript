// Port-authored test suite (NOT part of the canonical Shen kernel suite).
//
// Mirrors shen-go's kl/primitives_coverage_test.go: drives the primitive
// surface through eval (arithmetic incl. floats, list ops, type predicates,
// string ops, logic, global value/set, vector round trip) plus the extra
// coverage shen-go added — uninitialized vector slots, the native hash, and
// the char-stream predicates.
//
// Run through the full kernel (createShen) so the real KL definitions of
// integer?/variable?/hash/etc. are present.
//
// Divergences from shen-go noted inline:
//   - an uninitialized absvector slot reads back as JS null (ShenScript's
//     empty-list / nil), not shen-go's special `undefined` object.
//   - shen.char-stinput? is false for ShenScript's FileInStream (byte-based,
//     no readString), and shen.char-stoutput? is true for FileOutStream
//     (it has writeString). These mirror the stream classes' method shapes.
import { equal, ok } from 'node:assert';
import forEach from 'mocha-each';
import { createShen } from '../../lib/shen.node.js';
import { FileInStream, FileOutStream, stdStreamOptions } from '../../lib/streams.node.js';

describe('primitives coverage (port-authored, mirrors shen-go primitives_coverage)', () => {
  let $;
  let exec;
  let sh;

  before(async () => {
    $ = await createShen(stdStreamOptions());
    const ev = $.caller('eval');
    const parse = $.caller('read-from-string');
    const str = $.caller('str');
    exec = async source => {
      const forms = $.toArray(await parse(source));
      let result;
      for (const form of forms) {
        result = await ev(form);
      }
      return result;
    };
    sh = async source => $.asString(await str(await exec(source)));
  });

  describe('primitives via eval', () => {
    const cases = [
      // arithmetic
      ['subtract int', '(- 5 3)', '2'],
      ['subtract float', '(- 5.5 2.0)', '3.5'],
      ['multiply int', '(* 6 7)', '42'],
      ['multiply float', '(* 1.5 3.0)', '4.5'],
      ['divide whole', '(/ 20 4)', '5'],
      ['divide fractional', '(/ 7 2)', '3.5'],
      // type predicates
      ['number? yes', '(number? 42)', 'true'],
      ['number? no', '(number? foo)', 'false'],
      ['string? yes', '(string? "hi")', 'true'],
      ['string? no', '(string? 1)', 'false'],
      ['symbol? yes', '(symbol? hello)', 'true'],
      ['symbol? no', '(symbol? 1)', 'false'],
      ['variable? upper', '(variable? X)', 'true'],
      ['variable? lower', '(variable? x)', 'false'],
      ['integer? yes', '(integer? 42)', 'true'],
      ['integer? no', '(integer? 4.5)', 'false'],
      ['cons? yes', '(cons? (cons 1 ()))', 'true'],
      ['cons? no', '(cons? 1)', 'false'],
      ['absvector? yes', '(absvector? (absvector 3))', 'true'],
      ['absvector? no', '(absvector? 1)', 'false'],
      // string ops
      ['string->n', '(string->n "A")', '65'],
      ['n->string', '(n->string 65)', '"A"'],
      ['cn', '(cn "foo" "bar")', '"foobar"'],
      ['tlstr', '(tlstr "hello")', '"ello"'],
      ['pos', '(pos "hello" 1)', '"e"'],
      // logic
      ['not true', '(not true)', 'false'],
      ['not false', '(not false)', 'true'],
      // str renders each atom type
      ['str number', '(str 42)', '"42"'],
      ['str symbol', '(str foo)', '"foo"'],
      ['str bool', '(str true)', '"true"'],
      // global value/set
      ['set then value', '(do (set foo 99) (value foo))', '99'],
      // vector set/get round trip (address-> returns the vector)
      ['vector round trip', '(<-address (address-> (absvector 3) 1 7) 1)', '7'],
    ];

    forEach(cases).it('%s', async (_name, input, want) => {
      equal(want, await sh(input));
    });
  });

  describe('uninitialized vector slots', () => {
    // Divergence: ShenScript fills slots with null (nil), shen-go uses a
    // special `undefined` sentinel object. We pin ShenScript's behavior.
    it('reads back as the empty list (null/nil)', async () => {
      const slot = await exec('(<-address (absvector 3) 0)');
      equal(null, slot);
    });
    forEach([0, 1, 2]).it('slot %s of a fresh vector is empty', async i => {
      equal(null, await exec(`(<-address (absvector 3) ${i})`));
    });
  });

  describe('hash (native)', () => {
    let hash;
    before(() => { hash = $.caller('hash'); });

    it('is deterministic: equal keys hash equal', async () => {
      equal(await hash('session-token-42', 256), await hash('session-token-42', 256));
    });
    it('stays in the kernel bucket-index range [1, K-1]', async () => {
      for (let i = 0; i < 300; i++) {
        const h = await hash('k' + i, 256);
        ok(h >= 1 && h <= 255, `hash ${h} out of [1,255] for key ${i}`);
      }
    });
    it('limit 1 collapses to bucket 1', async () => {
      equal(1, await hash('anything', 1));
    });
    it('spreads distinct keys across multiple buckets (no total collapse)', async () => {
      // Divergence: ShenScript uses the canonical kernel hash (sys.kl:
      // sum of char codes, mod limit), whereas shen-go overrides it with
      // native FNV-1a. The kernel sum-hash clusters when keys share a long
      // common prefix (e.g. "distinct-0".."distinct-99" differ only in the
      // suffix digits), so the bar here is "keys don't all collide into one
      // bucket", not FNV-grade uniformity. Distinct varied keys still spread.
      const seen = new Set();
      for (let i = 0; i < 100; i++) {
        seen.add(await hash('distinct-' + i, 256));
      }
      ok(seen.size >= 10, `keys collapsed: only ${seen.size} buckets for 100 keys`);

      // Keys with more entropy across the whole string spread further.
      const spread = new Set();
      for (let i = 0; i < 100; i++) {
        spread.add(await hash(`key-${i}-${i * 7}-${(i * 31) % 97}`, 256));
      }
      ok(spread.size >= 40, `poor distribution on varied keys: ${spread.size} buckets`);
    });
  });

  describe('char-stream predicates', () => {
    // Divergence pinned: FileOutStream has writeString -> char-stoutput? true;
    // FileInStream is byte-based (no readString) -> char-stinput? false.
    it('shen.char-stoutput? is true for a (writeString-capable) FileOutStream', async () => {
      const p = `${process.cwd()}/.ss-charout-${process.pid}.tmp`;
      const out = new FileOutStream(p);
      try {
        equal($.s`true`, await $.settle($.lookup('shen.char-stoutput?').f(out)));
      } finally {
        out.close();
        const fs = await import('node:fs');
        fs.rmSync(p, { force: true });
      }
    });
    it('shen.char-stinput? is false for a (byte-based) FileInStream', async () => {
      const fs = await import('node:fs');
      const p = `${process.cwd()}/.ss-charin-${process.pid}.tmp`;
      fs.writeFileSync(p, 'x');
      const inn = new FileInStream(p);
      try {
        equal($.s`false`, await $.settle($.lookup('shen.char-stinput?').f(inn)));
      } finally {
        inn.close();
        fs.rmSync(p, { force: true });
      }
    });
  });
});
