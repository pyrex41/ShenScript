// The KLambda runtime: everything compiled kernel/user code references on $,
// with no compiler. This module deliberately has ZERO imports and a single
// default export so build tools (bin/ratatoskr-build.js) can embed its source
// verbatim by replacing "export default" with a const declaration.
// eval-kl raises unless a compiler layer (lib/backend.js) is attached.

export default (options = {}) => {
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

  class Cons {
    constructor(head, tail) {
      this.head = head;
      this.tail = tail;
    }
  }

  class Trampoline {
    constructor(f, args) {
      this.f = f;
      this.args = args;
    }
  }

  class Cell {
    constructor(name) {
      this.name = name;
      this.f = () => raise(`function "${name}" is not defined`);
      this.value = undefined;
      this.valueExists = false;
    }
    set(x) {
      this.value = x;
      this.valueExists = true;
      return x;
    }
    get() {
      return this.valueExists ? this.value : raise(`global "${this.name}" is not defined`);
    }
  }

  const raise = x => { throw new Error(x); };
  const s = (x, y) => Symbol.for(String.raw(x, y));
  const produceState = (proceed, select, next, state, result = []) => {
    for (; proceed(state); state = next(state)) {
      result.push(select(state));
    }
    return { result, state };
  };
  const produce = (proceed, select, next, state, result = []) =>
    produceState(proceed, select, next, state, result).result;

  const nameOf     = Symbol.keyFor;
  const symbolOf   = Symbol.for;
  const shenTrue   = s`true`;
  const shenFalse  = s`false`;
  const isObject   = x => !Array.isArray(x) && typeof x === 'object' && x !== null;
  const isNumber   = x => typeof x === 'number' && Number.isFinite(x);
  const isNzNumber = x => isNumber(x) && x !== 0;
  const isString   = x => typeof x === 'string' || x instanceof String;
  const isNeString = x => isString(x) && x.length > 0;
  const isSymbol   = x => typeof x === 'symbol';
  const isFunction = x => typeof x === 'function';
  const isArray    = x => Array.isArray(x);
  const isEArray   = x => isArray(x) && x.length === 0;
  const isNeArray  = x => isArray(x) && x.length > 0;
  const isError    = x => x instanceof Error;
  const isCons     = x => x instanceof Cons;
  const isList     = x => x === null || isCons(x);
  const asNumber   = x => isNumber(x)   ? x : raise('number expected');
  const asNzNumber = x => isNzNumber(x) ? x : raise('non-zero number expected');
  const asString   = x => isString(x)   ? x : raise('string expected');
  const asNeString = x => isNeString(x) ? x : raise('non-empty string expected');
  const asSymbol   = x => isSymbol(x)   ? x : raise('symbol expected');
  const asFunction = x => isFunction(x) ? x : raise('function expected');
  const asArray    = x => isArray(x)    ? x : raise('array expected');
  const asCons     = x => isCons(x)     ? x : raise('cons expected');
  const asList     = x => isList(x)     ? x : raise('list expected');
  const asError    = x => isError(x)    ? x : raise('error expected');
  const asIndex    = (i, a) =>
    !Number.isInteger(i)   ? raise(`index ${i} is not valid`) :
    i < 0 || i >= a.length ? raise(`index ${i} is not with array bounds of [0, ${a.length})`) :
    i;
  const asShenBool = x => x ? shenTrue : shenFalse;
  const asJsBool   = x =>
    x === shenTrue  ? true :
    x === shenFalse ? false :
    raise('Shen boolean expected');

  const cons        = (h, t) => new Cons(h, t);
  const toArray     = x => isList(x) ? produce(isCons, c => c.head, c => c.tail, x) : x;
  const toArrayTree = x => isList(x) ? toArray(x).map(toArrayTree) : x;
  const toList      = (x, tail = null) => isArray(x) ? x.reduceRight((t, h) => cons(h, t), tail) : x;
  const toListTree  = x => isArray(x) ? toList(x.map(toListTree)) : x;

  const equateType = (x, y) => x.constructor === y.constructor && equate(Object.keys(x), Object.keys(y));
  const equate     = (x, y) =>
    x === y
    || isCons(x)   && isCons(y)   && equate(x.head, y.head) && equate(x.tail, y.tail)
    || isArray(x)  && isArray(y)  && x.length === y.length  && x.every((v, i) => equate(v, y[i]))
    || isObject(x) && isObject(y) && equateType(x, y)       && Object.keys(x).every(k => equate(x[k], y[k]));

  // Generic (rest/spread) paths, only taken for partial application,
  // over-application, zero-arg re-wrap, or arities above the specialization
  // cutoff. The hot path - calling a wrapper with exactly `arity` arguments -
  // goes through the fixed-parameter wrappers below, which avoid
  // materializing a rest array on every call (a dominant cost on JSC and a
  // measurable one on V8). `args` must be a real array here.
  const funSyncGeneric = (f, arity, args) =>
    args.length === arity ? f(...args) :
    args.length > arity ? bounce(() => asFunction(settle(f(...args.slice(0, arity))))(...args.slice(arity))) :
    args.length === 0 ? funSync(f, arity) :
    Object.assign(funSync((...more) => f(...args, ...more), arity - args.length), { arity: f.arity - args.length });
  const funAsyncGeneric = (f, arity, args) =>
    args.length === arity ? f(...args) :
    args.length > arity ? bounce(async () => asFunction(await settle(f(...args.slice(0, arity))))(...args.slice(arity))) :
    args.length === 0 ? funAsync(f, arity) :
    Object.assign(funAsync((...more) => f(...args, ...more), arity - args.length), { arity: f.arity - args.length });
  // Arity-specialized wrappers: `function` (not arrow) so `arguments` is
  // available to detect exact application without a rest parameter. `this`
  // is unused throughout.
  const slice = args => Array.prototype.slice.call(args);
  const funSyncs = [
    f => function () {
      return arguments.length === 0 ? f() : funSyncGeneric(f, 0, slice(arguments));
    },
    f => function (a) {
      return arguments.length === 1 ? f(a) : funSyncGeneric(f, 1, slice(arguments));
    },
    f => function (a, b) {
      return arguments.length === 2 ? f(a, b) : funSyncGeneric(f, 2, slice(arguments));
    },
    f => function (a, b, c) {
      return arguments.length === 3 ? f(a, b, c) : funSyncGeneric(f, 3, slice(arguments));
    },
    f => function (a, b, c, d) {
      return arguments.length === 4 ? f(a, b, c, d) : funSyncGeneric(f, 4, slice(arguments));
    }
  ];
  const funAsyncs = [
    f => async function () {
      return arguments.length === 0 ? f() : funAsyncGeneric(f, 0, slice(arguments));
    },
    f => async function (a) {
      return arguments.length === 1 ? f(a) : funAsyncGeneric(f, 1, slice(arguments));
    },
    f => async function (a, b) {
      return arguments.length === 2 ? f(a, b) : funAsyncGeneric(f, 2, slice(arguments));
    },
    f => async function (a, b, c) {
      return arguments.length === 3 ? f(a, b, c) : funAsyncGeneric(f, 3, slice(arguments));
    },
    f => async function (a, b, c, d) {
      return arguments.length === 4 ? f(a, b, c, d) : funAsyncGeneric(f, 4, slice(arguments));
    }
  ];
  const funSync = (f, arity) =>
    arity < funSyncs.length ? funSyncs[arity](f) :
    (...args) => funSyncGeneric(f, arity, args);
  const funAsync = (f, arity) =>
    arity < funAsyncs.length ? funAsyncs[arity](f) :
    async (...args) => funAsyncGeneric(f, arity, args);
  const fun = (f, arity = f.arity || f.length) =>
    Object.assign((f instanceof AsyncFunction ? funAsync : funSync)(f, arity), { arity });

  const bounce = (f, ...args) => new Trampoline(f, args);
  const future = async x => {
    while (x = await x, x instanceof Trampoline) {
      x = x.f(...x.args);
    }
    return x;
  };
  const settle = x => {
    for (;;) {
      if (x instanceof Trampoline) {
        x = x.f(...x.args);
      } else if (x instanceof Promise) {
        return future(x);
      } else {
        return x;
      }
    }
  };

  const globals = new Map();
  const lookup = name => {
    let cell = globals.get(name);
    if (!cell) {
      cell = new Cell(name);
      globals.set(name, cell);
    }
    return cell;
  };
  const valueOf = x => lookup(x).get();
  const openRead  = options.openRead  || (() => raise('open(in) not supported'));
  const openWrite = options.openWrite || (() => raise('open(out) not supported'));
  const open = (path, mode) =>
    mode === 'in'  ? openRead (asString(valueOf('*home-directory*')) + path) :
    mode === 'out' ? openWrite(asString(valueOf('*home-directory*')) + path) :
    raise(`open only accepts symbols in or out, not ${mode}`);
  const isInStream  = options.isInStream  || (options.InStream  && (x => x instanceof options.InStream))  || (() => false);
  const isOutStream = options.isOutStream || (options.OutStream && (x => x instanceof options.OutStream)) || (() => false);
  const asInStream  = x => isInStream(x)  ? x : raise('input stream expected');
  const asOutStream = x => isOutStream(x) ? x : raise('output stream expected');
  const isStream = x => isInStream(x) || isOutStream(x);
  const asStream = x => isStream(x) ? x : raise('stream expected');
  const clock = options.clock || (() => Date.now() / 1000);
  const startTime = clock();
  const getTime = mode =>
    mode === 'unix' ? clock() :
    mode === 'run'  ? clock() - startTime :
    raise(`get-time only accepts symbols unix or run, not ${mode}`);
  const showCons = x => {
    const { result, state } = produceState(isCons, x => x.head, x => x.tail, x);
    return `[${result.map(show).join(' ')}${state === null ? '' : ` | ${show(state)}`}]`;
  };
  const show = x =>
    x === null    ? '[]' :
    isString(x)   ? `"${x}"` :
    isSymbol(x)   ? nameOf(x) :
    isCons(x)     ? showCons(x) :
    isFunction(x) ? `<Function${x.arity ? ` ${x.arity}` : ''}>` :
    isArray(x)    ? `<Vector ${x.length}>` :
    isError(x)    ? `<Error "${x.toString()}">` :
    isStream(x)   ? `<Stream ${x.name}>` :
    `${x}`;
  const assign = (name, value) => lookup(name).set(value);
  const defun = (name, f) => (lookup(name).f = f.arity ? f : fun(f), symbolOf(name));
  const $ = {
    AsyncFunction,
    cons, toArray, toArrayTree, toList, toListTree,
    asJsBool, asShenBool, isEArray, isNeArray, asNeString, asNzNumber, globals, lookup, assign, defun,
    isStream, isInStream, isOutStream, isNumber, isString, isSymbol, isCons, isList, isArray, isError, isFunction,
    asStream, asInStream, asOutStream, asNumber, asString, asSymbol, asCons, asList, asArray, asError, asFunction,
    symbolOf, nameOf, valueOf, show, equate, raise, fun, bounce, settle,
    b: bounce, d: defun, l: fun, r: toList, s, t: settle, c: lookup
  };
  $.evalJs = _ => raise('eval is not available: no compiler is attached to this runtime');
  $.evalKl = _ => raise('eval is not available: no compiler is attached to this runtime');
  const out = options.stoutput;
  assign('*language*',       'JavaScript');
  assign('*implementation*', options.implementation || 'Unknown');
  assign('*release*',        options.release        || 'Unknown');
  assign('*os*',             options.os             || 'Unknown');
  assign('*port*',           options.port           || 'Unknown');
  assign('*porters*',        options.porters        || 'Unknown');
  assign('*stinput*',        options.stinput        || (() => raise('standard input not supported')));
  assign('*stoutput*',       out                    || (() => raise('standard output not supported')));
  assign('*sterror*',        options.sterror || out || (() => raise('standard output not supported')));
  assign('*home-directory*', options.homeDirectory  || '');
  assign('shen-script.*instream-supported*',  asShenBool(options.isInStream  || options.InStream));
  assign('shen-script.*outstream-supported*', asShenBool(options.isOutStream || options.OutStream));
  // only cons lists are forms: atoms, including absvectors, evaluate to themselves
  defun('eval-kl',           x => isCons(x) ? $.evalKl(x) : x);
  defun('if',        (b, x, y) => asJsBool(b) ? x : y);
  defun('and',          (x, y) => asShenBool(asJsBool(x) && asJsBool(y)));
  defun('or',           (x, y) => asShenBool(asJsBool(x) || asJsBool(y)));
  defun('open',         (p, m) => open(asString(p), nameOf(asSymbol(m))));
  defun('close',             x => (asStream(x).close(), null));
  defun('read-byte',         x => asInStream(x).read());
  defun('write-byte',   (b, x) => (asOutStream(x).write(asNumber(b)), b));
  defun('shen.char-stinput?',     x => asShenBool(isFunction(asInStream(x).readString)));
  defun('shen.char-stoutput?',    x => asShenBool(isFunction(asOutStream(x).writeString)));
  defun('shen.read-unit-string',  x => asInStream(x).readString());
  defun('shen.write-string', (s, x) => (asOutStream(x).writeString(asString(s)), s));
  defun('number?',           x => asShenBool(isNumber(x)));
  defun('string?',           x => asShenBool(isString(x)));
  defun('absvector?',        x => asShenBool(isArray(x)));
  defun('cons?',             x => asShenBool(isCons(x)));
  defun('hd',                c => asCons(c).head);
  defun('tl',                c => asCons(c).tail);
  defun('cons',                   cons);
  defun('tlstr',             x => asNeString(x).substring(1));
  defun('cn',           (x, y) => asString(x) + asString(y));
  defun('string->n',         x => asNeString(x).charCodeAt(0));
  defun('n->string',         n => String.fromCharCode(asNumber(n)));
  defun('pos',          (x, i) => asString(x)[asIndex(i, x)]);
  defun('str',                    show);
  defun('absvector',         n => new Array(asNumber(n)).fill(null));
  defun('<-address',    (a, i) => asArray(a)[asIndex(i, a)]);
  defun('address->', (a, i, x) => (asArray(a)[asIndex(i, a)] = x, a));
  defun('+',            (x, y) => asNumber(x) + asNumber(y));
  defun('-',            (x, y) => asNumber(x) - asNumber(y));
  defun('*',            (x, y) => asNumber(x) * asNumber(y));
  defun('/',            (x, y) => asNumber(x) / asNzNumber(y));
  defun('>',            (x, y) => asShenBool(asNumber(x) >  asNumber(y)));
  defun('<',            (x, y) => asShenBool(asNumber(x) <  asNumber(y)));
  defun('>=',           (x, y) => asShenBool(asNumber(x) >= asNumber(y)));
  defun('<=',           (x, y) => asShenBool(asNumber(x) <= asNumber(y)));
  defun('=',            (x, y) => asShenBool(equate(x, y)));
  defun('intern',            x => symbolOf(asString(x)));
  defun('get-time',          x => getTime(nameOf(asSymbol(x))));
  defun('simple-error',      x => raise(asString(x)));
  defun('error-to-string',   x => asError(x).message);
  defun('set',          (x, y) => lookup(nameOf(asSymbol(x))).set(y));
  defun('value',             x => valueOf(nameOf(asSymbol(x))));
  defun('type',         (x, _) => x);
  return $;
};
