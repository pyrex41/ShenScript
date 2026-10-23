import { deepEqual, equal, ok } from 'node:assert/strict';
import { analyzeAot } from '../../lib/aot-analysis.js';
import { parseFile } from '../../scripts/parser.js';
const analyze = (code, options) => analyzeAot(parseFile(code), options);

describe('AOT call and binding analysis', () => {
  it('distinguishes data symbols from calls', () => {
    const a = analyze('(defun f (X) (cons declare (cons X ())))');
    equal(a.facts.get('f').calls.length, 0); equal(a.report.counts.calls, 0);
  });
  it('tracks lexical function parameters and shadowing in lets', () => {
    const a = analyze('(defun g (X) X) (defun f (g) (g 2)) (defun h (X) (let g (lambda Y Y) (g X)))');
    equal(a.facts.get('f').calls[0].local, true);
    equal(a.facts.get('h').calls[0].local, true);
    equal(a.facts.get('h').hasClosure, true);
    equal(a.report.counts.exactTailCalls, 0);
  });
  it('resolves forward calls and rejects partial/overapplication fast paths', () => {
    const a = analyze('(defun f (X) (g X 1)) (defun h () (do (g 1) (g 1 2 3))) (defun g (X Y) (+ X Y))');
    equal(a.facts.get('f').calls[0].exact, true);
    deepEqual(a.facts.get('h').calls.map(x => x.exact), [false, false]);
  });
  it('does not execute or scan a type annotation as an expression', () => {
    const a = analyze('(defun f (X) (type (g X) (g 3))) (defun g (X) X)');
    equal(a.facts.get('f').calls.length, 1);
  });
  it('preserves tail facts through let, if and do, and marks traps', () => {
    const a = analyze('(defun f (X) (let Y (g X) (do (g Y) (if (g Y) (g Y) (g X))))) (defun g (X) X) (defun h (X) (trap-error (g X) (lambda E 1)))');
    deepEqual(a.facts.get('f').calls.map(x => x.tail), [false, false, false, true, true]);
    equal(a.facts.get('h').hasTrap, true); equal(a.facts.get('h').hasClosure, true);
  });
  it('leaves duplicate, native and replaced bindings dynamic', () => {
    const a = analyze('(defun f (X) X) (defun f (X) X) (defun g (X) X) (defun install () (defun g (Y) Y)) (defun n () 1)', { nativeNames: new Set(['n']) });
    ok(!a.eligible.has('f')); ok(!a.eligible.has('g')); ok(!a.eligible.has('n')); ok(a.eligible.has('install'));
  });
  it('treats a definition name bound by a parameter as computed', () => {
    const a = analyze('(defun f (X) X) (defun install (Name) (defun Name (X) X))');
    equal(a.report.unknownDefinition, true); equal(a.eligible.size, 0);
  });
  it('identifies mutually recursive components without counting local calls', () => {
    const a = analyze('(defun f (X) (g X)) (defun g (X) (f X)) (defun h (f) (f 1))');
    ok(a.report.components.some(x => x.length === 2 && x.includes('f') && x.includes('g')));
    ok(a.report.components.some(x => x.length === 1 && x[0] === 'h'));
  });
  it('analyzes a long acyclic call chain without recursive graph traversal', () => {
    const s = Symbol.for;
    const forms = Array.from({ length: 10000 }, (_, i) => [s('defun'), s('f' + i), [], i === 9999 ? 1 : [s('f' + (i + 1))]]);
    const a = analyzeAot(forms);
    equal(a.report.components.length, 10000); equal(a.eligible.size, 10000);
    equal(new Set(a.workers.values()).size, 10000);
  });
});
