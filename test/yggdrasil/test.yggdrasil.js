import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = path.join(root, 'test/yggdrasil/fixtures/fib');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yggdrasil-'));
const outFile = path.join(outDir, 'fib.js');

console.log('- building self-contained artifact...');
execFileSync(process.execPath, [path.join(root, 'bin/yggdrasil-build.js'), fixture, outFile], { stdio: 'inherit' });

console.log('- running artifact...');
const start = Date.now();
const output = execFileSync(process.execPath, [outFile], { encoding: 'utf-8' });
const duration = Date.now() - start;

if (output !== 'fib 20 = 6765\n') {
  console.error(`unexpected output: ${JSON.stringify(output)}`);
  process.exit(1);
}

console.log(`ok - fib 20 = 6765 in ${duration}ms (incl. process spawn)`);
fs.rmSync(outDir, { recursive: true, force: true });
