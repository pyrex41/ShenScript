// Port-authored test suite (NOT part of the canonical Shen kernel suite).
//
// Mirrors shen-go's kl/error_robustness_test.go: the error-CATCHABILITY
// contract. Every documented runtime error path must
//   1. raise a Shen-catchable error (so (trap-error ...) handles it),
//   2. surface a stable, informative message (so callers can match on it),
//   3. leave the interpreter state clean enough that the next eval succeeds.
//
// Divergence from shen-go: ShenScript has a single evaluation path (the
// async tree compiler) — there is no separate bytecode VM, so there is no
// per-path message table. The messages below are ShenScript's own and differ
// in wording from shen-go (e.g. "function "X" is not defined" vs
// "can't apply non function: X"); we lock in ShenScript's actual messages.
//
// One genuine divergence is asserted explicitly: applying a NON-FUNCTION
// LITERAL such as (42 1) is rejected by ShenScript at COMPILE time (a literal
// in head position), not at runtime — so it is NOT trap-error-catchable
// (trap-error compiles its body before running it). shen-go lowers (42 1)
// through apply() and raises a catchable runtime error. We pin ShenScript's
// correct compile-time rejection rather than fake parity.
import { equal, ok, throws } from 'node:assert';
import { parseForm } from '../../scripts/parser.js';
import backend from '../../lib/backend.js';

const { compile, evalKl, settle } = backend();
const exec = source => settle(evalKl(parseForm(source)));

// Evaluate (trap-error TRIGGER (lambda E (error-to-string E))) and return the
// caught message string.
const caught = trigger =>
  exec(`(trap-error ${trigger} (lambda E (error-to-string E)))`);

describe('error robustness (port-authored, mirrors shen-go error_robustness)', () => {
  describe('runtime error paths are catchable with stable messages', () => {
    const cases = [
      ['apply unbound symbol', '(overflow->str)', 'function "overflow->str" is not defined'],
      ['apply non-function bound to a variable', '(let F 42 (F 1))', 'F is not a function'],
      ['value of unbound global', '(value never-bound-xyz)', 'global "never-bound-xyz" is not defined'],
      ['if requires a boolean', '(if 42 1 2)', 'Shen boolean expected'],
      ['arithmetic on non-number', '(+ 1 "x")', 'number expected'],
      ['hd of empty list', '(hd ())', 'cons expected'],
      ['tl of empty list', '(tl ())', 'cons expected'],
      ['divide by zero', '(/ 1 0)', 'non-zero number expected'],
      ['explicit simple-error', '(simple-error "boom")', 'boom'],
    ];

    for (const [name, trigger, want] of cases) {
      it(`${name}: catchable, message ${JSON.stringify(want)}`, async () => {
        equal(want, await caught(trigger));
      });
    }
  });

  describe('interpreter state stays clean after a caught error', () => {
    it('a normal eval succeeds after each caught error in sequence', async () => {
      const triggers = [
        '(overflow->str)',
        '(value not-bound-1)',
        '(if 42 1 2)',
        '(simple-error "boom")',
        '(/ 1 0)',
      ];
      for (const t of triggers) {
        // Each error is caught...
        ok(typeof (await caught(t)) === 'string');
        // ...and the very next eval still works.
        equal(42, await exec('(+ 40 2)'));
      }
    });
  });

  describe('the trap-error handler receives the error object', () => {
    it('error-to-string on the handler argument yields the message', async () => {
      equal('hi', await exec('(trap-error (simple-error "hi") (lambda X (error-to-string X)))'));
    });
    it('a handler can swallow the error and return a normal value', async () => {
      equal(7, await exec('(trap-error (simple-error "ignored") (lambda E 7))'));
    });
  });

  describe('documented compile-time rejection (ShenScript divergence)', () => {
    // (42 1) — a literal in head position — is rejected when the form is
    // COMPILED, before evaluation, so it is not catchable via trap-error.
    // This differs from shen-go, which raises a catchable runtime error.
    it('applying a non-function literal is a compile-time error, not catchable', async () => {
      throws(() => compile(parseForm('(42 1)')), /not a valid application form/);
      // Because the body compiles eagerly, even wrapping it in trap-error
      // throws at compile time (synchronously, inside evalKl) rather than
      // being caught at runtime.
      throws(() => evalKl(parseForm('(trap-error (42 1) (lambda E (error-to-string E)))')),
        /not a valid application form/);
    });
  });
});
