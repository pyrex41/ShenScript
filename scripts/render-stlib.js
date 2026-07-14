// Generates kernel/klambda/stlib.kl from the vendored Shen standard-library
// SOURCES under kernel/lib/stlib/ (canonical: mirror pyrex41/shen-upstream, tag
// s41.2-pristine-20260711, Lib/StLib). This replaces the opaque community
// precompiled stlib.kl: the standard library is now built from source by
// ShenScript's own frontend.
//
// Mechanism: render a stlib-less kernel in memory, boot it (so ShenScript's
// native overrides — notably the synchronous @p / shen.pvar? the type engine
// needs — are installed BEFORE any source is type-checked at load), then run
// Lib/StLib/install.shen through the kernel's own `load`, intercepting `eval-kl`
// to record the compiled KL `defun`s in order. After the install we read each
// exported function's arity and emit `update-lambda-table` calls so the rendered
// stdlib registers arities and lambda-table entries — which the pure-defun
// community stlib.kl never did, leaving `(arity filter)` = -1 and `(fn filter)`
// undefined. The captured defuns + registrations are written as stlib.kl and
// rendered into lib/kernel.js by scripts/render.js exactly as before.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import config from './config.js';
import { parseFiles } from './parser.js';
import backend from '../lib/backend.js';
import {
  Arrow, Block, Call, Const, ExportDefault, Id, ImportDefault, Let, Program, Return, generate
} from '../lib/ast.js';
import { formatDuration, formatGrid, measure } from './utils.js';

const { klPath } = config;
const stlibDir = 'kernel/lib/stlib';
const outFile = `${klPath}/stlib.kl`;
const overridesUrl = pathToFileURL(path.resolve('lib/overrides.js')).href;

// ---- 1. Render a stlib-less kernel in memory (same pipeline as render.js) ----

console.log('- rendering stlib-less kernel...');
const $r = backend();
const { assemble, construct, isArray } = $r;
const pre = parseFiles(config.klFiles);
const post = parseFiles(config.klFilesPostOverride.filter(f => f !== 'stlib'));
const measureRender = measure(() => {
  const body = assemble(
    Block,
    ...pre.filter(isArray).map(construct),
    Call(Id('overrides'), [Id('$')]),
    ...post.filter(isArray).map(construct));
  return generate(Program([
    ImportDefault(Id('overrides'), overridesUrl),
    ExportDefault(Arrow(
      [Id('$')],
      Block(
        Let(Id('w$')),
        ...Object.entries(body.subs).map(([key, value]) => Const(Id(key), value)),
        ...body.ast.body,
        Return(Id('$'))),
      true))]));
});
console.log(`  rendered in ${formatDuration(measureRender.duration)}`);

const tmpKernel = path.join(os.tmpdir(), `stlib-kernel-${process.pid}.mjs`);
fs.writeFileSync(tmpKernel, measureRender.result);

// ---- 2. Boot it and record the compiled KL while loading the sources ----

const InStream = class {
  constructor(buf) { this.buf = buf; this.pos = 0; }
  read() { return this.pos >= this.buf.length ? -1 : this.buf[this.pos++]; }
  close() {}
};
const OutStream = class {
  constructor() { this.buffer = []; }
  write(b) { this.buffer.push(b); return b; }
  fromCharCodes() { return String.fromCharCode(...this.buffer); }
};

const kernel = (await import(pathToFileURL(tmpKernel).href)).default;
const stoutput = new OutStream();
const $ = backend({
  ...(await import('../lib/config.node.js')).default,
  InStream, OutStream,
  openRead: p => new InStream(fs.readFileSync(p)),
  stoutput
});
const { evalKl, s, toArrayTree } = await kernel($);

// Record top-level compiled KL defuns, in order, as they are eval-kl'd during
// load. Nested/among them are type-checker and housekeeping eval-kl calls
// (lambda/cons/let/...); we keep only `defun`s and rebuild registration
// separately, so only the definitional forms end up in stlib.kl.
const cell = $.c('eval-kl');
const origEvalKl = cell.f;
const recordedDefuns = [];
const symName = x => (typeof x === 'symbol' ? Symbol.keyFor(x) : null);
cell.f = $.l(function (form) {
  if ($.isCons(form) && symName(form.head) === 'defun') {
    recordedDefuns.push(form);
  }
  return origEvalKl(form);
});

console.log('- loading Lib/StLib/install.shen through the frontend...');
const measureLoad = await measure(async () => {
  await evalKl([s`cd`, stlibDir]);
  await evalKl([s`load`, 'install.shen']);
});
cell.f = origEvalKl;
console.log(`  loaded in ${formatDuration(measureLoad.duration)}, ${recordedDefuns.length} defuns captured`);

// De-duplicate by function name, keeping the LAST definition (later loads win,
// matching load semantics).
const defunByName = new Map();
for (const form of recordedDefuns) {
  defunByName.set(symName(form.tail.head), form);
}

// ---- 3. Query arities of the exported stdlib functions ----

const toArray = list => { const out = []; for (let c = list; $.isCons(c); c = c.tail) out.push(c.head); return out; };
const externals = toArray(await evalKl([s`external`, s`stlib`]));
const registrations = [];
for (const sym of externals) {
  const name = symName(sym);
  if (name === null || !defunByName.has(name)) continue;
  const arity = await evalKl([s`arity`, sym]);
  if (typeof arity === 'number' && arity >= 0) {
    registrations.push([name, arity]);
  }
}
console.log(`  ${registrations.length} exported functions to register (arity + lambda table)`);

// ---- 4. Serialize to KL text ----

const needsQuote = str => { if (str.includes('"')) throw new Error(`string literal contains a double quote (unrepresentable in KL reader): ${JSON.stringify(str)}`); return `"${str}"`; };
const serialize = node => {
  if (typeof node === 'symbol') return Symbol.keyFor(node);
  if (typeof node === 'string') return needsQuote(node);
  if (typeof node === 'number') return String(node);
  if (node === null || node === undefined) return '()';
  if (Array.isArray(node)) return `(${node.map(serialize).join(' ')})`;
  throw new Error(`cannot serialize KL node of type ${typeof node}: ${String(node)}`);
};

const defunText = [...defunByName.values()].map(f => serialize(toArrayTree(f))).join('\n\n');
// update-lambda-table registers arity + lambda-table entry (fixes (arity f)/(fn f)).
const lambdaText = registrations.map(([name, arity]) => `(update-lambda-table ${name} ${arity})`).join('\n');
// systemf mirrors install.shen's tail `(map (fn systemf) ExternalF)`: it adjoins
// each exported function into the shen package's shen.external-symbols, so
// (external shen) and package-qualified resolution match a from-source install.
const systemfText = registrations.map(([name]) => `(systemf ${name})`).join('\n');

// No comment header: the KL reader (scripts/parser.js) has no comment syntax, so
// any prose here would parse as spurious forms. This file is generated and
// gitignored; provenance lives in kernel/klambda/PROVENANCE.md and the banner
// printed by this script.
fs.writeFileSync(outFile, `${defunText}\n\n${lambdaText}\n\n${systemfText}\n`);
fs.rmSync(tmpKernel, { force: true });

console.log();
console.log(formatGrid(
  ['stlib.kl', `${defunByName.size} defuns`, `${registrations.length} registered`, formatDuration(measureLoad.duration)]
));
