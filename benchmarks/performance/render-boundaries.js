// Render a separately owned instrumented kernel; never overwrites lib/kernel.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseKernel } from '../../scripts/parser.js';
import config from '../../scripts/config.js';
import backend from '../../lib/backend.js';
import { Arrow, Block, Call, Const, ExportDefault, Id, ImportDefault, Let, Program, Return, Statement, generate } from '../../lib/ast.js';
import { createInstrumenter } from './boundary-instrument.js';

if (process.argv.length !== 3) throw new Error('Usage: render-boundaries.js UNUSED_OUTPUT_DIRECTORY');
const directory = path.resolve(process.argv[2]);
const production = fileURLToPath(new URL('../../lib', import.meta.url));
if (directory === production || (fs.existsSync(directory) && fs.realpathSync(directory) === fs.realpathSync(production))
    || fs.existsSync(path.join(directory, 'kernel.js')) || fs.existsSync(path.join(directory, 'boundary-metadata.json'))) {
  throw new Error('Refusing to overwrite a production or existing kernel artifact');
}
fs.mkdirSync(directory, { recursive: true });
const probe = createInstrumenter();
const $ = backend();
const construct = expr => {
  const result = $.construct(expr);
  result.ast = probe.instrument(result.ast, 'kernel');
  return result;
};
const body = $.assemble(Block,
  ...parseKernel().filter($.isArray).map(construct),
  Call(Id('overrides'), [Id('$')]),
  ...config.initForms.map(f => $.assemble(Statement, construct([$.symbolOf(f)]))));
const program = Program([
  ImportDefault(Id('overrides'), './overrides.js'),
  ExportDefault(Arrow([Id('$')], Block(Let(Id('w$')),
    ...Object.entries(body.subs).map(([key, value]) => Const(Id(key), value)),
    ...body.ast.body, Return(Id('$'))), true))
]);
fs.writeFileSync(path.join(directory, 'kernel.js'), generate(program));
fs.writeFileSync(path.join(directory, 'boundary-metadata.json'), JSON.stringify(probe.metadata, null, 2) + '\n');
console.log(`BOUNDARY_KERNEL ${Object.keys(probe.metadata).length} functions`);
