import assert from 'node:assert/strict';
export const canonical = ($, value) => {
  const walk = x => typeof x === 'symbol' ? Symbol.keyFor(x) : Array.isArray(x) ? x.map(walk) : x;
  return walk($.toArrayTree(value));
};
export const application = ($, name) => {
  let request, expected;
  if (name === 'parser') {
    const program = 'main () { int x; ' + Array.from({ length: 30 }, (_, i) => `x = (x + ${i + 1}); `).join('') + 'return x; };';
    const input = $.toList([...program]);
    const stringInput = $.toList([...('main () { printf("hello/nworld"); return 0; };')]);
    const parse = $.caller('aot.parse');
    let current = 0;
    const expectedProgram = [[], ['main', [], ['compound', ['declare', 'int', ['x']],
      ...Array.from({ length: 30 }, (_, i) => ['assign', 'x', ['+', 'x', i + 1]]), ['return', 'x']]]];
    // The upstream grammar explicitly maps /n to character 13 (CR).
    const expectedString = [[], ['main', [], ['compound', ['printf', 'hello\rworld'], ['return', 0]]]];
    request = () => {
      expected = (current++ % 2 === 0) ? expectedProgram : expectedString;
      return parse(current % 2 ? input : stringInput);
    };
  } else if (name === 'rules') {
    const query = $.caller('aot.rules');
    request = () => query(null);
    expected = ['true', 'true', 'false', 'false', 'true',
      // findall returns reverse proof order (also specified by kerneltests.shen).
      ['airport', 'station', 'school', 'airport', 'station', 'market', 'west', 'north'], []];
  } else if (name === 'lists') {
    const lines = Array.from({ length: 512 }, (_, i) => [i, (i * 17) % 43 - 3, (i * 7) % 29]);
    const input = $.toListTree(lines);
    const remaining = lines.filter(([, stock, requested]) => stock >= 0 && requested >= 0).map(([id, stock, requested]) => [id, stock - requested]);
    const short = remaining.filter(([, stock]) => stock < 0);
    expected = [remaining, short, short.reduce((sum, [, stock]) => sum - stock, 0)];
    const reconcile = $.caller('aot.reconcile');
    request = () => reconcile(input);
  } else if (name === 'numerical') {
    let source = Array.from({ length: 32 }, (_, i) => i === 0 ? 100 : 0), target = [...source];
    for (let step = 0; step < 100; step++) {
      for (let i = 1; i < 31; i++) target[i] = source[i] + 0.125 * ((source[i - 1] - 2 * source[i]) + source[i + 1]);
      [source, target] = [target, source];
    }
    expected = source;
    const heat = $.caller('aot.heat');
    request = () => heat(100);
  } else throw new Error('Unknown AOT application: ' + name);
  const check = result => {
    const actual = canonical($, result);
    if (name === 'numerical') {
      assert.equal(actual.length, expected.length);
      for (let i = 0; i < expected.length; i++) {
        assert.ok(Number.isFinite(actual[i]) && Math.abs(actual[i] - expected[i]) <= 1e-10 + 1e-12 * Math.abs(expected[i]), 'heat field differs at ' + i);
      }
      assert.equal(actual[0], 100); assert.equal(actual.at(-1), 0);
      assert.ok(actual.every(x => x >= 0 && x <= 100));
    } else assert.deepEqual(actual, expected);
    return actual;
  };
  return { request, check };
};
