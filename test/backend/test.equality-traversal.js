import { deepEqual, equal } from 'node:assert/strict';
import backend from '../../lib/backend.js';

describe('structural equality traversal', () => {
  it('rejects a late list mismatch without retrying failed suffixes', async () => {
    const $ = backend();
    let reads = 0;
    const list = last => {
      let result = $.cons(last, null);
      for (let i = 0; i < 64; i++) {
        const tail = result, node = $.cons(i, tail);
        Object.defineProperty(node, 'tail', {
          enumerable: true,
          get() {
            if (++reads > 256) throw new Error('repeated list traversal');
            return tail;
          }
        });
        result = node;
      }
      return result;
    };
    const x = list($.s`a`), y = list($.s`b`);
    equal($.equate(x, y), false);
    // The native primitive and compiled (= X Y) must agree.
    reads = 0;
    equal($.lookup('=').f(x, y), $.s`false`);
    await $.evalKl([$.s`defun`, $.s`compare`, [$.s`X`, $.s`Y`], [$.s`=`, $.s`X`, $.s`Y`]]);
    reads = 0;
    equal(await $.settle($.lookup('compare').f(x, y)), $.s`false`);
  });
  it('keeps equal lists, nested mismatches, vectors and interop objects consistent', () => {
    const $ = backend(), a = $.toListTree([1, [2, 3], 4]);
    equal($.equate(a, $.toListTree([1, [2, 3], 4])), true);
    equal($.equate(a, $.toListTree([1, [2, 9], 4])), false);
    equal($.equate([a], [$.toListTree([1, [2, 3], 4])]), true);
    equal($.equate([a], [$.toListTree([1, [2, 9], 4])]), false);
    equal($.equate({ a: [1, 2] }, { a: [1, 2] }), true);
    equal($.equate({ a: [1, 2] }, { a: [1, 3] }), false);
    equal($.equate(a, { head: 1, tail: null }), false);
    deepEqual($.toArrayTree(a), [1, [2, 3], 4]);
  });
});
