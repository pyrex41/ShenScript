// Portable KL has no backslash quote escape. Lower unsafe string constants
// to cn/n->string expressions rather than emitting an unreadable literal.
export const normalizeStrings = node => {
  if (Array.isArray(node)) return node.map(normalizeStrings);
  if (typeof node !== 'string' || (!node.includes('"') && !node.includes('c#'))) return node;
  const pieces = []; let chunk = '';
  const flush = () => { if (chunk) { pieces.push(chunk); chunk = ''; } };
  for (let i = 0; i < node.length; i++) {
    const c = node[i];
    if (c === '"' || (c === 'c' && node[i + 1] === '#')) {
      flush(); pieces.push([Symbol.for('n->string'), c.charCodeAt(0)]);
    } else chunk += c;
  }
  flush();
  return pieces.reduceRight((tail, piece) => [Symbol.for('cn'), piece, tail], '');
};
const encode = node => {
  if (Array.isArray(node)) return '(' + node.map(encode).join(' ') + ')';
  if (typeof node === 'string') return '"' + node + '"';
  if (typeof node === 'symbol') {
    const name = Symbol.keyFor(node);
    if (!name || /[\s()"]/.test(name)) throw new Error('KL symbol is not representable');
    return name;
  }
  if (typeof node === 'number' && Number.isFinite(node)) return String(node);
  throw new Error('Unsupported KL value');
};
export const serialize = node => encode(normalizeStrings(node));
