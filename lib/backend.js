import {
  Arrow, Assign, Await, Binary, Block, Call, Catch, Conditional, Id, Iife, Lets, Literal,
  Member, Return, SafeId, Sequence, Template, Try, Unary, Vector,
  generate, isStatement
} from './ast.js';
import {
  AsyncFunction,
  flatMap, last, most, produceState, raise, s
} from './utils.js';
import runtime from './runtime.js';

class Context {
  constructor(options) {
    Object.assign(this, options);
  }
  with(options)  { return new Context({ ...this, ...options }) }
  sync()         { return this.with({ async: false }); }
  now()          { return this.with({ head: true }); }
  later()        { return this.with({ head: false }); }
  add(...locals) { return this.with({ locals: new Map([...this.locals, ...locals]) }); }
  has(local)     { return this.locals.has(local); }
  get(local)     { return this.locals.get(local); }
  ann(local, dataType) {
    return this.with({ locals: new Map(this.locals).set(local, { ...(this.get(local) || {}), dataType }) });
  }
}

// TODO: if fabrs compose statements again, can use inline js.for, js.while, js.return, etc
//       making it easier to write overrides in Shen/KL
class Fabrication {
  constructor(ast, subs = {}) {
    this.ast = ast;
    this.subs = subs;
  }
  get keys() { return Object.keys(this.subs); }
  get values() { return Object.values(this.subs); }
}

const nameOf    = Symbol.keyFor;
const symbolOf  = Symbol.for;
const shenTrue  = s`true`;
const isNumber  = x => typeof x === 'number' && Number.isFinite(x);
const isString  = x => typeof x === 'string' || x instanceof String;
const isSymbol  = x => typeof x === 'symbol';
const isArray   = x => Array.isArray(x);
const isEArray  = x => isArray(x) && x.length === 0;
const isNeArray = x => isArray(x) && x.length > 0;
const asSymbol  = x => isSymbol(x) ? x : raise('symbol expected');

const Member$ = name => Member(Id('$'), Id(name));
const Call$ = (name, args, async = false) => Call(Member$(name), args, async);
const Call$f = (name, args, async = false) => inject(name, x => Call(Member(x, Id('f')), args, async));
const ann = (dataType, ast) =>
  ast instanceof Fabrication ? assemble(x => ann(dataType, x), ast) :
  Object.assign(ast, { dataType });
const cast = (dataType, ast) =>
  ast instanceof Fabrication ? assemble(x => cast(dataType, x), ast) :
  dataType !== ast.dataType ? Object.assign(Call$('as' + dataType, [ast]), { dataType }) :
  ast;
const uncast = ast =>
  ast instanceof Fabrication ? assemble(x => uncast(x), ast) :
  ast.dataType === 'JsBool' ? cast('ShenBool', ast) :
  ast;
const isForm = (expr, length, lead) =>
  isNeArray(expr) && expr[0] === symbolOf(lead) && (!length || expr.length === length);
const canInline = (context, expr) => {
  if (isNeArray(expr) && isSymbol(expr[0])) {
    const inliner = context.inlines.get(nameOf(expr[0]));
    return inliner && inliner.arity === expr.length - 1;
  }
  return false;
};
const calls = expr =>
  isForm(expr, 4, 'if') ? flatMap(expr.slice(1), calls) :
  isForm(expr, 0, 'cond') ? flatMap(flatMap(expr.slice(1), x => x), calls) :
  isForm(expr, 4, 'let') ? flatMap(expr.slice(2), calls) :
  isForm(expr, 3, 'lambda') ? calls(expr[2]) :
  isForm(expr, 3, 'type') ? calls(expr[1]) :
  isForm(expr, 2, 'function') && isSymbol(expr[1]) ? [expr[1]] :
  isNeArray(expr) ? [expr[0], ...flatMap(expr.slice(1), calls)] :
  [];
