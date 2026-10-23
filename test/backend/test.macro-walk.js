import { deepEqual, equal, ok, rejects } from 'node:assert/strict';
import backend from '../../lib/backend.js';
import overrides from '../../lib/overrides.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const environment = macros => {
  const $ = overrides(backend());
  $.assign('*macros*', $.toList(macros.map((f, i) => $.cons($.symbolOf(`macro-${i}`), f))));
  return $;
};
const expand = ($, x) => $.lookup('macroexpand').f(x);
const view = ($, x) => {
  if ($.isCons(x) || x === null) return $.toArray(x).map(y => view($, y));
  return typeof x === 'symbol' ? Symbol.keyFor(x) : x;
};

describe('native macro walking', () => {
  it('keeps the public Promise boundary and visits nodes bottom-up, left-to-right', async () => {
    let $; const seen = [];
    $ = environment([x => { seen.push(view($, x)); return x; }]);
    const x = $.toListTree([$.s`root`, [$.s`child`, 1], 2]);
    const pending = expand($, x);
    ok(pending instanceof Promise);
    equal(await pending, x);
    deepEqual(seen, ['root', 'child', 1, ['child', 1], 2, ['root', ['child', 1], 2]]);
    ok($.lookup('macroexpand').f.async);
  });
  it('preserves identity when a macro returns equal but fresh lists', async () => {
    let $;
    $ = environment([x => $.isCons(x) ? $.toList($.toArray(x)) : x]);
    const x = $.toListTree([$.s`a`, [1, 2]]);
    equal(await expand($, x), x);
  });
  it('restarts from the first macro after a change', async () => {
    const seen = []; let $;
    $ = environment([
      x => { seen.push('first:' + view($, x)); return x === $.s`c` ? $.s`d` : x; },
      x => { seen.push('second:' + view($, x)); return x === $.s`b` ? $.s`c` : x; }
    ]);
    equal(await expand($, $.s`b`), $.s`d`);
    deepEqual(seen, ['first:b', 'second:b', 'first:c', 'first:d', 'second:d']);
  });
  it('does not enter or apply macros to registered source-form subtrees', async () => {
    const seen = []; let $;
    $ = environment([x => { seen.push(view($, x)); return x === $.s`keep` ? $.s`wrong` : x; }]);
    $.assign('shen.*source-form-handlers*', $.toList([$.cons($.s`protected`, $.s`handler`)]));
    const shield = $.toListTree([$.s`protected`, $.s`keep`]);
    const x = $.toList([$.s`root`, shield, 1]);
    equal(await expand($, x), x);
    deepEqual(seen, ['root', 1, ['root', ['protected', 'keep'], 1]]);
  });
  it('suspends at an actual Promise before visiting later siblings', async () => {
    const entered = deferred(), result = deferred(), seen = []; let $;
    $ = environment([x => {
      if (!$.isCons(x)) seen.push(view($, x));
      if (x === 1) { entered.resolve(); return result.promise; }
      return x;
    }]);
    const x = $.toListTree([$.s`a`, 1, $.s`b`]);
    const pending = expand($, x); await entered.promise;
    deepEqual(seen, ['a', 1]);
    result.resolve(2);
    deepEqual(view($, await pending), ['a', 2, 'b']);
  });
  for (const async of [false, true]) {
    it(`settles ${async ? 'async' : 'sync'} trampolines`, async () => {
      let $;
      $ = environment([x => x === 1 ? $.bounce(() => async ? Promise.resolve(2) : 2) : x]);
      equal(await expand($, 1), 2);
    });
    it(`rejects ${async ? 'async' : 'sync'} failures without visiting later nodes`, async () => {
      const seen = []; let $;
      $ = environment([x => {
        if (!$.isCons(x)) seen.push(view($, x));
        if (x === 1) {
          if (async) return Promise.reject(new Error('macro failed'));
          throw new Error('macro failed');
        }
        return x;
      }]);
      const pending = expand($, $.toListTree([$.s`a`, 1, $.s`b`]));
      ok(pending instanceof Promise); await rejects(pending, /macro failed/);
      deepEqual(seen, ['a', 1]);
    });
  }
  it('accepts foreign thenables, reading the getter once with its original receiver', async () => {
    let reads = 0, calls = 0;
    const thenable = { get then() { reads++; return function (resolve) {
      equal(this, thenable); calls++; resolve(2);
    }; } };
    const $ = environment([x => x === 1 ? thenable : x]);
    equal(await expand($, 1), 2); equal(reads, 1); equal(calls, 1);
  });
  it('keeps each expansion state separate when suspensions resolve out of order', async () => {
    const first = deferred(), second = deferred(), both = deferred(); let entered = 0, $;
    $ = environment([x => {
      if (x === 1 || x === 2) { if (++entered === 2) both.resolve(); return x === 1 ? first.promise : second.promise; }
      return x;
    }]);
    const a = $.toListTree([$.s`a`, 1]), b = $.toListTree([$.s`b`, 2]);
    const pa = expand($, a), pb = expand($, b); await both.promise;
    second.resolve(2); equal(await pb, b);
    first.resolve(1); equal(await pa, a);
  });
  it('reads the current head and tail after suspension', async () => {
    const entered = deferred(), result = deferred(), seen = []; let $;
    $ = environment([x => {
      if (!$.isCons(x)) seen.push(view($, x));
      if (x === 1) { entered.resolve(); return result.promise; }
      return x;
    }]);
    const suffix = $.toListTree([1, $.s`old`]), x = $.cons($.s`root`, suffix);
    const pending = expand($, x); await entered.promise;
    suffix.head = 2; suffix.tail = $.toList([$.s`new`]); result.resolve(2);
    equal(await pending, x);
    deepEqual(seen, ['root', 1, 'new']);
    deepEqual(view($, x), ['root', 2, 'new']);
  });
  it('snapshots the macro registry for each invocation', async () => {
    let $, changed = false;
    const later = x => x === 2 ? 3 : x;
    const initial = x => {
      if (x === 1 && !changed) {
        changed = true;
        $.assign('*macros*', $.toList([$.cons($.s`initial`, initial), $.cons($.s`later`, later)]));
        return Promise.resolve(x);
      }
      return x;
    };
    $ = environment([initial]); const x = $.toListTree([1, 2]);
    equal(await expand($, x), x);
    deepEqual(view($, await expand($, x)), [1, 3]);
  });
  it('snapshots source-form handlers across a suspension', async () => {
    const entered = deferred(), result = deferred(); let $;
    $ = environment([x => {
      if (x === 1) { entered.resolve(); return result.promise; }
      return x === 2 ? 3 : x;
    }]);
    const x = $.toListTree([1, [$.s`protected`, 2]]);
    const pending = expand($, x); await entered.promise;
    $.assign('shen.*source-form-handlers*', $.toList([$.cons($.s`protected`, $.s`handler`)]));
    result.resolve(1);
    deepEqual(view($, await pending), [1, ['protected', 3]]);
    const later = $.toListTree([$.s`protected`, 2]);
    equal(await expand($, later), later);
  });
  it('rejects a foreign then getter failure at the public Promise boundary', async () => {
    const $ = environment([() => Object.defineProperty({}, 'then', {
      get() { throw new Error('then getter failed'); }
    })]);
    const pending = expand($, 1); ok(pending instanceof Promise);
    await rejects(pending, /then getter failed/);
  });
  it('walks long flat lists across mixed sync and async results without sibling recursion', async () => {
    let $;
    $ = environment([x => typeof x === 'number' && x % 17 === 0 ? Promise.resolve(x) : x]);
    const x = $.toList(Array.from({ length: 10000 }, (_, i) => i));
    equal(await expand($, x), x);
  });
  it('treats vectors as atomic macro inputs', async () => {
    const seen = [], x = [1, 2];
    const $ = environment([value => { seen.push(value); return value; }]);
    equal(await expand($, x), x); deepEqual(seen, [x]);
  });
});
