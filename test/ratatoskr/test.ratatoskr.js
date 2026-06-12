import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixtures = [
  { name: 'fib',    expected: 'fib 20 = 6765\n' },
  { name: 'prolog', expected: 'mary likes chocolate: true\n' }
];

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ratatoskr-'));
let failed = false;

for (const { name, expected } of fixtures) {
  const fixture = path.join(root, 'test/ratatoskr/fixtures', name);
  const outFile = path.join(outDir, `${name}.js`);

  console.log(`- building ${name} (self-contained)...`);
  execFileSync(process.execPath, [path.join(root, 'bin/ratatoskr-build.js'), fixture, outFile], { stdio: 'inherit' });

  const start = Date.now();
  const output = execFileSync(process.execPath, [outFile], { encoding: 'utf-8' });
  const duration = Date.now() - start;

  if (output === expected) {
    console.log(`  ok - ${JSON.stringify(expected.trim())} in ${duration}ms (incl. process spawn)`);
  } else {
    console.error(`  FAIL - expected ${JSON.stringify(expected)}, got ${JSON.stringify(output)}`);
    failed = true;
  }
}

fs.rmSync(outDir, { recursive: true, force: true });

if (failed) {
  process.exit(1);
}