const primitives = [
  s`+`, s`-`, s`*`, s`/`, s`=`, s`<`, s`>`, s`<=`, s`>=`,
  s`cn`, s`str`, s`tlstr`, s`pos`, s`n->string`, s`string->n`, s`cons`, s`hd`, s`tl`,
  s`cons?`, s`number?`, s`string?`, s`absvector?`, s`abvector`, s`<-address`, s`address->`,
  s`set`, s`value`, s`type`, s`simple-error`, s`error-to-string`, s`get-time`,
  s`and`, s`or`, s`if`, s`cond`, s`let`, s`do`,
  s`shen.char-stinput?`, s`shen.char-stoutput?`, s`shen.read-unit-string`, s`shen.write-string`,

  // overrides
  s`shen.pvar?`, s`@p`, s`shen.byte->digit`, s`integer?`, s`symbol?`,
  s`variable?`, s`shen.fillvector`, s`put`,
  s`shen.dict`, s`shen.dict?`, s`shen.dict-count`, s`shen.dict->`,
  s`shen.<-dict`, s`shen.dict-rm`, s`shen.dict-keys`, s`shen.dict-values`
];
const hasExternalCalls = (f, body) => {
  const externals = new Set(calls(body));
  externals.delete(f);
  for (const primitive of primitives) {
    externals.delete(primitive);
  }
  return externals.size > 0;
};
// Scans a built syntax tree for awaits (bit 1) and uses of the w$ maybe-await
// slot (bit 2) belonging to the current function level: awaits nested in inner
// functions suspend the inner function, not this one, and every function that
// uses w$ declares its own, so the scan stops at function boundaries.
// Memoised: build is bottom-up and never adds awaits into an
// already-constructed node, so results are stable.
const scanCache = new WeakMap();
const scan = node => {
  if (!node || typeof node !== 'object') {
    return 0;
  }
  if (scanCache.has(node)) {
    return scanCache.get(node);
  }
  const result =
    isArray(node) ? node.reduce((r, x) => r | scan(x), 0) :
    node.type === 'ArrowFunctionExpression'
      || node.type === 'FunctionExpression' ? 0 :
    (node.type === 'AwaitExpression' ? 1 : 0)
      | (node.type === 'Identifier' && node.name === 'w$' ? 2 : 0)
      | Object.values(node).reduce((r, x) => r | scan(x), 0);
  scanCache.set(node, result);
  return result;
};
const containsAwait = node => (scan(node) & 1) !== 0;
const usesSlot = node => (scan(node) & 2) !== 0;
// Settled calls in async position only suspend when the callee actually
// returned a Promise: (w$ = $.t(f(...))) instanceof Promise ? await w$ : w$.
// w$ is declared once per enclosing function (see functionBody), so each
// invocation has its own slot; the assign-test-await sequence is synchronous,
// making reuse of one slot for every call site in the function safe.
const MaybeAwait = ast =>
  Conditional(
    Binary('instanceof', Assign(Id('w$'), ast), Id('Promise')),
    Await(Id('w$')),
    Id('w$'));
// Function bodies declare the maybe-await slot (when used at this level) and
// the flattened let bindings collected while building the body (see buildLet).
// Declarations are per-function, so every invocation gets fresh bindings for
// closures to capture.
const functionBody = (temps, body) => {
  const names = [...(usesSlot(body) ? ['w$'] : []), ...temps];
  return names.length === 0 ? body : Block(Lets(names.map(x => Id(x))), Return(body));
};
const fabricate = (x, subs) =>
  !(x instanceof Fabrication) ? new Fabrication(x, subs) :
  subs                        ? new Fabrication(x.ast, Object.assign({}, x.subs, subs)) :
  x;
const assemble = (f, ...xs) => {
  const fabrs = xs.map(x => fabricate(x));
  return fabricate(f(...fabrs.map(x => x.ast)), Object.assign({}, ...fabrs.map(x => x.subs)));
};
const inject = (name, f) => {
  const placeholder = SafeId(name, '$c');
  return fabricate(f(placeholder), { [placeholder.name]: Call(Member$('c'), [Literal(name)]) });
};
const variable = (context, symbol) => {
  const { dataType, id } = context.get(symbol);
  return ann(dataType, id ? Id(id) : SafeId(nameOf(symbol)));
};
const idle = symbol => {
  const name = nameOf(symbol);
  const placeholder = ann('Symbol', SafeId(name, '$s'));
  return fabricate(placeholder, { [placeholder.name]: Template(Member$('s'), name) });
};
const inlineName = (context, symbol) =>
  isSymbol(symbol) && !context.has(symbol)
    ? fabricate(Literal(nameOf(symbol)))
    : assemble(
        x => Call$('nameOf', [cast('Symbol', x)]),
        build(context.now(), symbol));
