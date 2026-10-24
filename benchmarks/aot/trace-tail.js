// Allocation mechanism diagnostic only; do not use these instrumented timings.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { application } from './cases.js';
const [base, candidate, output] = process.argv.slice(2);
if (!output) throw new Error('Usage: trace-tail.js BASELINE CANDIDATE NEW_OUTPUT');
fs.mkdirSync(output);
const rows = [], outputs = new Map();
for (const [variant, directory] of [['baseline', base], ['candidate', candidate]]) {
  const hashes = JSON.parse(fs.readFileSync(path.join(directory, 'snapshot.json'), 'utf8'));
  for (const [file, hash] of Object.entries(hashes)) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex'), hash);
  for (const name of ['rules', 'lists', 'numerical']) {
    const { default: $ } = await import(pathToFileURL(path.resolve(directory, name + '.mjs')));
    let bounces = 0; const bounce = $.b;
    $.b = (f, ...args) => { bounces++; return bounce(f, ...args); };
    const { request, check } = application($, name);
    for (let i = 0; i < 10; i++) {
      const value = JSON.stringify(check(await request()));
      if (outputs.has(name)) assert.equal(value, outputs.get(name)); else outputs.set(name, value);
    }
    rows.push({ variant, name, requests: 10, bounces });
  }
}
fs.writeFileSync(path.join(output, 'counts.json'), JSON.stringify(rows, null, 2) + '\n');
console.log('TAIL_TRAFFIC PASS', JSON.stringify(rows));
