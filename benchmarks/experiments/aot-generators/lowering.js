// Generator-based M3 experiment: native syntax preserves operand order and
// per-invocation bindings without copying a continuation at every await site.
import { Arrow, Block, Call, Generator, Id, Member, Return, Yield } from './ast.js';

export default (arrow, stats) => {
  let awaits = 0, unsafe = false;
  const rewrite = node => {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(rewrite);
    if (['ArrowFunctionExpression', 'FunctionExpression'].includes(node.type)) return node;
    if (['TryStatement', 'ThisExpression', 'Super', 'MetaProperty'].includes(node.type)
      || (node.type === 'Identifier' && node.name === 'arguments')) unsafe = true;
    if (node.type === 'AwaitExpression') { awaits++; return Yield(rewrite(node.argument)); }
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, rewrite(value)]));
  };
  const body = rewrite(arrow.body);
  if (unsafe || !awaits) { stats.fallback = (stats.fallback || 0) + 1; return null; }
  stats.functions = (stats.functions || 0) + 1; stats.awaits = (stats.awaits || 0) + awaits;
  return Arrow(arrow.params, Call(Member(Id('$'), Id('aotStart')), [Call(Generator(null, [], body.type === 'BlockStatement' ? body : Block(Return(body))), [])]));
};
