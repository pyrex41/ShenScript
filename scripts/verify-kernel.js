import crypto from 'node:crypto';
import fs from 'node:fs';
import config from './config.js';

const { kernelPath } = config;

const sums = fs.readFileSync(`${kernelPath}/SHA256SUMS`, 'utf-8')
  .split('\n')
  .filter(line => line.trim().length > 0)
  .map(line => {
    const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
    if (!match) throw new Error(`Invalid checksum line: ${line}`);
    return match.slice(1);
  });

let failed = 0;

for (const [expected, file] of sums) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(`${kernelPath}/${file}`)).digest('hex');
  if (actual !== expected) {
    console.error(`MISMATCH: ${file}\n  expected ${expected}\n  actual   ${actual}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`${failed} of ${sums.length} files failed verification.`);
  process.exit(1);
}

console.log(`${sums.length} kernel files verified against ${kernelPath}/SHA256SUMS.`);
