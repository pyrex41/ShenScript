// Explicit application build choices; no runtime workload detection/dispatch.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const [direct, combined, output] = process.argv.slice(2);
if (!output) throw new Error('Usage: select-profiles.js DIRECT_LOOP_GENERATED COMBINED_GENERATED NEW_OUTPUT');
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(sha(path.join(direct, 'inputs.json')), sha(path.join(combined, 'inputs.json')));
const checkTree = relative => {
  for (const entry of fs.readdirSync(path.join(direct, relative), { withFileTypes: true })) {
    const file = path.join(relative, entry.name);
    if (entry.isDirectory()) checkTree(file); else assert.equal(sha(path.join(direct, file)), sha(path.join(combined, file)));
  }
};
checkTree('stage1');
fs.mkdirSync(output); fs.cpSync(path.join(direct, 'stage1'), path.join(output, 'stage1'), { recursive: true });
fs.copyFileSync(path.join(direct, 'inputs.json'), path.join(output, 'inputs.json'));
const rows = [];
for (const name of ['parser', 'rules', 'lists', 'numerical']) {
  const origin = name === 'parser' || name === 'numerical' ? combined : direct;
  const row = JSON.parse(fs.readFileSync(path.join(origin, 'generation.json'), 'utf8')).find(x => x.name === name);
  assert.equal(sha(path.join(origin, name + '.mjs')), row.artifact);
  for (const suffix of ['.mjs', '.mjs.analysis.json', '-build.stdout', '-build.stderr', '-validate.stdout', '-validate.stderr']) {
    fs.copyFileSync(path.join(origin, name + suffix), path.join(output, name + suffix));
  }
  const flags = name === 'parser' ? ['--linked', '--module', '--adaptive'] : name === 'numerical' ? ['--module', '--sealed', '--adaptive', '--tail-loops'] : ['--module', '--sealed', '--tail-loops'];
  rows.push({ ...row, flags });
}
fs.writeFileSync(path.join(output, 'generation.json'), JSON.stringify(rows, null, 2) + '\n');
console.log('EXPLICIT_PROFILES PASS');
