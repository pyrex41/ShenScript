import { equal, ok, rejects, match } from 'node:assert/strict';
import backend from '../../lib/backend.js';
import installSealing from '../../lib/aot-runtime.js';
import { analyzeAot } from '../../lib/aot-analysis.js';
import { parseFile } from '../../scripts/parser.js';
import { Block, Const, Id, Lets, generate } from '../../lib/ast.js';
const setup = async (code, directCalls = true) => {
  const forms = parseFile(code), nativeNames = new Set([...backend().globals].filter(([, cell]) => cell.f.arity !== undefined).map(([name]) => name));
  const aot = analyzeAot(forms, { nativeNames }); aot.directCalls = directCalls; aot.emitted = { workers: 0, headCalls: 0 };
  const $ = installSealing(backend({ aotAnalysis: aot }));
  const body = $.assemble(Block, ...forms.map($.construct));
  const ast = Block(...(directCalls ? [Lets([...aot.workers.values()].map(Id))] : []),
    ...Object.entries(body.subs).map(([name, value]) => Const(Id(name), value)), ...body.ast.body);
  await $.evalJs(ast);
  return { $, aot, code: generate(ast), call: (name, ...args) => $.settle($.lookup(name).f(...args)) };
};

describe('exact-arity AOT workers', () => {
  it('optimizes exact head calls and keeps partial/overapplication paths', async () => {
    const { $, aot, call } = await setup('(defun f (X Y) (+ X Y)) (defun head (X) (+ 1 (f X 2))) (defun partial (X) (f X)) (defun over (X) (f X 2 3))');
    equal(await call('head', 4), 7); equal(aot.emitted.headCalls, 1); equal(aot.emitted.workers, 4);
    equal(await $.settle((await call('partial', 2))(3)), 5);
    await rejects(async () => call('over', 1), /function expected/);
    equal($.lookup('f').f.arity, 2);
  });
  it('keeps nested call emission within a linear code-size budget', async () => {
    let expression = 'X';
    for (let i = 0; i < 8; i++) expression = '(f ' + expression + ')';
    const { $, code, call } = await setup('(defun f (X) (do (tick X) (+ X 1))) (defun g (X) ' + expression + ')');
    let calls = 0; $.defun('tick', x => { calls++; return x; });
    equal(await call('g', 1), 9); equal(calls, 8); ok(code.length < 10000, 'nested calls caused code-size explosion');
  });
  it('preserves async declaration, suspension, rebinding and rejection', async () => {
    const { $, call } = await setup('(defun f (X) (if (= X 0) 0 (+ 1 (host X)))) (defun g (X) (+ 1 (f X)))');
    ok($.lookup('f').f(0) instanceof Promise); equal($.lookup('f').f.async, true);
    $.defun('host', x => x + 1); equal(await call('g', 1), 4);
    let resolve; $.defun('host', _x => new Promise(yes => { resolve = yes; }));
    const pending = call('g', 2); resolve(10); equal(await pending, 12);
    const error = new Error('host failure'); $.defun('host', _x => { throw error; });
    await rejects(() => call('g', 1), e => e === error);
  });
  it('keeps lexical callees and captured parameters independent', async () => {
    const { $, call } = await setup('(defun low (X) (+ X 1)) (defun shadow (low) (+ 1 (low 4))) (defun make (X) (lambda Y (+ 1 (low (+ X Y)))))');
    equal(await call('shadow', $.fun(async x => x * 2)), 9);
    const a = await call('make', 10), b = await call('make', 20);
    equal(await $.settle(a(1)), 13); equal(await $.settle(b(1)), 23);
  });
  it('preserves callee capture before arguments for dynamic fallback bindings', async () => {
    const { $, call } = await setup('(defun h (X) (+ X 1)) (defun h (X) (+ X 2)) (defun f (X) (+ 1 (h (host X))))');
    $.defun('host', x => { $.defun('h', y => y + 1000); return x; });
    equal(await call('f', 1), 4); equal(await call('h', 1), 1001);
  });
  it('preserves a forward-call error before the definition is installed', async () => {
    const { $, call } = await setup('(defun f (X) (+ 1 (g X))) (set early (trap-error (f 1) (lambda E (error-to-string E)))) (defun g (X) (+ X 1))');
    match($.valueOf('early'), /function "g" is not defined/); equal(await call('f', 1), 3);
  });
  it('preserves thenable assimilation and microtask order against sealed-only code', async () => {
    const code = '(defun f (X) (if (number? X) (+ 1 (host X)) X)) (defun g (X) (let R (f X) (do (effect R) R)))';
    const traces = [];
    for (const direct of [false, true]) {
      const { $, call } = await setup(code, direct), events = [];
      $.defun('host', x => x); $.defun('effect', x => { events.push('effect'); return x; });
      const value = { get then() { events.push('get then'); return yes => { events.push('then'); yes(7); }; } };
      const pending = call('g', value); queueMicrotask(() => events.push('microtask'));
      equal(await pending, 7); traces.push(JSON.stringify(events));
    }
    equal(traces[0], traces[1]);
  });
});
