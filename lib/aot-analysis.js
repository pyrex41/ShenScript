// Scope-aware facts for optional AOT modes. This is not a purity/type proof.
const sym = name => Symbol.for(name);
const symbolName = value => typeof value === 'symbol' ? Symbol.keyFor(value) : null;
const form = (value, name) => Array.isArray(value) && value[0] === sym(name);

export const analyzeAot = (forms, { nativeNames = new Set() } = {}) => {
  const definitions = new Map(), mutated = new Set();
  let unknownDefinition = false;
  const calls = [], topCalls = [];
  for (const node of forms) {
    if (!form(node, 'defun')) continue;
    const name = symbolName(node[1]);
    if (name === null || !Array.isArray(node[2]) || !node[2].every(x => typeof x === 'symbol')) {
      throw new Error('AOT analysis requires ordinary named KL definitions');
    }
    const list = definitions.get(name) || []; list.push(node); definitions.set(name, list);
  }
  const facts = new Map([...definitions].map(([name, defs]) => [name, {
    name, arity: defs.at(-1)[2].length, definitions: defs.length, calls: [],
    hasClosure: false, hasTrap: false, hasNestedDefinition: false
  }]));
  const walk = (node, locals, tail, owner, closure = false) => {
    if (!Array.isArray(node) || node.length === 0) return;
    const head = symbolName(node[0]), fact = facts.get(owner);
    if (head === 'defun') {
      if (fact) fact.hasNestedDefinition = true;
      const name = symbolName(node[1]);
      if (name === null || locals.has(node[1])) unknownDefinition = true; else mutated.add(name);
      const args = Array.isArray(node[2]) ? node[2] : [];
      walk(node[3], new Set([...locals, ...args]), true, owner, true); return;
    }
    if (head === 'lambda' || head === 'freeze') {
      if (fact) fact.hasClosure = true;
      walk(node[head === 'lambda' ? 2 : 1], new Set([...locals, ...(head === 'lambda' ? [node[1]] : [])]), true, owner, true); return;
    }
    if (head === 'let') {
      walk(node[2], locals, false, owner, closure);
      walk(node[3], new Set([...locals, node[1]]), tail, owner, closure); return;
    }
    if (head === 'if') {
      walk(node[1], locals, false, owner, closure);
      walk(node[2], locals, tail, owner, closure); walk(node[3], locals, tail, owner, closure); return;
    }
    if (head === 'cond') {
      for (const clause of node.slice(1)) {
        walk(clause[0], locals, false, owner, closure); walk(clause[1], locals, tail, owner, closure);
      }
      return;
    }
    if (head === 'do') {
      node.slice(1).forEach((part, i) => walk(part, locals, tail && i === node.length - 2, owner, closure)); return;
    }
    if (head === 'type') { walk(node[1], locals, tail, owner, closure); return; }
    if (head === 'trap-error') {
      if (fact) fact.hasTrap = true;
      walk(node[1], locals, false, owner, closure); walk(node[2], locals, false, owner, closure); return;
    }
    if (head === 'and' || head === 'or' || head === 'cons') {
      node.slice(1).forEach(x => walk(x, locals, false, owner, closure)); return;
    }
    if (head === 'set' || head === 'value') {
      if (Array.isArray(node[1])) walk(node[1], locals, false, owner, closure);
      if (head === 'set') walk(node[2], locals, false, owner, closure);
      const call = { owner, callee: head, arity: node.length - 1, local: false, tail: false, closure };
      calls.push(call); if (fact) fact.calls.push(call); else topCalls.push(call); return;
    }
    const local = head !== null && locals.has(node[0]);
    const call = { owner, callee: head, arity: node.length - 1, local, tail, closure };
    calls.push(call); if (fact) fact.calls.push(call); else topCalls.push(call);
    if (Array.isArray(node[0])) walk(node[0], locals, false, owner, closure);
    node.slice(1).forEach(x => walk(x, locals, false, owner, closure));
  };
  for (const node of forms) {
    if (form(node, 'defun')) walk(node[3], new Set(node[2]), true, symbolName(node[1]));
    else walk(node, new Set(), false, null);
  }
  const eligible = new Set();
  for (const [name, fact] of facts) {
    const reasons = [];
    if (nativeNames.has(name)) reasons.push('native or override binding');
    if (fact.definitions !== 1) reasons.push('multiple definitions');
    if (mutated.has(name)) reasons.push('nested definition may replace binding');
    if (unknownDefinition) reasons.push('computed definition target in program');
    const params = definitions.get(name).at(-1)[2];
    if (new Set(params).size !== params.length) reasons.push('duplicate parameters');
    fact.reasons = reasons; fact.eligible = reasons.length === 0;
    if (fact.eligible) eligible.add(name);
  }
  // Iterative Kosaraju traversal: analysis depth must not use the JS call stack.
  const graph = new Map(), reverse = new Map([...facts.keys()].map(name => [name, []]));
  for (const [name, fact] of facts) {
    const edges = [...new Set(fact.calls.filter(x => !x.local && facts.has(x.callee)).map(x => x.callee))];
    graph.set(name, edges); for (const target of edges) reverse.get(target).push(name);
  }
  const seen = new Set(), order = [];
  for (const name of facts.keys()) {
    if (seen.has(name)) continue;
    const stack = [[name, false]];
    while (stack.length) {
      const [current, exit] = stack.pop();
      if (exit) { order.push(current); continue; }
      if (seen.has(current)) continue;
      seen.add(current); stack.push([current, true]);
      for (const target of graph.get(current)) if (!seen.has(target)) stack.push([target, false]);
    }
  }
  const assigned = new Set(), components = [];
  for (const name of order.reverse()) {
    if (assigned.has(name)) continue;
    const component = [], stack = [name]; assigned.add(name);
    while (stack.length) {
      const current = stack.pop(); component.push(current);
      for (const target of reverse.get(current)) if (!assigned.has(target)) { assigned.add(target); stack.push(target); }
    }
    components.push(component);
  }
  for (const call of calls) {
    call.exact = !call.local && eligible.has(call.callee) && facts.get(call.callee).arity === call.arity;
    call.reason = call.exact ? 'eligible exact-arity binding' : call.local ? 'lexical function value' : call.callee === null ? 'computed callee'
      : !facts.has(call.callee) ? (nativeNames.has(call.callee) ? 'native binding' : 'external binding')
        : !eligible.has(call.callee) ? 'binding not eligible' : 'partial or overapplication';
  }
  const workers = new Map([...eligible].map((name, i) => [name, 'aot$w' + i]));
  const report = { definitions: facts.size, eligible: eligible.size, unknownDefinition,
    functions: [...facts.values()], components, topCalls,
    counts: { calls: calls.length, exactHeadCalls: calls.filter(x => x.exact && !x.tail).length,
      exactTailCalls: calls.filter(x => x.exact && x.tail).length, unknownCalls: calls.filter(x => x.callee === null || x.local || (!facts.has(x.callee) && !nativeNames.has(x.callee))).length } };
  return { eligible, workers, facts, report };
};