const strictlyEqualTypes = new Set(['Number', 'String', 'Symbol', 'Stream', 'Null', 'ShenBool']);
const referenceEquatable = (x, y) => strictlyEqualTypes.has(x.dataType) || strictlyEqualTypes.has(y.dataType);
const recognisors = new Map([
  ['absvector?', 'Array'],
  ['boolean?',   'ShenBool'],
  ['cons?',      'Cons'],
  ['number?',    'Number'],
  ['string?',    'String'],
  ['symbol?',    'Symbol']
]);
const recognise = (context, expr) => {
  if (isArray(expr) && expr.length === 2 && isSymbol(expr[0]) && context.has(expr[1])) {
    const type = recognisors.get(nameOf(expr[0]));
    return type ? context.ann(expr[1], type) : context;
  }
  return context;
};
const buildAnd = (context, [_and, left, right]) =>
  assemble(
    (x, y) => ann('JsBool', Binary('&&', cast('JsBool', x), cast('JsBool', y))),
    build(context.now(), left),
    build(recognise(context.now(), left), right));
const buildIf = (context, [_if, condition, ifTrue, ifFalse]) =>
  condition === shenTrue
    ? uncast(build(context, ifTrue))
    : assemble(
        (x, y, z) => Conditional(cast('JsBool', x), y, z),
        build(context.now(), condition),
        uncast(build(recognise(context, condition), ifTrue)),
        uncast(build(context, ifFalse)));
const buildCond = (context, [_cond, ...clauses]) =>
  build(context, clauses.reduceRight(
    (alternate, [test, consequent]) => [s`if`, test, consequent, alternate],
    [s`simple-error`, 'no condition was true']));
const buildDo = (context, [_do, ...exprs]) =>
  assemble(
    Sequence,
    ...most(exprs).map(x => build(context.now(), x)),
    uncast(build(context, last(exprs))));
// Inside a function, (let X Y Z) flattens to the sequence (X$tN = Y, Z) with
// X$tN alpha-renamed (unique per enclosing function) and declared in the
// function body (see functionBody): no iife, no promise, no await. Each let
// expression evaluates at most once per invocation of its enclosing function
// (KLambda has no loops), so single assignment per fresh binding holds and
// closures capture the right value. The $t suffix cannot collide with
// escaped names ($xx hex pairs), cells ($c), idles ($s) or params ($N$).
// At top level there is no enclosing function to host the declaration, so
// the historical iife form is kept.
const buildLet = (context, [_let, symbol, binding, body]) => {
  if (!context.fn) {
    return assemble(
      (y, z) => {
        const async = context.async && containsAwait(z);
        return Call(Arrow([SafeId(nameOf(asSymbol(symbol)))], functionBody([], z), async), [y], async);
      },
      uncast(build(context.now(), binding)),
      uncast(build(context.add([asSymbol(symbol), {}]), body)));
  }
  const name = `${SafeId(nameOf(asSymbol(symbol))).name}$t${context.fn.n++}`;
  context.fn.temps.push(name);
  return assemble(
    (y, z) => Sequence(Assign(Id(name), y), z),
    uncast(build(context.now(), binding)),
    uncast(build(context.add([asSymbol(symbol), { id: name }]), body)));
};
const trapBlock = statement =>
  Block(...(usesSlot(statement) ? [Lets([Id('w$')])] : []), statement);
const buildTrap = (context, [_trap, body, handler]) =>
  isForm(handler, 3, 'lambda')
    ? assemble(
        (x, y) => {
          const async = context.async && (containsAwait(x) || containsAwait(y));
          return Iife([], [], trapBlock(Try(
            Block(Return(x)),
            Catch(SafeId(nameOf(handler[1])), Block(Return(y))))), async);
        },
        uncast(build(context.now(), body)),
        uncast(build(context.add([asSymbol(handler[1]), { dataType: 'Error' }]), handler[2])))
    : assemble(
        (x, y) =>
          Iife([], [], trapBlock(Try(
            Block(Return(x)),
            Catch(Id('e$'), Block(Return(Call(y, [Id('e$')])))))), context.async),
        uncast(build(context.now(), body)),
        uncast(build(context, handler)));
const buildFunction = (context, params, body) => {
  const fn = { temps: [], n: 0 };
  return assemble(
    b => {
      // demote to a plain function when the compiled body never suspends:
      // callers always settle or maybe-await results, so a sync callee just
      // means the await gets skipped
      const async = context.async && containsAwait(b);
      return Call$('l', [Arrow(
        params.map(x => isSymbol(x) ? SafeId(nameOf(x)) : x),
        functionBody(fn.temps, b),
        async)]);
    },
    uncast(build(context.later().with({ fn }).add(...params.filter(isSymbol).map(x => [x, {}])), body)));
};
const buildNestedLambda = (context, params, body) =>
  isForm(body, 3, 'lambda')
    ? buildNestedLambda(context, [...params.map((p, i) => p === body[1] ? Id(`$${i}$`) : p), body[1]], body[2])
    : buildFunction(context, params, body);
