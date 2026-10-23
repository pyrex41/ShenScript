// Diagnostic-only AST transformation. It does not change async classification.
import { Block, Call, Const, Id, Literal, Member, Return, Try, Unary } from '../../lib/ast.js';

const hook = (name, args) => Call(Member(Id('$'), Id(name)), args);
const member = (node, name) => node?.type === 'MemberExpression'
  && node.object?.type === 'Identifier' && node.object.name === '$'
  && node.property?.name === name;
const frame = () => Id('boundary$frame');

export const createInstrumenter = (firstId = 1) => {
  let nextId = firstId;
  const metadata = {};
  const instrument = (input, source = 'eval') => {
    let anonymous = 0;
    const visit = (node, context = { owner: source }) => {
      if (Array.isArray(node)) return node.map(x => visit(x, context));
      if (!node || typeof node !== 'object') return node;
      if (node.type === 'CallExpression' && member(node.callee, 'd')
          && typeof node.arguments[0]?.value === 'string') {
        const owner = node.arguments[0].value;
        return { ...node, arguments: [visit(node.arguments[0], context),
          visit(node.arguments[1], { owner, primary: true }),
          ...node.arguments.slice(2).map(x => visit(x, context))] };
      }
      const decorate = (fn, name, kind) => {
        const id = nextId++;
        const ownsAwait = node => {
          if (!node || typeof node !== 'object') return false;
          if (Array.isArray(node)) return node.some(ownsAwait);
          if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') return false;
          return node.type === 'AwaitExpression' || Object.values(node).some(ownsAwait);
        };
        const root = fn.body.type === 'BlockStatement' ? fn.body.body.at(-1)?.argument : fn.body;
        const rootShape = root?.type;
        const splitConditional = root?.type === 'ConditionalExpression' && !ownsAwait(root.test)
          && (!ownsAwait(root.consequent) || !ownsAwait(root.alternate));
        metadata[id] = { name, kind, async: !!fn.async, arity: fn.params.length, source, awaitSites: 0, rootShape, splitConditional,
          consequentAwaits: root?.type === 'ConditionalExpression' ? ownsAwait(root.consequent) : null,
          alternateAwaits: root?.type === 'ConditionalExpression' ? ownsAwait(root.alternate) : null };
        const inner = { owner: name, frameId: id, root };
        const body = fn.body.type === 'BlockStatement' ? visit(fn.body, inner)
          : Block(Return(hook('boundaryReturn', [frame(), visit(fn.body, inner)])));
        return { ...fn, body: Block(
          Const(frame(), hook('boundaryEnter', [Literal(id)])),
          { ...Try(body, null), finalizer: Block(hook('boundaryExit', [frame()])) }) };
      };
      if (node.type === 'CallExpression' && member(node.callee, 'l')
          && node.arguments[0]?.type === 'ArrowFunctionExpression') {
        const name = context.primary ? context.owner : `${context.owner}/lambda-${++anonymous}`;
        return { ...node, arguments: [decorate(node.arguments[0], name, context.primary ? 'defun' : 'lambda'),
          ...node.arguments.slice(1).map(x => visit(x, context))] };
      }
      if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
        return decorate(node, `${context.owner}/iife-${++anonymous}`, 'iife');
      }
      if (node.type === 'ConditionalExpression' && node === context.root) {
        return { ...node, test: hook('boundaryBranch', [frame(), visit(node.test, context)]),
          consequent: visit(node.consequent, context), alternate: visit(node.alternate, context) };
      }
      if (node.type === 'AwaitExpression' && context.frameId !== undefined) {
        const site = ++metadata[context.frameId].awaitSites;
        return { ...node, argument: hook('boundaryAwait', [frame(), Literal(site), visit(node.argument, context)]) };
      }
      if (node.type === 'ReturnStatement' && context.frameId !== undefined) {
        return { ...node, argument: hook('boundaryReturn', [frame(),
          node.argument ? visit(node.argument, context) : Unary('void', Literal(0))]) };
      }
      return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, visit(value, context)]));
    };
    return visit(input);
  };
  return { instrument, metadata, nextId: () => nextId };
};

export const attachBoundaryCounters = ($, staticMetadata, dynamic, phaseOf = () => globalThis.SS_BOUNDARY_PHASE || 'outside') => {
  const stats = Object.create(null);
  const names = new WeakMap();
  for (const [name, cell] of $.globals) names.set(cell.f, name);
  const register = $.d;
  $.d = $.defun = (name, f) => {
    const value = register(name, f);
    names.set($.lookup(name).f, name);
    return value;
  };
  const Trampoline = $.bounce(() => null).constructor;
  const definition = id => staticMetadata[id] || dynamic.metadata[id];
  $.boundaryEnter = id => {
    const phase = phaseOf();
    const key = `${phase}:${id}`;
    const row = stats[key] ||= { id, phase, ...definition(id), calls: 0, completed: 0,
      zeroAwaits: 0, awaitEvents: 0, exceptions: 0, values: 0, trampolines: 0,
      promises: 0, rootTrue: 0, rootFalse: 0, zeroAwaitValues: 0, zeroAwaitTrampolines: 0, zeroAwaitPromises: 0, tailTargets: Object.create(null) };
    row.calls++;
    return { row, awaits: 0, returned: false, kind: undefined };
  };
  $.boundaryBranch = (state, condition) => {
    state.row[condition ? 'rootTrue' : 'rootFalse']++;
    return condition;
  };
  $.boundaryAwait = (state, _site, value) => {
    state.awaits++; state.row.awaitEvents++;
    return value;
  };
  $.boundaryReturn = (state, value) => {
    state.returned = true;
    state.kind = value instanceof Promise ? 'promises' : value instanceof Trampoline ? 'trampolines' : 'values';
    if (state.kind === 'trampolines') {
      const target = names.get(value.f) || '<native/lambda/unmapped>';
      state.row.tailTargets[target] = (state.row.tailTargets[target] || 0) + 1;
    }
    return value;
  };
  $.boundaryExit = state => {
    const row = state.row; row.completed++;
    if (!state.returned) row.exceptions++;
    else {
      row[state.kind]++;
      if (!state.awaits) {
        row.zeroAwaits++;
        row[{ values: 'zeroAwaitValues', trampolines: 'zeroAwaitTrampolines', promises: 'zeroAwaitPromises' }[state.kind]]++;
      }
    }
  };
  return { stats, definition };
};
