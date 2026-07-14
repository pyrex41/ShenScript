import fs from 'node:fs';
import { parseKernel, parseKernelPostOverride } from './parser.js';
import backend from '../lib/backend.js';
import {
  Arrow, Block, Call, Const, ExportDefault, Id, ImportDefault, Let, Program, Return,
  generate
} from '../lib/ast.js';
import { formatDuration, formatGrid, measure } from './utils.js';

console.log('- parsing kernel...');
const measureParse = measure(() => ({
  pre:  parseKernel(),
  post: parseKernelPostOverride()
}));
console.log(`  parsed in ${formatDuration(measureParse.duration)}`);

console.log(`- creating backend...`);
const measureBackend = measure(() => backend());
const { assemble, construct, isArray } = measureBackend.result;
console.log(`  created in ${formatDuration(measureBackend.duration)}`);

console.log('- rendering kernel...');
const measureRender = measure(() => {
  const body = assemble(
    Block,
    // Boot the kernel modules, install ShenScript's native overrides, then boot
    // the modules whose top-level forms need those overrides: declarations' init
    // forms (property vector, arity/lambda tables, external symbols) and types'
    // 161 (declare ...) forms, which drive the prolog type engine and so need the
    // synchronous native @p / shen.pvar?. This mirrors 41.1's sequence, where the
    // equivalent setup ran in shen.initialise after overrides. See scripts/config.js.
    ...measureParse.result.pre.filter(isArray).map(construct),
    Call(Id('overrides'), [Id('$')]),
    ...measureParse.result.post.filter(isArray).map(construct));
  return generate(
    Program([
      ImportDefault(Id('overrides'), './overrides.js'),
      ExportDefault(Arrow(
        [Id('$')],
        Block(
          Let(Id('w$')), // maybe-await slot for top-level forms (see lib/backend.js)
          ...Object.entries(body.subs).map(([key, value]) => Const(Id(key), value)),
          ...body.ast.body,
          Return(Id('$'))),
        true))]));
});
const syntax = measureRender.result;
console.log(`  rendered in ${formatDuration(measureRender.duration)}, ${syntax.length} chars`);

console.log('- writing file...');
const measureWrite = measure(() => fs.writeFileSync(`lib/kernel.js`, syntax));
console.log(`  written in ${formatDuration(measureWrite.duration)}`);
console.log();

console.log(formatGrid(['kernel.js', `${syntax.length} chars`, formatDuration(measureRender.duration)]));
