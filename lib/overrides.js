export default $ => {
  const {
    asArray, asCons, asNumber, asOutStream, asShenBool, asString, cons, defun, equate,
    isArray, isCons, isSymbol, lookup, nameOf, raise, s, settle, toArray, toList, valueOf
  } = $;
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
  // The pristine S42 kernel leaves this hook to optional extensions.  The
  // bundled feature/expand-dynamic extensions still use it to register
  // lambda forms. Update S42's lambdatable table directly.
  defun('shen.set-lambda-form-entry', entry =>
    isCons(entry)
      ? (() => {
          const table = lookup('shen.*lambdatable*');
          table.set(cons(entry, table.get()));
          return entry;
        })()
      : raise('shen.set-lambda-form-entry'));
  // The S41.2 refresh dropped the dict layer (dict.kl): *property-vector* is now
  // a plain (vector 20000) and put/get/unput hash into it via the pointer
  // functions in sys.kl (shen.change-pointer-value / shen.remove-pointer). The
  // former native Map-backed put/shen.dict* overrides no longer have a kernel
  // counterpart to shadow, so they are gone; the kernel's own vector-based
  // implementation is compiled and used directly.
  //
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
  // The kernel's KL pr is gated on *hush*, which silences EVERY pr - even
  // writes to file sinks, so `shen eval -q ...` would emit empty output
  // files. shen-cl overrides pr natively with an unconditional write (its -q
  // does not silence pr at all); match the reference host. Char-capable
  // streams take the whole string, byte streams get it byte-by-byte exactly
  // as the kernel's shen.write-chars would.
  defun('pr', (str, stm) => {
    const out = asOutStream(stm);
    asString(str);
    if (typeof out.writeString === 'function') {
      out.writeString(str);
    } else {
      for (let i = 0; i < str.length; i++) {
        out.write(str.charCodeAt(i));
      }
    }
    return str;
  });
  const credits = lookup('shen.credits').f;
  const pr = lookup('pr').f;
  const stoutput = lookup('*stoutput*');
  defun('shen.credits', async () => {
    await settle(credits());
    return await settle(pr('exit REPL with (node.exit)', stoutput.get()));
  });
  return $;
};
