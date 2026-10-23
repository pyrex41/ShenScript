import { equal, ok, rejects, throws, deepEqual } from 'node:assert/strict';
import backend from '../../lib/backend.js';
import { parseForm } from '../../scripts/parser.js';
import { Literal } from '../../lib/ast.js';

const setup = async () => {
  const $ = backend();
  const exec = code => $.settle($.evalKl(parseForm(code)));
  await exec('(defun shen.parse-failure? (X) (= X (fail)))');
  const call = x => $.lookup('shen.parse-failure?').f(x);
  return { $, exec, call };
};

describe('parse-failure continuation contracts', () => {
  it('retains arity, async metadata and zero-argument partial application', async () => {
    const { $, call } = await setup(); $.defun('fail', () => 7);
    const f = $.lookup('shen.parse-failure?').f;
    equal(f.arity, 1); equal(f.async, true);
    const partial = f(); equal(partial.async, true);
    equal(await $.settle(partial(7)), $.s`true`);
    equal(await $.settle(call(8)), $.s`false`);
  });
  it('looks up the live callee once and preserves effect order', async () => {
    const { $, exec } = await setup(); const events = [];
    $.defun('argument', () => { events.push('argument'); return 7; });
    $.defun('fail', () => { events.push('fail'); return 7; });
    equal(await exec('(shen.parse-failure? (argument))'), $.s`true`);
    deepEqual(events, ['argument', 'fail']);
    $.defun('fail', () => 8);
    equal(await exec('(shen.parse-failure? 7)'), $.s`false`);
  });
  it('supports sync-to-async-to-sync rebinding and delayed resolution', async () => {
    const { $, call } = await setup(); let resolve;
    $.defun('fail', () => 1); equal(await $.settle(call(1)), $.s`true`);
    $.defun('fail', () => new Promise(yes => { resolve = yes; }));
    const pending = call(2); ok(pending instanceof Promise);
    $.defun('fail', () => 3); resolve(2);
    equal(await $.settle(pending), $.s`true`);
    equal(await $.settle(call(3)), $.s`true`);
  });
  it('rejects synchronous callee throws rather than throwing from the wrapper', async () => {
    const { $, call } = await setup(); const error = new Error('sync fail');
    $.defun('fail', () => { throw error; });
    const result = call(1); ok(result instanceof Promise);
    await rejects(result, e => e === error);
  });
  it('preserves delayed rejection and trap-error handling', async () => {
    const { $, exec, call } = await setup(); let reject;
    $.defun('fail', () => new Promise((_, no) => { reject = no; }));
    const pending = call(1); const checked = rejects(pending, /delayed fail/);
    reject(new Error('delayed fail')); await checked;
    $.defun('fail', () => { throw new Error('sync fail'); });
    equal(await exec('(trap-error (shen.parse-failure? 1) (lambda E 99))'), 99);
    $.defun('fail', async () => { throw new Error('async fail'); });
    equal(await exec('(trap-error (shen.parse-failure? 1) (lambda E 100))'), 100);
  });
  it('settles synchronous and asynchronous tail trampolines', async () => {
    const { $, call } = await setup(); let count = 0;
    const tail = n => { count++; return n ? $.bounce(tail, n - 1) : 7; };
    $.defun('fail', () => $.bounce(tail, 10000));
    equal(await $.settle(call(7)), $.s`true`); equal(count, 10001);
    $.defun('fail', () => $.bounce(async () => $.bounce(() => 8)));
    equal(await $.settle(call(8)), $.s`true`);
  });
  it('does not adopt a direct foreign thenable before comparison', async () => {
    const { $, call } = await setup(); let reads = 0;
    const thenable = Object.defineProperty({}, 'then', { get() { reads++; throw new Error('then read'); } });
    $.defun('fail', () => thenable);
    equal(await $.settle(call(thenable)), $.s`true`); equal(reads, 0);
    $.defun('fail', () => Promise.resolve({ then(yes) { reads++; yes(9); } }));
    equal(await $.settle(call(9)), $.s`true`); equal(reads, 1);
  });
  it('keeps concurrent call continuations independent', async () => {
    const { $, call } = await setup(); const resolves = [];
    $.defun('fail', () => new Promise(yes => resolves.push(yes)));
    const a = call(1), b = call(2); resolves[1](2); resolves[0](1);
    equal(await a, $.s`true`); equal(await b, $.s`true`);
  });
  it('preserves overapplication rejection and closure capture', async () => {
    const { $, exec } = await setup(); $.defun('fail', () => 4);
    await rejects(() => exec('(shen.parse-failure? 4 5)'), /function expected/);
    await exec('(defun captured (X) (freeze (shen.parse-failure? X)))');
    const a = await exec('(captured 4)'), b = await exec('(captured 5)');
    equal(await $.settle(a()), $.s`true`); equal(await $.settle(b()), $.s`false`);
  });
  it('rejects comparison errors and does not change another function body', async () => {
    const { $, exec, call } = await setup();
    const bad = { get x() { throw new Error('comparison failure'); } };
    $.defun('fail', () => ({ x: 1 }));
    await rejects(call(bad), /comparison failure/);
    await exec('(defun shen.parse-failure? (X) (+ X (fail)))');
    $.defun('fail', () => 2);
    equal(await $.settle(call(3)), 5);
    throws(() => $.asFunction(3), /function expected/);
  });
  it('respects a locally bound fail parameter', async () => {
    const { $, exec, call } = await setup(); let local = 0, global = 0;
    $.defun('fail', () => { global++; return 7; });
    await exec('(defun shen.parse-failure? (fail) (= fail (fail)))');
    equal(await $.settle(call($.fun(() => { local++; return 7; }))), $.s`false`);
    equal(local, 1); equal(global, 0);
  });
  it('retains existing equality inlining for an equality-named parameter', async () => {
    const { $, exec, call } = await setup(); $.defun('fail', () => 7);
    await exec('(defun shen.parse-failure? (=) (= = (fail)))');
    // Baseline canInline gives the built-in equality inliner precedence here.
    equal(await $.settle(call($.fun((_a, _b) => 99))), $.s`false`);
  });
  it('respects outer lexical bindings in a nested definition', async () => {
    const { $, exec, call } = await setup(); $.defun('fail', () => 8);
    await exec('(let fail (freeze 7) (defun shen.parse-failure? (X) (= X (fail))))');
    equal(await $.settle(call(7)), $.s`true`);
  });
  it('respects replacement compiler equality inliners', async () => {
    const { $, exec, call } = await setup(); $.defun('fail', () => 7);
    $.inline('=', 'JsBool', [null, null], (_x, _y) => Literal(false));
    await exec('(defun shen.parse-failure? (X) (= X (fail)))');
    equal(await $.settle(call(7)), $.s`false`);
  });
});
