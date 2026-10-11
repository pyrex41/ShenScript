import fs from 'node:fs';
import { parseKernel } from './parser.js';
import config from './config.js';
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
const { assemble, construct, isArray, symbolOf } = measureBackend.result;
console.log(`  created in ${formatDuration(measureBackend.duration)}`);

console.log('- rendering kernel...');
const measureRender = measure(() => {
  const body = assemble(
    Block,
    // Define every kernel module (defuns only), install ShenScript's native
    // overrides, then run the kernel's own initialisation: init.kl's
    // (shen.initialise) builds the shen.dict property store, arity table,
    // lambda forms and type signatures, and (stlib.initialise) registers the
    // precompiled standard library. Initialisation must run after the
    // overrides: the type engine needs the synchronous native @p / shen.pvar?,
    // and the property store must be built by the same put/shen.dict* that
    // later read it. See scripts/config.js.
    ...measureParse.result.filter(isArray).map(construct),
    Call(Id('overrides'), [Id('$')]),
    ...config.initForms.map(f => assemble(Statement, construct([symbolOf(f)]))));
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
