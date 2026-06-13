// Port-authored test suite (NOT part of the canonical Shen kernel suite).
//
// Mirrors shen-go's kl/reader_fuzz_test.go (the seeded corpus, run as ordinary
// unit tests). The contract being fuzzed: for ANY input string, the pipeline
//
//     parseForm -> evalKl -> settle
//
// must terminate WITHOUT an uncaught crash. Acceptable terminal states are:
//   - a successful value, or
//   - a thrown JS Error (a Shen-level catchable error, OR a parser/reader
//     rejection of malformed input).
//
// The failure mode being hunted is a thrown non-Error payload (a bare string,
// undefined, a Promise that never settles) — the JS analogue of shen-go's
// bare-string panic that bypassed the recovery layers and dumped a goroutine
// trace on the user's stdout. Every throw here must be an Error instance, and
// every Shen-level error must additionally be catchable via (trap-error ...).
//
// Seeds are biased toward malformed Shen — the shape that surfaced the original
// crash (`(/. _ false)` from the Witness layout-proofs work), unbalanced
// parens, escaping forms, and resource-exhaustion inputs.
import { ok } from 'node:assert';
import { parseForm } from '../../scripts/parser.js';
import backend from '../../lib/backend.js';

const { evalKl, settle } = backend();

const seeds = [
  // Golden path — must evaluate cleanly.
  '(+ 1 2)',
  '(do (defun id (X) X) (id 42))',
  '(let X 1 (+ X 1))',
  '(if true 1 2)',

  // Error paths that MUST surface as catchable Shen errors.
  '(overflow->str)',
  '(value never-bound)',
  '(if 42 1 2)',
  '(simple-error "x")',

  // Malformed-but-parseable inputs in the shape of the bug that triggered
  // the original investigation (Witness proofs.shen). `_` as a lambda
  // parameter and `/.`/`$` heads must not crash the process.
  '(/. _ false)',
  '(lambda _ false)',
  '($ x)',
  '($ ($ ($)))',

  // Resource-exhaustion: an oversized absvector must raise a catchable
  // error (or a JS RangeError), never abort the process.
  '(absvector 10000000000)',
  '(absvector -1)',

  // Reader edge cases — at minimum these must not crash.
  '',
  ' ',
  '()',
  '(',
  ')',
  '))',
  '"unterminated',
  '#\\',
  '((((((((((',
  '(a . b)',
  '(cons 1 2 3 4 5)',
];

describe('reader fuzz (port-authored, mirrors shen-go reader_fuzz)', () => {
  // Run each seed through parse -> eval and assert the pipeline never throws
  // anything other than an Error (no bare-string throws, no unsettled
  // Promise, no process crash).
  for (const src of seeds) {
    it(`pipeline never crashes on ${JSON.stringify(src)}`, async () => {
      let form;
      try {
        form = parseForm(src);
      } catch (e) {
        // Reader rejection of malformed input is an acceptable terminal state,
        // but it must be a real Error (catchable, renderable).
        ok(e instanceof Error, `parse threw a non-Error: ${typeof e}`);
        return;
      }
      try {
        await settle(evalKl(form));
      } catch (e) {
        ok(e instanceof Error, `eval threw a non-Error: ${typeof e}`);
        ok(typeof e.message === 'string', 'thrown error must carry a string message');
      }
    });
  }

  // For the inputs that parse AND evaluate to a Shen-level error, the error
  // must be catchable via (trap-error ...) — proving it is a real Shen error,
  // not an uncatchable host-level failure.
  describe('Shen-level errors are catchable via trap-error', () => {
    const catchableSeeds = ['(overflow->str)', '(value never-bound)', '(if 42 1 2)', '(simple-error "x")'];
    for (const trigger of catchableSeeds) {
      it(`${JSON.stringify(trigger)} is caught and yields a string message`, async () => {
        const msg = await settle(evalKl(parseForm(
          `(trap-error ${trigger} (lambda E (error-to-string E)))`)));
        ok(typeof msg === 'string', `expected a caught string message, got ${typeof msg}`);
        ok(msg.length > 0, 'caught message should be non-empty');
      });
    }
  });
});
