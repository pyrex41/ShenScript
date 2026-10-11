export default ($, { nativeDict = true } = {}) => {
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
  // Native property store. ShenOSKernel 42.2 (community lineage) builds
  // *property-vector* with init.kl's (shen.dict 20000) and implements
  // put/get/unput on top of dict.kl (shen.<-dict / shen.dict-> over hashed
  // buckets in an absvector). As on ShenOSKernel 41.x, ShenScript replaces the
  // dict layer with a native Map-backed store and overrides put, which updates
  // the per-key property alist in place. get and unput stay the kernel's own
  // and go through these natives. Atomic keys (symbols, strings, numbers,
  // booleans) are Map keys; any other key (lists, vectors, functions) falls
  // back to a structural (=) lookup, matching the kernel dict's semantics.
  // All of these are installed BEFORE (shen.initialise) runs (see
  // scripts/render.js), so the store is built and read by the same functions.
  // Note: the S42 Tarver-lineage shen.set-lambda-form-entry shim that wrote
  // into shen.*lambdatable* is gone: 42.2's own shen.set-lambda-form-entry
  // (declarations.kl) stores lambda forms under the shen.lambda-form property,
  // which is what fn and update-lambda-table read and invalidate.
  class Dict {
    constructor() {
      this.map = new Map();
      this.other = [];
    }
    get size() { return this.map.size + this.other.length; }
    static atomic(k) {
      const t = typeof k;
      return t === 'symbol' || t === 'string' || t === 'number' || t === 'boolean';
    }
    find(k) { return this.other.findIndex(([x]) => equate(x, k)); }
    has(k) { return Dict.atomic(k) ? this.map.has(k) : this.find(k) >= 0; }
    get(k) { return Dict.atomic(k) ? this.map.get(k) : this.other[this.find(k)][1]; }
    set(k, v) {
      if (Dict.atomic(k)) {
        this.map.set(k, v);
      } else {
        const i = this.find(k);
        if (i >= 0) {
          this.other[i][1] = v;
        } else {
          this.other.push([k, v]);
        }
      }
      return this;
    }
    delete(k) {
      if (Dict.atomic(k)) {
        this.map.delete(k);
      } else {
        const i = this.find(k);
        if (i >= 0) {
          this.other.splice(i, 1);
        }
      }
    }
    entries() { return [...this.map.entries(), ...this.other]; }
  }
  const asDict = x => x instanceof Dict ? x : raise('dict expected');
  // nativeDict is false only when bin/yggdrasil-build.js compiles a shaken
  // kernel of the pre-42.2 Tarver S42 lineage, whose *property-vector* is a
  // plain vector managed by its own put/get.
  if (nativeDict) {
    defun('put', (x, p, y, d) => {
      const current = asDict(d).has(x) ? d.get(x) : null;
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
    defun('shen.dict', n => asNumber(n) < 1 ? raise(`invalid initial dict size: ${$.show(n)}`) : new Dict());
    defun('shen.dict?', x => asShenBool(x instanceof Dict));
    defun('shen.dict-count', d => asDict(d).size);
    defun('shen.dict->', (d, k, v) => (asDict(d).set(k, v), v));
    defun('shen.<-dict', (d, k) => asDict(d).has(k) ? d.get(k) : raise(`value ${$.show(k)} not found in dict\n`));
    defun('shen.dict-rm', (d, k) => (asDict(d).delete(k), k));
    defun('shen.dict-fold', async (f, d, acc) => {
      for (const [k, v] of asDict(d).entries()) {
        acc = await settle(f(k, v, acc));
      }
      return acc;
    });
    defun('shen.dict-keys', d => toList(asDict(d).entries().map(([k]) => k)));
    defun('shen.dict-values', d => toList(asDict(d).entries().map(([, v]) => v)));
  }
  const oldShow = $.show;
  $.show = x => x instanceof Dict ? `<Dict ${x.size}>` : oldShow(x);
  //
  // native macroexpand: macro fns may return equal-but-freshly-built nodes on a
  // miss, so equality is checked locally at each macro-return site and original
  // references are kept whenever there is no semantic change. that preserves
  // identity all the way up the tree and makes the per-pass fixpoint check pure
  // reference equality instead of a full-tree deep compare.
  //
  // Mirrors 42.2's macroexpand / shen.macroexpand-h / shen.source-macro-walk
  // (macros.kl): every macro is applied bottom-up to a fixpoint, restarting
  // from the first macro after any change, and (42.1) a subform whose head has
  // a registered source-form handler (shen.*source-form-handlers*, an alist
  // keyed by head symbol) is left untouched - neither descended into nor passed
  // to a macro - so the reader can expand it with its handler afterwards.
  const applyMacro = async (f, x) => {
    const w = await settle(f(x));
    return w === x || equate(w, x) ? x : w;
  };
  const hasHandler = (handlers, x) => {
    if (!isCons(x) || handlers.length === 0) {
      return false;
    }
    return handlers.some(entry => isCons(entry) && equate(entry.head, x.head));
  };
  const macroWalk = async (f, x, handlers) => {
    if (isCons(x)) {
      if (hasHandler(handlers, x)) {
        return x;
      }
      let changed = false;
      const items = [];
      for (let c = x; isCons(c); c = c.tail) {
        const w = await macroWalk(f, c.head, handlers);
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
    // unbound in pre-42.1 kernels (e.g. a Tarver S42 shake via yggdrasil-build)
    const handlerCell = lookup('shen.*source-form-handlers*');
    const handlers = handlerCell.valueExists ? toArray(handlerCell.get()) : [];
    let v = x;
    for (let i = 0; i < fns.length;) {
      const w = await macroWalk(fns[i], v, handlers);
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
