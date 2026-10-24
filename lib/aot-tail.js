// Optional self-tail lowering. Only called for sealed, synchronous functions
// with no closures or traps. Markers originate in scope-aware buildApp.
import { Assign, Block, Const, Id, If, Literal, Return, Statement, While } from './ast.js';

export default (arrow, emitted) => {
  let sites = 0;
  const lower = node => {
    if (node.aotSelfTail) {
      sites++;
      const args = node.arguments.slice(1), temps = args.map((_, i) => Id('aot$a' + i));
      return [
        ...args.map((arg, i) => Const(temps[i], arg)),
        ...arrow.params.map((param, i) => Statement(Assign(param, temps[i]))),
        { type: 'ContinueStatement', label: null }
      ];
    }
    if (node.type === 'ConditionalExpression') return [If(node.test, Block(...lower(node.consequent)), Block(...lower(node.alternate)))];
    if (node.type === 'SequenceExpression') return [...node.expressions.slice(0, -1).map(Statement), ...lower(node.expressions.at(-1))];
    return [Return(node)];
  };
  const block = arrow.body.type === 'BlockStatement' ? arrow.body.body : [Return(arrow.body)];
  const last = block.at(-1);
  if (last.type !== 'ReturnStatement') return arrow;
  const body = lower(last.argument);
  if (!sites) return arrow;
  emitted.tailLoops = (emitted.tailLoops || 0) + 1;
  emitted.selfTailSites = (emitted.selfTailSites || 0) + sites;
  return { ...arrow, body: Block(...block.slice(0, -1), While(Literal(true), Block(...body))) };
};
