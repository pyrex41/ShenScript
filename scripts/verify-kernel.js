import crypto from 'node:crypto';
import fs from 'node:fs';
import config from './config.js';

const { klPath } = config;

const sums = fs.readFileSync(`${klPath}/SHA256SUMS`, 'utf-8')
  .split('\n')
  .filter(line => line.trim().length > 0)
  .map(line => line.split(/\s+/));

let failed = 0;

for (const [expected, file] of sums) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(`${klPath}/${file}`)).digest('hex');
  if (actual !== expected) {
    console.error(`MISMATCH: ${file}\n  expected ${expected}\n  actual   ${actual}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`${failed} of ${sums.length} files failed verification.`);
  process.exit(1);
}

console.log(`${sums.length} kernel files verified against ${klPath}/SHA256SUMS.`);
