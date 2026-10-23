import { deepEqual, equal, rejects, throws } from 'node:assert/strict';
import backend from '../../lib/backend.js';

// Exact calls use specialized wrappers; partial/over application must keep the
// same curry/trampoline and async exception behavior across the cutoff.
describe('high-arity application', () => {
  for (const arity of [4, 5, 6, 7, 8, 9, 10, 11]) {
    for (const async of [false, true]) {
      it(`${arity} arguments, ${async ? 'async' : 'sync'}`, async () => {
        const $ = backend();
        const args = Array.from({ length: arity }, (_, i) => i + 1);
        const raw = async ? async (...xs) => xs : (...xs) => xs;
        const f = $.fun(raw, arity);
        equal(f.arity, arity);
        deepEqual(await $.settle(f(...args)), args);
        deepEqual(await $.settle(f()(...args)), args);
        const partial = f(...args.slice(0, 2));
        deepEqual(await $.settle(partial(...args.slice(2))), args);
        const chained = args.reduce((g, x) => g(x), f);
        deepEqual(await $.settle(chained), args);
        const returning = $.fun(async
          ? async (...xs) => $.fun(y => [...xs, y], 1)
          : (...xs) => $.fun(y => [...xs, y], 1), arity);
        deepEqual(await $.settle(returning(...args, 99)), [...args, 99]);
        const failing = $.fun(async
          ? async () => { throw new Error('high arity failure'); }
          : () => { throw new Error('high arity failure'); }, arity);
        if (async) await rejects(() => $.settle(failing(...args)), /high arity failure/);
        else throws(() => failing(...args), /high arity failure/);
      });
    }
  }
  it('observes a rebound high-arity callee and settles async trampolines', async () => {
    const $ = backend(), { s } = $;
    await $.evalKl([s`defun`, s`many`, [s`A`, s`B`, s`C`, s`D`, s`E`], s`E`]);
    await $.evalKl([s`defun`, s`caller`, [], [s`many`, 1, 2, 3, 4, 5]]);
    equal(await $.settle($.lookup('caller').f()), 5);
    $.defun('many', $.fun(async (_a, _b, _c, _d, e) => $.bounce($.fun(x => x + 10), e), 5));
    equal(await $.settle($.lookup('caller').f()), 15);
  });
});
