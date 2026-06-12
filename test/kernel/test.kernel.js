const dump = process.argv.includes('dump');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import config from '../../lib/config.node.js';
import backend from '../../lib/backend.js';
import kernel from '../../lib/kernel.js';
import scriptsConfig from '../../scripts/config.js';
import { formatDuration, formatGrid, measure } from '../../scripts/utils.js';

const { testsPath } = scriptsConfig;

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

const formatResult = (failures, ignored) =>
  failures > ignored ? `${failures - ignored} (${ignored} ignored)` :
  ignored > 0 ? `success (${ignored} failures ignored)` :
  'success';

(async () => {
  const stoutput = new OutStream();

  console.log(`- creating backend...`);
  const measureBackend = measure(() => backend({
    ...config,
    InStream,
    OutStream,
    openRead: path => new InStream(fs.readFileSync(path)),
    stoutput
  }));
  const $ = measureBackend.result;
  console.log(`  created in ${formatDuration(measureBackend.duration)}`);

  console.log(`- creating kernel...`);
  const measureCreate = await measure(() => kernel($));
  const { defun, evalKl, s } = measureCreate.result;
  console.log(`  created in ${formatDuration(measureCreate.duration)}`);

  // the 41.2 harness asks "failed; continue?" interactively on failure
  defun('y-or-n?', _ => s`true`);

  console.log('- running test suite...');
  const measureRun = await measure(async () => {
    await evalKl([s`cd`, testsPath]);
    await evalKl([s`load`, 'harness.shen']);
    await evalKl([s`load`, 'kerneltests.shen']);
  });
  // kerneltests.shen ends with (reset), zeroing the counters, so the final
  // globals are useless: the per-section "passed ... N" summary lines print the
  // cumulative counters, so the last occurrence holds the suite totals
  const outputLog = stoutput.fromCharCodes();
  const final = pattern => {
    const matches = [...outputLog.matchAll(pattern)];
    return matches.length === 0 ? -1 : Number(matches[matches.length - 1][1]);
  };
  const passed = final(/passed \.\.\. (\d+)/g);
  const failures = final(/failed \.\.\. (\d+)/g);
  const ignored = 0;
  const expected = 134;
  console.log(`  passed: ${passed} (expected ${expected}), failed: ${failures}`);
  console.log(`  ran in ${formatDuration(measureRun.duration)}, ${formatResult(failures, ignored)}`);

  if (failures > ignored || passed !== expected) {
    if (dump) {
      console.log();
      console.log(outputLog);
    } else {
      const outputPath = path.join(os.tmpdir(), `shen-kernel-tests-${Date.now()}.log`);
      fs.writeFileSync(outputPath, outputLog);
      console.log(`  output log written to ${outputPath}`);
    }
  }

  console.log();
  console.log(formatGrid(['Test Suite', `${passed}/${expected} passed, ${failures} failed`, formatDuration(measureRun.duration)]));

  if (failures > ignored || passed !== expected) {
    process.exit(1);
  }
})();
