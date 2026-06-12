import fs from 'node:fs';
import { parseKernel } from './parser.js';
import backend from '../lib/backend.js';
import {
  Arrow, Block, Call, Const, ExportDefault, Id, ImportDefault, Let, Program, Return, Statement,
  generate
} from '../lib/ast.js';
import { formatDuration, formatGrid, measure } from './utils.js';

console.log('- parsing kernel...');
const measureParse = measure(parseKernel);
console.log(`  parsed in ${formatDuration(measureParse.duration)}`);

console.log(`- creating backend...`);
const measureBackend = measure(() => backend());
const { assemble, construct, isArray, s } = measureBackend.result;
console.log(`  created in ${formatDuration(measureBackend.duration)}`);

console.log('- rendering kernel...');
const measureRender = measure(() => {
  const body = assemble(
    Block,
    ...measureParse.result.filter(isArray).map(construct),
    Call(Id('overrides'), [Id('$')]),
    assemble(Statement, construct([s`shen.initialise`])));
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