const buildLambda = (context, [_lambda, param, body]) => buildNestedLambda(context, [param], body);
const buildFreeze = (context, [_freeze, body]) => buildFunction(context, [], body);
const buildDefun = (context, [_defun, symbol, params, body]) =>
  assemble(
    (s, b) => Call$('d', [s, b]),
    inlineName(context, symbol),
    buildFunction(hasExternalCalls(symbol, body) ? context : context.sync(), params, body));
const buildCons = (context, expr) => {
  const { result, state } = produceState(x => isForm(x, 3, 'cons'), x => x[1], x => x[2], expr);
  return isEArray(state) || state === null
    ? assemble(
        (...xs) => ann('Cons', Call$('r', [Vector(xs)])),
        ...result.map(x => uncast(build(context.now(), x))))
    : assemble(
        (x, ...xs) => ann('Cons', Call$('r', [Vector(xs), x])),
        uncast(build(context.now(), state)),
        ...result.map(x => uncast(build(context.now(), x))));
};
const buildSet = (context, [_set, symbol, value]) =>
  isSymbol(symbol) && !context.has(symbol)
    ? assemble(
        v => inject(nameOf(symbol), x => Call(Member(x, Id('set')), [v])),
        uncast(build(context.now(), value)))
    : assemble(
        (s, v) => Call(Member(Call(Member$('c'), [s]), Id('set')), [v]),
        inlineName(context, symbol),
        uncast(build(context.now(), value)));
const buildValue = (context, [_value, symbol]) =>
  isSymbol(symbol) && !context.has(symbol)
    ? inject(nameOf(symbol), x => Call(Member(x, Id('get')), []))
    : assemble(
        s => Call$('valueOf', [s]),
        inlineName(context, symbol));
const buildInline = (context, [fExpr, ...argExprs]) =>
  assemble(
    (...xs) => context.inlines.get(nameOf(fExpr))(...xs),
    ...argExprs.map(x => build(context.now(), x)));
const buildApp = (context, [fExpr, ...argExprs]) =>
  assemble(
    (f, ...args) =>
      !context.head  ? Call$('b', [f, ...args]) :
      context.async  ? MaybeAwait(Call$('t', [Call(f, args)])) :
      Call$('t', [Call(f, args)]),
    context.has(fExpr) ? fabricate(variable(context, fExpr)) :
    isArray(fExpr)     ? uncast(build(context.now(), fExpr)) :
    isSymbol(fExpr)    ? inject(nameOf(fExpr), x => Member(x, Id('f'))) :
    raise('not a valid application form'),
    ...argExprs.map(x => uncast(build(context.now(), x))));
const build = (context, expr) =>
  isNumber(expr) ? fabricate(ann('Number', Literal(expr))) :
  isString(expr) ? fabricate(ann('String', Literal(expr))) :
  isEArray(expr) ? fabricate(ann('Null',   Literal(null))) :
  isSymbol(expr) ? (context.has(expr) ? fabricate(variable(context, expr)) : idle(expr)) :
  isForm(expr, 3, 'and')        ? buildAnd   (context, expr) :
  isForm(expr, 4, 'if')         ? buildIf    (context, expr) :
  isForm(expr, 0, 'cond')       ? buildCond  (context, expr) :
  isForm(expr, 3, 'do')         ? buildDo    (context, expr) :
  isForm(expr, 4, 'let')        ? buildLet   (context, expr) :
  isForm(expr, 3, 'trap-error') ? buildTrap  (context, expr) :
  isForm(expr, 3, 'lambda')     ? buildLambda(context, expr) :
  isForm(expr, 2, 'freeze')     ? buildFreeze(context, expr) :
  isForm(expr, 4, 'defun')      ? buildDefun (context, expr) :
  isForm(expr, 3, 'cons')       ? buildCons  (context, expr) :
  isForm(expr, 3, 'set')        ? buildSet   (context, expr) :
  isForm(expr, 2, 'value')      ? buildValue (context, expr) :
  // (type X T) is an annotation: T is not evaluated
  isForm(expr, 3, 'type')       ? build(context, expr[1]) :
  canInline(context, expr)      ? buildInline(context, expr) :
  isArray(expr)                 ? buildApp   (context, expr) :
  raise('not a valid form');
