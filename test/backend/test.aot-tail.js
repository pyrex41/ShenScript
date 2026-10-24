import { equal, deepEqual, ok, rejects } from 'node:assert/strict';
import backend from '../../lib/backend.js';
import installSealing from '../../lib/aot-runtime.js';
import lowerTail from '../../lib/aot-tail.js';
import { analyzeAot } from '../../lib/aot-analysis.js';
import { parseFile } from '../../scripts/parser.js';
import { Block, Const, Id, generate } from '../../lib/ast.js';

const setup = async code => {
  const forms = parseFile(code), nativeNames = new Set([...backend().globals].filter(([, cell]) => cell.f.arity !== undefined).map(([name]) => name));
  const aot = analyzeAot(forms, { nativeNames }); aot.emitted = {};
  const $ = installSealing(backend({ aotAnalysis: aot, aotTail: lowerTail }));
  const body = $.assemble(Block, ...forms.map($.construct));
  const ast = Block(...Object.entries(body.subs).map(([name, value]) => Const(Id(name), value)), ...body.ast.body);
  await $.evalJs(ast);
  return { $, aot, code: generate(ast), call: (name, ...args) => $.settle($.lookup(name).f(...args)) };
};

describe('sealed synchronous self-tail loops', () => {
  it('executes deep recursion with simultaneous argument updates and no bounce', async () => {
    const { $, aot, code, call } = await setup('(defun rotate (N X Y) (if (= N 0) (cons X (cons Y ())) (rotate (- N 1) Y X)))');
    $.b = () => { throw new Error('unexpected trampoline'); };
    deepEqual($.toArrayTree(await call('rotate', 100001, 3, 7)), [7, 3]);
    equal(aot.emitted.tailLoops, 1); equal(aot.emitted.selfTailSites, 1); ok(code.includes('while (true)'));
    ok(!$.lookup('rotate').f.async);
  });
  it('evaluates argument effects once from left to right before reassignment', async () => {
    const { $, call } = await setup('(defun walk (N X) (if (= N 0) X (walk (do (set events (cons N (value events))) (- N 1)) (+ X N))))');
    $.lookup('events').set(null); equal(await call('walk', 4, 0), 10);
    deepEqual($.toArrayTree($.valueOf('events')), [1, 2, 3, 4]);
  });
  it('keeps distinct let bindings, nested conditional exits and zero-arity loops', async () => {
    const { $, aot, call } = await setup('(defun walk (N X) (let A (+ X N) (if (= N 0) A (if (> N 2) (walk (- N 1) A) (do (set last N) (walk (- N 1) A)))))) (defun zero () (if (= (value count) 0) 42 (do (set count (- (value count) 1)) (zero))))');
    equal(await call('walk', 4, 0), 10); equal($.valueOf('last'), 1);
    $.lookup('count').set(100001); equal(await call('zero'), 42); equal(aot.emitted.tailLoops, 2);
  });
  it('retains traps, escaping closures and async functions on their original paths', async () => {
    const { $, aot, code, call } = await setup('(defun captured (N Fs) (if (= N 0) Fs (captured (- N 1) (cons (freeze N) Fs)))) (defun trapped (N) (trap-error (if (= N 0) 0 (trapped (- N 1))) (lambda E 99))) (defun mixed (N) (if (= N 0) 0 (do (host N) (mixed (- N 1)))))');
    equal(aot.emitted.tailLoops, undefined); ok(!code.includes('while (true)'));
    const fs = $.toArray(await call('captured', 3, null)); deepEqual(await Promise.all(fs.map(f => $.settle(f()))), [1, 2, 3]);
    equal(await call('trapped', 3), 0); $.defun('host', async x => x); equal(await call('mixed', 3), 0);
  });
  it('preserves partial and overapplication, errors and mutual tail dispatch', async () => {
    const { $, call } = await setup('(defun sum (N X) (if (= N 0) X (sum (- N 1) (+ X N)))) (defun even (N) (if (= N 0) true (odd (- N 1)))) (defun odd (N) (if (= N 0) false (even (- N 1))))');
    equal(await $.settle((await call('sum', 3))(2)), 8);
    await rejects(async () => call('sum', 0, 1, 2), /function expected/);
    await rejects(async () => call('sum', 'bad', 0), /number expected/);
    equal(await call('even', 10000), Symbol.for('true'));
  });
  it('leaves duplicate and lexical self names dynamically dispatched', async () => {
    const { $, aot, call } = await setup('(defun f (N) (if (= N 0) 0 (f (- N 1)))) (defun f (N) (+ N 1)) (defun shadow (shadow) (shadow 4))');
    equal(aot.emitted.tailLoops, undefined); $.defun('f', x => x + 10); equal(await call('f', 1), 11);
    equal(await call('shadow', $.fun(x => x * 2)), 8);
  });
});
