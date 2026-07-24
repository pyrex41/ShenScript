#!/usr/bin/env node
// Ratatoskr stage-2 builder for ShenScript.
//
//   node bin/ratatoskr-build.js <shaken-dir> <out.js> [--linked | --web]
//
// <shaken-dir> is a Ratatoskr stage-1 output directory: a tree-shaken
// kernel (kernel.kl, ShenOSKernel-41.2 defuns in load order), the user
// program as KL (one or more user= files), and ratatoskr.manifest.txt.
// Every KL form is compiled ahead of time with ShenScript's own compiler
// (lib/backend.js) and emitted as ONE runnable ES module <out.js>:
//
//   * default: fully self-contained - embeds the sources of
//     lib/runtime.js, lib/streams.node.js and lib/overrides.js, so the
//     output runs on any Node >= 20 (or Bun / Deno 2) with no access to
//     a ShenScript checkout and no npm dependencies;
//   * --linked: small output that imports those modules from this
//     checkout - useful during development, and the only mode that
//     supports needs-eval=true (it can import the compiler).
//   * --web: fully self-contained, but BROWSER-safe - no `node:fs`, no
//     streams.node.js, no process/Deno platform probe. Instead of a `main`
//     that runs the program and calls process.exit, it boots the runtime,
//     runs the shaken forms (so top-level user forms still execute), attaches
//     the `caller` convenience (lib/frontend.js's 3-liner; the runtime already
//     exposes toListTree/toArrayTree/lookup/settle) and `export default $`, so
//     a page can `import $ from './out.js'` and call functions:
//         const parse = $.caller('parse-capture');
//         $.toArrayTree(parse('Buy milk'));   // JS <-> Shen marshalling included
//     stdout/stderr map to console.log/error; there is no stdin. Requires
//     needs-eval=false (a precompiled slice needs neither the compiler nor
//     host I/O).
//
// Builder contract (ratatoskr.shen): load kernel.kl's defuns, call the
// manifest's init function ((shen.initialise) does all global
// initialisation in 41.2), then run each user file's forms in source
// order. Overrides are installed between the kernel forms and the init
// call, mirroring scripts/render.js - the compiler's sync-call detection
// assumes override names behave like primitives, so the overridden
// natives must be in place before any kernel code runs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import backend from '../lib/backend.js';
import overrides from '../lib/overrides.js';
import { parseFile } from '../scripts/parser.js';
import {
  Arrow, Block, Call, Const, Id, Let, Program, Return, Statement, generate
} from '../lib/ast.js';

const USAGE = 'usage: node bin/ratatoskr-build.js <shaken-dir> <out.js> [--linked | --web]';

const FLAGS = new Set(['--linked', '--web']);
const args = process.argv.slice(2).filter(a => !FLAGS.has(a));
const linked = process.argv.includes('--linked');
const web = process.argv.includes('--web');

if (process.argv.includes('-h') || process.argv.includes('--help') || args.length !== 2) {
  console.error(USAGE);
  process.exit(args.length === 2 ? 0 : 1);
}
if (linked && web) {
  console.error('--linked and --web are mutually exclusive: --web is always self-contained.');
  process.exit(1);
}

const [shakenDir, outPath] = args;
const libDir = fileURLToPath(new URL('../lib/', import.meta.url));

/***************
 *  Manifest   *
 ***************/

// the tree-shaker was renamed Yggdrasil -> Ratatoskr; accept either manifest name
const manifestPath = ['ratatoskr.manifest.txt', 'yggdrasil.manifest.txt']
  .map(name => path.join(shakenDir, name))
  .find(fs.existsSync);

if (!manifestPath) {
  console.error(`no ratatoskr.manifest.txt or yggdrasil.manifest.txt in ${shakenDir}`);
  process.exit(1);
}

const manifest = { user: [], fn: [], primitive: [], 'primitive-optional': [], global: [] };

for (const line of fs.readFileSync(manifestPath, 'utf-8').split('\n')) {
  const trimmed = line.trim();
  if (trimmed.length === 0) continue;
  const eq = trimmed.indexOf('=');
  if (eq < 0) continue;
  const key = trimmed.slice(0, eq);
  const value = trimmed.slice(eq + 1);
  if (Array.isArray(manifest[key])) {
    manifest[key].push(value);
  } else {
    manifest[key] = value; // unknown keys are kept but unused, per the contract
  }
}

