export default $ => {
  const {
    asArray, asCons, asNumber, asShenBool, cons, defun, equate,
    isArray, isCons, isSymbol, lookup, nameOf, raise, s, settle, toArray, toList, valueOf
  } = $;
  const asMap = x => x instanceof Map ? x : raise('dict expected');
  const isUpper = x => x >= 65 && x <= 90;
  const pvar = s`shen.pvar`;
  const tuple = s`shen.tuple`;
  const t$ = s`true`;
  const f$ = s`false`;
  defun('@p', (x, y) => [tuple, x, y]);
  defun('shen.pvar?', x => asShenBool(isArray(x) && x.length > 0 && x[0] === pvar));
  defun('shen.byte->digit', x => x - 48);
  defun('integer?', x => asShenBool(Number.isInteger(x)));
  defun('symbol?', x => asShenBool(isSymbol(x) && x !== t$ && x !== f$));
  defun('variable?', x => asShenBool(isSymbol(x) && isUpper(nameOf(x).charCodeAt(0))));
  defun('shen.fillvector', (xs, i, max, x) => asArray(xs).fill(x, asNumber(i), asNumber(max) + 1));
  defun('put', (x, p, y, d) => {
    const current = asMap(d).has(x) ? d.get(x) : null;
    const array = toArray(current);
    for (const element of array) {
      if (equate(p, asCons(element).head)) {
        element.tail = y;
        d.set(x, toList(array));
        return y;
      }
    }
    array.push(cons(p, y));
    d.set(x, toList(array));
    return y;
  });
  defun('shen.dict', _ => new Map());
  defun('shen.dict?', x => asShenBool(x instanceof Map));
  defun('shen.dict-count', d => asMap(d).size);
  defun('shen.dict->', (d, k, v) => (asMap(d).set(k, v), v));
  defun('shen.<-dict', (d, k) => asMap(d).has(k) ? d.get(k) : raise(`value ${$.show(k)} not found in dict\n`));
  defun('shen.dict-rm', (d, k) => (asMap(d).delete(k), k));
  defun('shen.dict-fold', async (f, d, acc) => {
    for (const [k, v] of asMap(d)) {
      acc = await settle(f(k, v, acc));
    }
    return acc;
  });
  defun('shen.dict-keys', d => toList([...asMap(d).keys()]));
  defun('shen.dict-values', d => toList([...asMap(d).values()]));
  // native macroexpand: macro fns may return equal-but-freshly-built nodes on a
  // miss, so equality is checked locally at each macro-return site and original
  // references are kept whenever there is no semantic change. that preserves
  // identity all the way up the tree and makes the per-pass fixpoint check pure
  // reference equality instead of a full-tree deep compare.
  const applyMacro = async (f, x) => {
    const w = await settle(f(x));
    return w === x || equate(w, x) ? x : w;
  };
  const macroWalk = async (f, x) => {
    if (isCons(x)) {
      let changed = false;
      const items = [];
      for (let c = x; isCons(c); c = c.tail) {
        const w = await macroWalk(f, c.head);
        changed = changed || w !== c.head;
        items.push(w);
      }
      const rebuilt = changed ? toList(items) : x;
      return await applyMacro(f, rebuilt);
    }
    return await applyMacro(f, x);
  };
  defun('macroexpand', async x => {
    const fns = toArray(valueOf('*macros*')).map(p => asCons(p).tail);
    let v = x;
    for (let i = 0; i < fns.length;) {
      const w = await macroWalk(fns[i], v);
      if (w === v) {
        i++;
      } else {
        v = w;
        i = 0;
      }
    }
    return v;
  });
  const oldShow = $.show;
  $.show = x => x instanceof Map ? `<Dict ${x.size}>` : oldShow(x);
  const credits = lookup('shen.credits').f;
  const pr = lookup('pr').f;
  const stoutput = lookup('*stoutput*');
  defun('shen.credits', async () => {
    await settle(credits());
    return await settle(pr('exit REPL with (node.exit)', stoutput.get()));
  });
  return $;
};
