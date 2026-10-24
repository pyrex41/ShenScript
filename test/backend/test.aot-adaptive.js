import { equal, deepEqual, ok, rejects } from 'node:assert/strict';
import backend from '../../lib/backend.js';
import installAdaptive from '../../lib/aot-adaptive-runtime.js';
import lowerAdaptive from '../../lib/aot-adaptive.js';
import { parseFile } from '../../scripts/parser.js';
import { Block, Const, Id, Call, Member } from '../../lib/ast.js';

const setup = async (code, adaptive = true, options = {}) => {
  const stats = {}, $ = backend(adaptive ? { aotAdaptive: lowerAdaptive, aotStats: stats, ...options } : options);
  if (adaptive) installAdaptive($);
  const forms = parseFile(code), body = $.assemble(Block, ...forms.map($.construct));
  await $.evalJs(Block(...Object.entries(body.subs).map(([name, value]) => Const(Id(name), value)), ...body.ast.body));
  return { $, stats, call: (name, ...args) => $.settle($.lookup(name).f(...args)) };
};

describe('explicit bounded adaptive continuations', () => {
  it('retains public Promise, async metadata and currying while fast calls complete internally', async () => {
    const { $, stats, call } = await setup('(defun f (X Y) (+ X (host Y))) (defun g (X) (+ 1 (f X 2))) (defun zero () (+ 1 (host 2)))');
    $.defun('host', x => x + 1);
    ok($.lookup('f').f(1, 2) instanceof Promise); equal($.lookup('f').f.async, true); equal($.lookup('f').f.arity, 2);
    equal(await call('g', 1), 5); equal(await $.settle((await call('f', 2))(3)), 6);
    await rejects(async () => call('f', 1, 2, 3), /function expected/);
    ok($.lookup('zero').f() instanceof Promise); equal(await call('zero'), 4); equal(stats.functions, 3);
  });
  it('suspends on actual Promises and keeps concurrent frames and captured lets independent', async () => {
    const { $, call } = await setup('(defun f (X) (let A (+ X 1) (let B (host X) (lambda Y (+ A (+ B Y))))))');
    const pending = new Map(); $.defun('host', x => new Promise(resolve => pending.set(x, resolve)));
    const a = call('f', 1), b = call('f', 10); pending.get(10)(20); pending.get(1)(30);
    const fa = await a, fb = await b; equal(await $.settle(fa(3)), 35); equal(await $.settle(fb(3)), 34);
  });
  it('keeps errors and traps before and after suspension', async () => {
    const { $, call } = await setup('(defun f (X) (+ X (host X))) (defun caught (X) (trap-error (f X) (lambda E (error-to-string E))))');
    const error = new Error('early'); $.defun('host', _x => { throw error; });
    await rejects(() => call('f', 2), e => e === error); equal(await call('caught', 2), 'early');
    $.defun('host', async _x => { throw new Error('late'); }); equal(await call('caught', 2), 'late');
    await rejects(() => call('f', 'bad'), /number expected/);
  });
  it('captures mutable callees before argument effects and actual awaits', async () => {
    const { $, call } = await setup('(defun h (X) (+ 1 X)) (defun f (X) (+ 1 (h (host X))))');
    let finish; $.defun('host', _x => { $.defun('h', x => x + 100); return new Promise(yes => { finish = yes; }); });
    const pending = call('f', 2); finish(2); equal(await pending, 4); equal(await call('h', 2), 102);
    $.defun('h', async x => x + 1000); $.defun('host', x => x); equal(await call('f', 2), 1003);
  });
  it('matches original thenable assimilation, non-callable/changing getters and native then overrides', async () => {
    for (const kind of ['thenable', 'noncallable', 'changing', 'native']) {
      const traces = [];
      for (const adaptive of [false, true]) {
        const { $, call } = await setup('(defun f (X) (if (number? X) (host X) X)) (defun g (X) (let A (f X) (do (effect A) A)))', adaptive);
        const events = []; let reads = 0, value;
        if (kind === 'native') { value = Promise.resolve(7); Object.defineProperty(value, 'then', { get() { events.push('native then'); return Promise.prototype.then; } }); }
        else value = { get then() { reads++; events.push('get'); return kind === 'noncallable' || (kind === 'changing' && reads > 1) ? 3 : yes => { events.push('then'); yes(7); }; } };
        $.defun('host', _x => value); $.defun('effect', x => { events.push('effect'); return x; });
        const result = await call('g', value); equal(typeof result === 'object' ? result === value : result, typeof result === 'object' ? true : 7);
        traces.push(events);
      }
      deepEqual(traces[1], traces[0], kind);
    }
  });
  it('settles tail trampolines and handles higher-order fallback and later eval', async () => {
    const { $, call } = await setup('(defun f (X) (host X)) (defun apply (F X) (+ 1 (F X))) (defun g (X) (+ 1 (f X)))');
    $.defun('host', async x => x + 1); equal(await call('g', 2), 4);
    equal(await call('apply', $.fun(async x => x * 2), 3), 7);
    await $.evalKl($.toListTree(parseFile('(defun f (X) (+ X (host X)))')[0])); equal(await call('g', 2), 6);
  });
  it('makes incidental scheduling changes explicit while public calls remain asynchronous', async () => {
    const effects = [];
    for (const adaptive of [false, true]) {
      const { $, call } = await setup('(defun f (X) (+ X (host X))) (defun g (X) (do (effect (f X)) X))', adaptive);
      const events = []; $.defun('host', x => x); $.defun('effect', x => { events.push('effect'); return x; });
      const pending = call('g', 1); ok(pending instanceof Promise); events.push('returned'); await pending; effects.push(events);
    }
    deepEqual(effects, [['returned', 'effect'], ['effect', 'returned']]);
  });
  it('preserves short circuiting and effects before and after actual suspension', async () => {
    for (const adaptive of [false, true]) {
      const { $, call } = await setup('(defun f (X) (do (effect 1) (let A (and X (host 2)) (do (effect 3) (if A (host 4) (host 5))))))', adaptive);
      const events = []; $.defun('effect', x => { events.push(x); return x; });
      $.defun('host', async x => { events.push(x); return x === 2 ? Symbol.for('true') : x; });
      equal(await call('f', Symbol.for('false')), 5); deepEqual(events, [1, 3, 5]);
      events.length = 0; equal(await call('f', Symbol.for('true')), 4); deepEqual(events, [1, 2, 3, 4]);
    }
  });
  it('captures computed method receivers and getters before suspending arguments', async () => {
    for (const adaptive of [false, true]) {
      const { $ } = await setup('', adaptive), events = [];
      $.inline('method', null, [null, null], (object, argument) => Call(Member(object, Id('take')), [argument]));
      await $.evalKl($.toListTree(parseFile('(defun f (O X) (+ 1 (method O (host X))))')[0]));
      let replacement = false;
      const object = { base: 10, get take() { events.push('get'); return replacement ? function (x) { return this.base + x + 100; } : function (x) { events.push('call'); return this.base + x; }; } };
      $.defun('host', async x => { events.push('argument'); replacement = true; return x; });
      equal(await $.settle($.lookup('f').f(object, 2)), 13); deepEqual(events, ['get', 'argument', 'call']);
    }
  });
  it('keeps actual incremental reads and computed callees in native evaluation order', async () => {
    const events = [], stream = { async read() { events.push('read'); return 7; } };
    const { $, call } = await setup('(defun f (X) (+ 1 (read-byte (host X)))) (defun g (X) (+ 1 ((make X) (effect X))))', true, { isInStream: x => x === stream });
    $.defun('host', async _x => stream); equal(await call('f', 1), 8); deepEqual(events, ['read']);
    $.defun('make', async _x => { events.push('callee'); return $.fun(x => x + 1); });
    $.defun('effect', x => { events.push('argument'); return x; });
    equal(await call('g', 2), 4); deepEqual(events, ['read', 'callee', 'argument']);
  });
  it('falls back within a bounded code-growth budget', async () => {
    const terms = Array.from({ length: 20 }, (_, i) => '(host ' + i + ')');
    const { $, stats, call } = await setup('(defun large (X) ' + terms.reduceRight((rest, term) => rest ? '(do ' + term + ' ' + rest + ')' : term, '') + ')' );
    $.defun('host', x => x); equal(await call('large', 0), 19); ok(stats.siteBudget > 0);
  });
});