for (const required of ['kernel', 'init']) {
  if (!manifest[required]) {
    console.error(`manifest is missing required key: ${required}`);
    process.exit(1);
  }
}
if (manifest.user.length === 0) {
  console.error('manifest lists no user= files');
  process.exit(1);
}
// Accept both plain "41.2" and the refresh's more specific stage-1 tag
// (e.g. "41.2-s41r.20260711"), which share the vendored 41.2 kernel lineage.
if (manifest['kernel-version'] !== '41.2' && !manifest['kernel-version'].startsWith('41.2-')) {
  console.warn(`warning: manifest kernel-version is ${manifest['kernel-version']}, this builder targets 41.2`);
}
if (manifest['manifest-version'] !== '2') {
  console.warn(`warning: manifest-version is ${manifest['manifest-version']}, this builder understands version 2`);
}

const needsEval = manifest['needs-eval'] === 'true';
if (needsEval && !linked) {
  console.error('needs-eval=true requires the compiler in the output artifact, which only');
  console.error('--linked mode provides. Re-run with --linked.');
  process.exit(1);
}

/**********************
 *  Contract check    *
 **********************/

const specialForms = new Set([
  'if', 'cond', 'let', 'do', 'and', 'or', 'lambda', 'freeze', 'defun', 'trap-error', 'type'
]);
const bootGlobals = new Set([
  '*stinput*', '*stoutput*', '*sterror*', '*home-directory*',
  '*language*', '*implementation*', '*port*', '*porters*', '*os*', '*release*'
]);
const probe = overrides(backend());
const defined = new Set(
  [...probe.globals.entries()].filter(([_, cell]) => cell.f && cell.f.arity !== undefined).map(([name]) => name));

for (const name of manifest.primitive) {
  if (!defined.has(name) && !specialForms.has(name) && !bootGlobals.has(name)) {
    console.warn(`warning: required primitive not provided by this port: ${name}`);
  }
}

/***************
 *  Compile    *
 ***************/

const $ = backend();
const { assemble, construct, isArray, s } = $;

const parseKl = file => parseFile(fs.readFileSync(path.join(shakenDir, file), 'utf-8'));

const kernelForms = parseKl(manifest.kernel);
const userForms = manifest.user.map(file => ({ file, forms: parseKl(file) }));

// Call the manifest's init function (e.g. shen.initialise) only if the shaken
// kernel actually defines it. The S41.2 refresh dropped shen.initialise and
// initialises via top-level forms in the kernel itself, so a shake against that
// lineage carries its initialisation inline and has no init function to call;
// emitting an unconditional (shen.initialise) would fault at boot.
const isSym = (x, name) => typeof x === 'symbol' && Symbol.keyFor(x) === name;
const initDefined = manifest.init && kernelForms.some(f =>
  isArray(f) && f.length >= 2 && isSym(f[0], 'defun') && isSym(f[1], manifest.init));

const body = assemble(
  Block,
  ...kernelForms.filter(isArray).map(construct),
  Call(Id('overrides'), [Id('$')]),
  ...(initDefined ? [assemble(Statement, construct([s`${manifest.init}`]))] : []),
  ...userForms.flatMap(({ forms }) => forms.filter(isArray).map(construct)));

const program = generate(Program([
  Const(Id('run'), Arrow(
    [Id('$')],
    Block(
      Let(Id('w$')), // maybe-await slot for top-level forms (see lib/backend.js)
      ...Object.entries(body.subs).map(([key, value]) => Const(Id(key), value)),
      ...body.ast.body,
      Return(Id('$'))),
    true))]));

/***************
 *  Emit       *
 ***************/

const embed = (file, transform) => transform(fs.readFileSync(path.join(libDir, file), 'utf-8'));
const stripExports = src => src
  .replace(/^import .*$/gm, '')
  .replace(/^export default/m, 'const MODULE =')
  .replace(/^export class/gm, 'class')
  .replace(/^export const/gm, 'const');

const usageLine = web
  ? `// use in a browser: import $ from './${path.basename(outPath)}'; $.caller('name')(...args)`
  : `// run with: node ${path.basename(outPath)}  (also runs on bun and deno)`;
const header = `// Generated by ShenScript's Ratatoskr stage-2 builder.
// source: ${path.resolve(shakenDir)}
// kernel-version: ${manifest['kernel-version']}, needs-eval: ${needsEval}
// kernel defuns: ${kernelForms.length} forms; user: ${manifest.user.join(', ')}
${usageLine}
`;

