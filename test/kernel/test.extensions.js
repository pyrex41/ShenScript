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

  // ShenOSKernel 42.2 resolves `fn` through the shen.lambda-form property in
  // *property-vector* (a shen.dict, natively a Map here; see lib/overrides.js).
  // shen.set-lambda-form-entry must populate that property, and (42.0)
  // update-lambda-table must invalidate the cached callable form when a
  // function is redefined with zero arity.
  defun('extension-regression', x => x);
  await evalKl([s`shen.set-lambda-form-entry`,
    [s`cons`, s`extension-regression`, [s`lambda`, s`X`, s`X`]]]);
  const extensionFn = await evalKl([s`fn`, s`extension-regression`]);
  const extensionResult = await extensionFn(s`ok`);
  if (extensionResult !== s`ok`) {
    throw new Error('set-lambda-form-entry did not register fn in the shen.lambda-form property');
  }
  // Re-registering it as zero-place must drop the stale callable form, so fn
  // calls the new definition instead of returning the old lambda.
  await evalKl([s`update-lambda-table`, s`extension-regression`, 0]);
  let staleForm = true;
  try {
    await evalKl([s`get`, s`extension-regression`, s`shen.lambda-form`, [s`value`, s`*property-vector*`]]);
  } catch (e) {
    staleForm = false;
  }
  if (staleForm || await evalKl([s`arity`, s`extension-regression`]) !== 0) {
    throw new Error('update-lambda-table did not invalidate the lambda form on a zero-arity redefinition (42.0)');
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
