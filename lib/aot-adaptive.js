// Optional bounded continuation lowering. First actual suspension executes the
// remaining expression in one native async continuation; no iterator per call.
import {
  Arrow, Await, Binary, Block, Call, Catch, Conditional, Const, Id, If,
  Member, Return, Sequence, Try, Vector
} from './ast.js';
const call$ = (name, args) => Call(Member(Id('$'), Id(name)), args);
const functionNode = node => ['ArrowFunctionExpression', 'FunctionExpression'].includes(node?.type);
const size = node => !node || typeof node !== 'object' ? 0 : Array.isArray(node) ? node.reduce((n, x) => n + size(x), 0) :
  Number(!!node.type) + Object.values(node).reduce((n, x) => n + size(x), 0);

export default (arrow, stats, name = null) => {
  const cache = new WeakMap(); let sites = 0, unsafe = false, serial = 0, steps = 0;
  const suspends = node => {
    if (!node || typeof node !== 'object' || functionNode(node)) return false;
    if (cache.has(node)) return cache.get(node);
    if (node.type === 'AwaitExpression') sites++;
    if (['ThisExpression', 'Super', 'MetaProperty', 'TryStatement'].includes(node.type)
      || (node.type === 'Identifier' && node.name === 'arguments')
      || (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'eval')) unsafe = true;
    const result = (Array.isArray(node) ? node : Object.values(node)).map(suspends).some(Boolean) || node.type === 'AwaitExpression';
    cache.set(node, result); return result;
  };
  suspends(arrow.body);
  const fallback = reason => {
    stats.fallback = (stats.fallback || 0) + 1; stats[reason] = (stats[reason] || 0) + 1;
    (stats.details ||= []).push({ name, optimized: false, reason }); return null;
  };
  if (unsafe || sites > 16) return fallback(unsafe ? 'unsafe' : 'siteBudget');
  const original = arrow.body.type === 'BlockStatement' ? arrow.body.body : [Return(arrow.body)];
  if (arrow.params.some(x => x.type !== 'Identifier')) return fallback('parameterShape');
  if (original.at(-1)?.type !== 'ReturnStatement' || original.slice(0, -1).some(x => x.type !== 'VariableDeclaration'
    || x.declarations.some(d => d.init != null || d.id.type !== 'Identifier'))) return fallback('bodyShape');
  const locals = new Set([...arrow.params.map(x => x.name), ...original.slice(0, -1).flatMap(x => x.declarations.map(d => d.id.name))]);
  const fresh = () => Id('aot$c' + serial++);
  const finish = (value, slow) => [Return(slow ? value : call$('aotReturn', [value]))];
  const suspend = (value, k, conditional) => {
    const id = fresh(), slow = Return(Call(Arrow([], Block(...k(Await(id), true)), true), []));
    return [Const(id, value), ...(conditional ? [If(Binary('instanceof', id, Id('Promise')), Block(slow), Block(...k(id, false)))] : [slow])];
  };
  // Once resumed, leave the whole unexecuted suffix in native expression form.
  // Prefix values are already captured, so no getter, call or argument replays.
  const parts = (nodes, k, values = []) => {
    if (!nodes.length) return k(values, false);
    return lower(nodes[0], (value, slow) => {
      if (slow) return k([...values, value, ...nodes.slice(1)], true);
      const id = fresh(); return [Const(id, value), ...parts(nodes.slice(1), k, [...values, id])];
    });
  };
  const lower = (node, k) => {
    if (++steps > 2048) throw new Error('adaptive construction budget exceeded');
    if (!suspends(node)) return k(node, false);
    if (node.optional || node.callee?.optional) throw new Error('unsupported optional reference');
    if (node.type === 'ConditionalExpression' && node.test.type === 'BinaryExpression'
      && node.test.operator === 'instanceof' && node.test.left.type === 'AssignmentExpression'
      && node.test.left.left.name === 'w$' && node.test.right.name === 'Promise'
      && node.consequent.type === 'AwaitExpression' && node.consequent.argument.name === 'w$'
      && node.alternate.name === 'w$') {
      const rhs = node.test.left.right;
      return lower(rhs, (value, slow) => slow ? k({ ...node, test: { ...node.test, left: { ...node.test.left, right: value } } }, true) : suspend(value, k, true));
    }
    if (node.type === 'AwaitExpression') return lower(node.argument, (value, slow) => slow ? k(Await(value), true) : suspend(value, k, false));
    if (node.type === 'ConditionalExpression') return lower(node.test, (test, slow) => slow ? k(Conditional(test, node.consequent, node.alternate), true) :
      [If(test, Block(...lower(node.consequent, k)), Block(...lower(node.alternate, k)))]);
    if (node.type === 'SequenceExpression') {
      const walk = nodes => nodes.length === 1 ? lower(nodes[0], k) : lower(nodes[0], (value, slow) => slow ? k(Sequence(value, ...nodes.slice(1)), true) :
        [ { type: 'ExpressionStatement', expression: value }, ...walk(nodes.slice(1)) ]);
      return walk(node.expressions);
    }
    if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
      if (node.operator === '??') throw new Error('unsupported nullish operator');
      if (node.operator === '&&' || node.operator === '||') return lower(node.left, (value, slow) => {
        if (slow) return k({ ...node, left: value }, true);
        const id = fresh(), right = Block(...lower(node.right, k)), left = Block(...k(id, false));
        return [Const(id, value), If(id, node.operator === '&&' ? right : left, node.operator === '&&' ? left : right)];
      });
      return parts([node.left, node.right], ([left, right], slow) => k({ ...node, left, right }, slow));
    }
    if (node.type === 'UnaryExpression') return lower(node.argument, (argument, slow) => k({ ...node, argument }, slow));
    if (node.type === 'AssignmentExpression' && node.operator === '=' && node.left.type === 'Identifier' && locals.has(node.left.name)) return lower(node.right, (right, slow) => k({ ...node, right }, slow));
    if (node.type === 'ArrayExpression' && node.elements.every(x => x && x.type !== 'SpreadElement')) return parts(node.elements, (elements, slow) => k({ ...node, elements }, slow));
    if (node.type === 'MemberExpression') return node.computed
      ? parts([node.object, node.property], ([object, property], slow) => k({ ...node, object, property }, slow))
      : lower(node.object, (object, slow) => k({ ...node, object }, slow));
    if (node.type === 'CallExpression' && !node.arguments.some(x => x.type === 'SpreadElement')) {
      const callee = node.callee;
      // Compiler runtime methods are fixed for this explicit profile. Their
      // values need not be captured before an argument changes an ordinary cell.
      if (callee.type === 'MemberExpression' && callee.object.name === '$') return parts(node.arguments, (args, slow) => k(Call(callee, args), slow));
      if (callee.type === 'MemberExpression') {
        return parts([callee.object, ...(callee.computed ? [callee.property] : [])], ([object, property], slow) => {
          const member = { ...callee, object, ...(callee.computed ? { property } : {}) };
          if (slow) return k(Call(member, node.arguments), true);
          const f = fresh();
          return [Const(f, member), ...parts(node.arguments, (args, resumed) => k(Call(Member(Id('Reflect'), Id('apply')), [f, object, Vector(args)]), resumed))];
        });
      }
      return lower(callee, (value, slow) => {
        if (slow) return k(Call(value, node.arguments), true);
        const f = fresh(); return [Const(f, value), ...parts(node.arguments, (args, resumed) => k(Call(f, args), resumed))];
      });
    }
    throw new Error('unsupported adaptive expression: ' + node.type);
  };
  let body;
  try { body = lower(original.at(-1).argument, finish); } catch { return fallback('expressionShape'); }
  const result = Arrow(arrow.params, Block(...original.slice(0, -1), Try(Block(...body), Catch(Id('aot$error'), Block(Return(call$('aotError', [Id('aot$error')])))))));
  if (size(result) > Math.min(size(arrow) * 4 + 128, 20000)) return fallback('sizeBudget');
  stats.functions = (stats.functions || 0) + 1; stats.awaits = (stats.awaits || 0) + sites;
  (stats.details ||= []).push({ name, optimized: true, awaits: sites, inputNodes: size(arrow), outputNodes: size(result) });
  return result;
};

// Avoid WeakMap probes that cannot reach an adapted definition in this build.
// Public calls remain correct if a later eval/redefinition installs a worker.
export const pruneAdaptiveCalls = (tree, stats) => {
  const names = new Set(stats.names || []);
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (node.aotCallee && !names.has(node.aotCallee)) {
      const [, f, ...args] = node.arguments;
      Object.assign(node, { callee: f, arguments: args });
      stats.publicCalls = (stats.publicCalls || 0) + 1;
    }
    delete node.aotCallee;
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else walk(value);
  };
  walk(tree);
};
