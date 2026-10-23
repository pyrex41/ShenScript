import { deepEqual, equal, throws } from 'node:assert/strict';
import { normalizeStrings, serialize } from '../../benchmarks/aot/kl.js';
import { parseForm } from '../../scripts/parser.js';
import backend from '../../lib/backend.js';

const cases = ['', 'plain', '"', 'quote " inside', 'c#34;', 'a\\b\nline', 'naïve λ', 'c#99;"c#34;'];
describe('portable AOT KL serialization', () => {
  for (const value of cases) it('round-trips ' + JSON.stringify(value), async () => {
    const $ = backend();
    const expression = parseForm(serialize(value));
    equal(await $.evalKl(expression), value);
  });
  it('retains plain core forms and rejects non-KL values', () => {
    const form = [Symbol.for('defun'), Symbol.for('f'), [Symbol.for('X')], [Symbol.for('+'), Symbol.for('X'), 1]];
    deepEqual(parseForm(serialize(form)), form);
    deepEqual(normalizeStrings(form), form);
    throws(() => serialize(Infinity), /Unsupported/);
    throws(() => serialize({}), /Unsupported/);
    throws(() => serialize(Symbol.for('bad name')), /representable/);
  });
});
