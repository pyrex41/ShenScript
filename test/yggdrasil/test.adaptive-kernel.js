// Render the entire authenticated kernel through the optional compiler pass,
// then reuse the actual suite runners in fresh bounded Node and Bun processes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import backend from '../../lib/backend.js';
import lowerAdaptive, { pruneAdaptiveCalls } from '../../lib/aot-adaptive.js';
import { parseKernel } from '../../scripts/parser.js';
import config from '../../scripts/config.js';
import { Arrow, Block, Call, Const, ExportDefault, Id, Let, Program, Return, generate } from '../../lib/ast.js';
const root = fileURLToPath(new URL('../../', import.meta.url));
if (process.argv.length !== 3) throw new Error('Usage: test.adaptive-kernel.js NEW_EVIDENCE_DIRECTORY');
const out = path.resolve(process.argv[2]); fs.mkdirSync(out);
const stats = {}, $ = backend({ aotAdaptive: lowerAdaptive, aotStats: stats });
const body = $.assemble(Block, ...parseKernel().filter(Array.isArray).map($.construct), Call(Id('overrides'), [Id('$')]), ...config.initForms.map(name => $.construct([Symbol.for(name)])));
pruneAdaptiveCalls(body.ast, stats);
const kernel = path.join(out, 'compiled-kernel.mjs');
fs.writeFileSync(kernel, `import overrides from ${JSON.stringify(pathToFileURL(path.join(root, 'lib/overrides.js')).href)};\n` + generate(Program([
  ExportDefault(Arrow([Id('$')], Block(Let(Id('w$')), ...Object.entries(body.subs).map(([name, value]) => Const(Id(name), value)), ...body.ast.body, Return(Id('$'))), true))
])));
fs.writeFileSync(path.join(out, 'analysis.json'), JSON.stringify(stats, null, 2) + '\n');
for (const suite of ['kernel', 'extensions', 'benchmarks']) {
  const source = path.join(root, 'test/kernel/test.' + suite + '.js');
  let code = fs.readFileSync(source, 'utf8').replace(/from '(\.\.[^']+)'/g, (_, target) => `from '${pathToFileURL(path.resolve(path.dirname(source), target)).href}'`);
  code = code.replace(/import kernel from '[^']+';/, `import kernel from '${pathToFileURL(kernel).href}';`)
    .replace(/import backend from '([^']+)';/, (_, target) => `import nativeBackend from '${target}';
import lowerAdaptive from '${pathToFileURL(path.join(root, 'lib/aot-adaptive.js')).href}';
import installAdaptive from '${pathToFileURL(path.join(root, 'lib/aot-adaptive-runtime.js')).href}';
const backend = options => installAdaptive(nativeBackend({ ...options, aotAdaptive: lowerAdaptive }));`);
  const runner = path.join(out, suite + '.mjs'); fs.writeFileSync(runner, code);
  const engines = (process.env.AOT_TEST_ENGINES || 'node,bun').split(',');
  for (const engine of engines) {
    const result = spawnSync(engine, [runner], { cwd: root, encoding: 'utf8', timeout: 180000, maxBuffer: 8388608 });
    fs.writeFileSync(path.join(out, suite + '-' + engine + '.stdout'), result.stdout || ''); fs.writeFileSync(path.join(out, suite + '-' + engine + '.stderr'), result.stderr || '');
    assert.equal(result.status, 0, result.stderr); assert.equal(result.error, undefined);
    console.log('ADAPTIVE_SUITE', engine, suite, 'PASS');
  }
}
console.log('ADAPTIVE_KERNEL PASS');
