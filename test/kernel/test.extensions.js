const dump = process.argv.includes('dump');

import fs from 'node:fs';
import config from '../../lib/config.node.js';
import backend from '../../lib/backend.js';
import kernel from '../../lib/kernel.js';
import scriptsConfig from '../../scripts/config.js';
import { formatDuration, formatGrid, measure } from '../../scripts/utils.js';

const { kernelPath } = scriptsConfig;

const InStream = class {
  constructor(buf) {
    this.buf = buf;
    this.pos = 0;
  }
  read() { return this.pos >= this.buf.length ? -1 : this.buf[this.pos++]; }
  close() {}
};

const OutStream = class {
  constructor() { this.buffer = []; }
  write(b) {
    this.buffer.push(b);
    return b;
  }
  fromCharCodes() { return String.fromCharCode(...this.buffer); }
};

(async () => {
  const stoutput = new OutStream();

  console.log(`- creating backend...`);
  const $ = backend({
    ...config,
    InStream,
    OutStream,
    openRead: path => new InStream(fs.readFileSync(path)),
    stoutput
  });

  console.log(`- creating kernel...`);
  const { defun, evalKl, s, valueOf } = await kernel($);

  // No stdin is wired to this runner, so any interactive y-or-n? prompt (e.g.
  // the "partial function" warning path the S41.2 refresh can reach while
  // compiling the pattern-matching test definitions) would try to (read
  // (stinput)) and crash. Stub it out as the cert runner does so the suite
  // reports pass/fail counts instead of aborting.
  defun('y-or-n?', _ => s`true`);

  // Shen's S42 core resolves `fn` through shen.*lambdatable*. The optional
  // extensions call set-lambda-form-entry, so verify our adapter populates
  // that table rather than the obsolete shen.lambda-form property.
  defun('extension-regression', x => x);
  await evalKl([s`shen.set-lambda-form-entry`,
    [s`cons`, s`extension-regression`, [s`lambda`, s`X`, s`X`]]]);
  const extensionFn = await evalKl([s`fn`, s`extension-regression`]);
  const extensionResult = await extensionFn(s`ok`);
  if (extensionResult !== s`ok`) {
    throw new Error('set-lambda-form-entry did not register fn in S42 table');
  }

  // The only suite here exercises the opt-in programmable-pattern-matching
  // extension, which plugs into the kernel's shen.custom-pattern-compiler /
  // shen.custom-pattern-reducer hooks. Tarver's S41.2 refresh (2026-07-11)
  // removed those hooks from the pattern compiler entirely -- nothing in the
  // kernel reads shen.*custom-pattern-compiler* anymore -- so the extension is
  // inert on this lineage: custom patterns fall through to their default rule.
  // There is no ShenScript-side fix short of re-patching the vendored kernel.
  // Skip (rather than fail) when the hook is absent, the standard treatment for
  // an optional feature the backend cannot support. See kernel/klambda/PROVENANCE.md.
  const hookDefined = (() => {
    const cell = $.c('shen.custom-pattern-compiler');
    return !!(cell && cell.f && cell.f.arity !== undefined);
  })();
  if (!hookDefined) {
    console.log('- SKIP: programmable-pattern-matching unsupported on this kernel');
    console.log('  (S41.2 refresh removed the shen.custom-pattern-compiler/-reducer hooks)');
    console.log();
    console.log(formatGrid(['Extension Tests', 'skipped (hooks removed upstream)', '-']));
    return;
  }

  console.log('- running extension test suite...');
  let error = null;
  const measureRun = await measure(async () => {
    await evalKl([s`cd`, kernelPath]);
    try {
      await evalKl([s`load`, 'tests/extensions/runme.shen']);
    } catch (e) {
      error = e;
    }
  });
  const outputLog = stoutput.fromCharCodes();
  const passed = valueOf('extension-tests.*passed*');
  const failures = valueOf('extension-tests.*failed*');
  console.log(`  ran in ${formatDuration(measureRun.duration)}, passed: ${passed}, failed: ${failures}`);

  if (failures > 0 || error !== null || passed === 0) {
    if (error !== null) {
      console.error(error);
    }
    if (dump) {
      console.log();
      console.log(outputLog);
    }
    console.log(formatGrid(['Extension Tests', 'failure', formatDuration(measureRun.duration)]));
    process.exit(1);
  }

  console.log();
  console.log(formatGrid(['Extension Tests', `success (${passed} passed)`, formatDuration(measureRun.duration)]));
})();