const platformBoot = `
const isDeno = typeof Deno !== 'undefined' && Deno.version && Deno.version.deno;
const isBun = typeof process !== 'undefined' && process.versions && process.versions.bun;
const platform = {
  implementation: isDeno ? 'Deno' : isBun ? 'Bun' : 'Node.js',
  release: isDeno ? Deno.version.deno : isBun ? process.versions.bun : process.version.slice(1),
  os: /win32|win64/i.test(process.platform) ? 'Windows' : /darwin|mac/i.test(process.platform) ? 'macOS' : 'Linux',
  port: '${process.env.npm_package_version || '1.0.0'}',
  porters: 'Robert Koeninger'
};
`;

const main = `
const $ = runtime({ ...platform, ...stdStreamOptions() });
run($).catch(e => {
  console.error(e && e.message ? e.message : e);
  process.exit(1);
});
`;

// --web platform: a static record (a browser has no process/Deno to probe).
const webPlatform = `
const platform = { implementation: 'Browser', release: '', os: 'web', port: '${manifest['kernel-version'] || '1.0.0'}', porters: 'Robert Koeninger' };
`;

// --web boot: browser-safe stdin/stdout (console-backed; no stdin), boot the
// runtime, run the shaken forms (top-level user forms execute here), attach the
// `caller` convenience (lib/frontend.js), then export the env. Uses top-level
// await, so the module is fully initialised before importers observe it.
const webBoot = `
class WebOutStream {
  constructor(sink) { this.sink = sink; this.buf = ''; }
  flush() { const i = this.buf.lastIndexOf('\\n'); if (i >= 0) { this.buf.slice(0, i).split('\\n').forEach(l => this.sink(l)); this.buf = this.buf.slice(i + 1); } }
  write(b) { this.buf += String.fromCharCode(b); if (b === 10) this.flush(); return b; }
  writeString(s) { this.buf += s; this.flush(); return s; }
  close() { if (this.buf) { this.sink(this.buf); this.buf = ''; } return null; }
}
class WebInStream { read() { return -1; } close() { return null; } } // no stdin in a browser
const $ = runtime({
  ...platform,
  isInStream:  x => x instanceof WebInStream,
  isOutStream: x => x instanceof WebOutStream,
  stinput:  new WebInStream(),
  stoutput: new WebOutStream(s => console.log(s)),
  sterror:  new WebOutStream(s => console.error(s)),
});
await run($);
// The one convenience app code needs beyond the minimal runtime, which already
// exposes toListTree/toArrayTree/lookup/settle (lib/runtime.js). Mirrors caller
// in lib/frontend.js.
$.caller = name => { const cell = $.lookup(name); return (...args) => $.settle(cell.f(...args)); };
export default $;
`;

let artifact;

if (web) {
  artifact = [
    header,
    embed('runtime.js', src => src.replace(/^export default/m, 'const runtime =')),
    embed('overrides.js', src => src.replace(/^export default/m, 'const overrides =')),
    webPlatform,
    program,
    webBoot
  ].join('\n');
} else if (linked) {
  const runtimeModule = needsEval ? 'backend.js' : 'runtime.js';
  artifact = [
    header,
    `import runtime from '${new URL(runtimeModule, new URL('../lib/', import.meta.url)).href}';`,
    `import overrides from '${new URL('overrides.js', new URL('../lib/', import.meta.url)).href}';`,
    `import { stdStreamOptions } from '${new URL('streams.node.js', new URL('../lib/', import.meta.url)).href}';`,
    platformBoot,
    program,
    main
  ].join('\n');
} else {
  artifact = [
    header,
    `import fs from 'node:fs';`,
    embed('runtime.js', src => src.replace(/^export default/m, 'const runtime =')),
    embed('streams.node.js', stripExports),
    embed('overrides.js', src => src.replace(/^export default/m, 'const overrides =')),
    platformBoot,
    program,
    main
  ].join('\n');
}

fs.writeFileSync(outPath, artifact);
console.log(`${outPath}: ${artifact.length} chars, ${kernelForms.length} kernel forms, ` +
  `${userForms.reduce((n, { forms }) => n + forms.length, 0)} user forms` +
  `${linked ? ' (linked)' : web ? ' (web)' : ''}`);
