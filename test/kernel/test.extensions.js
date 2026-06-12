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
  const { evalKl, s, valueOf } = await kernel($);

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
