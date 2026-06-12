const { equal }     = require('assert');
const forEach       = require('mocha-each');
const { s }         = require('../../lib/utils.js');
const { parseForm } = require('../../scripts/parser.js');

describe('parsing', () => {
  describe('symbolic literals', () => {
    forEach(['abc', 'x\'{', '.<?/^']).it('should parse any non-whitespace, non-paren', x => {
      equal(s`${x}`, parseForm(x));
    });
  });
  describe('string literals', () => {
    it('should parse empty strings', () => {
      equal('', parseForm('""'));
    });
    forEach(['a\tb', 'a \n b', 'a   b', 'a\r\n\vb']).it('should capture any whitespace', x => {
      equal(x, parseForm(`"${x}"`));
    });
    forEach(['~!@#$%', '^&*()_+`\'<', '>,./?;:']).it('should capture all ascii characters', x => {
      equal(x, parseForm(`"${x}"`));
    });
  });
  describe('numberic literals', () => {
    it('should parse zero', () => {
      equal(0, parseForm('0'));
    });
    forEach([[5, '5'], [287, '287'], [9456, '9456']]).it('should parse numbers', (n, x) => {
      equal(n, parseForm(x));
    });
    forEach([[-4, '-4'], [-143, '-143'], [-79, '-79']]).it('should parse negative numbers', (n, x) => {
      equal(n, parseForm(x));
    });
    forEach([[0.1, '0.1'], [1.6180339887498, '1.6180339887498'], [-0.7071067811865, '-0.7071067811865']]).it('should parse decimals', (n, x) => {
      equal(n, parseForm(x));
    });
    forEach([[1e-4, '1e-4'], [2.5e3, '2.5e3'], [-1.5E+2, '-1.5E+2']]).it('should parse exponent notation', (n, x) => {
      equal(n, parseForm(x));
    });
    it('should parse digit-led symbols as symbols', () => {
      equal(s`1+`, parseForm('1+'));
    });
  });
  describe('forms', () => {
    it('should parse empty forms as empty arrays', () => {
      equal(0, parseForm('()').length);
    });
    it('should parse forms as arrays', () => {
      equal(s`abc`, parseForm('(abc)')[0]);
      equal(s`def`, parseForm('(abc def)')[1]);
    });
    it('should parse nested forms as nested arrays', () => {
      const expr = parseForm('(if (>= 0 X) X (* -1 X))');
      equal(4,     expr.length);
      equal(s`if`, expr[0]);
      equal(3,     expr[1].length);
      equal(s`>=`, expr[1][0]);
      equal(0,     expr[1][1]);
      equal(s`X`,  expr[1][2]);
      equal(s`X`,  expr[2]);
      equal(3,     expr[3].length);
      equal(s`*`,  expr[3][0]);
      equal(-1,    expr[3][1]);
      equal(s`X`,  expr[3][2]);
    });
  });
});