const hoist = (fabr, async = false) =>
  fabr.keys.length === 0 && !async
    ? fabr.ast
    : Iife(fabr.keys.map(x => Id(x)), fabr.values, functionBody([], fabr.ast), async);

export default (options = {}) => {
  const $ = runtime(options);
  const context = new Context({ async: true, head: true, locals: new Map(), inlines: new Map() });
  const construct = expr => uncast(build(context, expr));
  const compile = expr => hoist(construct(expr), true);
  const inline = (name, dataType, paramTypes, f) => {
    const inliner = (...args) => {
      const ast = f(...args.map((a, i) => paramTypes[i] ? cast(paramTypes[i], a) : uncast(a)));
      return dataType ? ann(dataType, ast) : ast;
    };
    inliner.arity = f.length;
    context.inlines.set(name, inliner);
    return inliner;
  };
  Object.assign($, { assemble, construct, compile, inline });
  $.evalJs = ast => AsyncFunction('$', generate(isStatement(ast) ? Block(ast) : Return(ast)))($);
  // the eval-kl defun registered by the runtime reads $.evalKl dynamically
  $.evalKl = expr => $.evalJs(compile($.toArrayTree(expr)));
  inline('=', 'JsBool', [null, null], (x, y) =>
    referenceEquatable(x, y) ? Binary('===', x, y) : Call$('equate', [x, y]));
  inline('not',             'JsBool', ['JsBool'],                  x => Unary('!', x));
  inline('or',              'JsBool', ['JsBool', 'JsBool'],   (x, y) => Binary('||', x, y));
  inline('+',               'Number', ['Number', 'Number'],   (x, y) => Binary('+',  x, y));
  inline('-',               'Number', ['Number', 'Number'],   (x, y) => Binary('-',  x, y));
  inline('*',               'Number', ['Number', 'Number'],   (x, y) => Binary('*',  x, y));
  inline('/',               'Number', ['Number', 'NzNumber'], (x, y) => Binary('/',  x, y));
  inline('<',               'JsBool', ['Number', 'Number'],   (x, y) => Binary('<',  x, y));
  inline('>',               'JsBool', ['Number', 'Number'],   (x, y) => Binary('>',  x, y));
  inline('<=',              'JsBool', ['Number', 'Number'],   (x, y) => Binary('<=', x, y));
  inline('>=',              'JsBool', ['Number', 'Number'],   (x, y) => Binary('>=', x, y));
  inline('cn',              'String', ['String', 'String'],   (x, y) => Binary('+',  x, y));
  inline('str',             'String', [null],                      x => Call$('show', [x]));
  inline('intern',          'Symbol', ['String'],                  x => Call$('symbolOf', [x]));
  inline('number?',         'JsBool', [null],                      x => Call$('isNumber', [x]));
  inline('string?',         'JsBool', [null],                      x => Call$('isString', [x]));
  inline('cons?',           'JsBool', [null],                      x => Call$('isCons', [x]));
  inline('absvector?',      'JsBool', [null],                      x => Call$('isArray', [x]));
  inline('cons',            'Cons',   [null, null],           (x, y) => Call$('cons', [x, y]));
  inline('hd',               null,    ['Cons'],                    x => Member(x, Id('head')));
  inline('tl',               null,    ['Cons'],                    x => Member(x, Id('tail')));
  inline('error-to-string', 'String', ['Error'],                   x => Member(x, Id('message')));
  inline('simple-error',     null,    ['String'],                  x => Call$('raise', [x]));
  inline('read-byte',       'Number', ['InStream'],                x => Call(Member(x, Id('read')), []));
  inline('write-byte',      'Number', [null, null],           (x, y) => Call$f('write-byte', [x, y]));
  inline('get-time',        'Number', [null],                      x => Call$f('get-time', [x]));
  inline('string->n',       'Number', ['NeString'],                x => Call(Member(x, Id('charCodeAt')), [Literal(0)]));
  inline('n->string',       'String', ['Number'],                  x => Call(Member(Id('String'), Id('fromCharCode')), [x]));
  inline('tlstr',           'String', ['NeString'],                x => Call(Member(x, Id('substring')), [Literal(1)]));
  inline('pos',             'String', [null, null],           (x, y) => Call$f('pos', [x, y]));
  inline('absvector',       'Array',  [null],                      x => Call$f('absvector', [x]));
  inline('address->',       'Array',  [null, null, null],  (x, y, z) => Call$f('address->', [x, y, z]));
  return $;
};
