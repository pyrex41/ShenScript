import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixtures = [
  { name: 'fib',      expected: 'fib 20 = 6765\n' },
  { name: 'prolog',   expected: 'mary likes chocolate: true\n' },
  // metaeval shakes to needs-eval=true: self-contained mode must refuse
  // it, --linked mode must run it (eval-kl via the imported compiler).
  { name: 'metaeval', expected: 'eval list: 42\neval define: 42\neval string: 42\n', linked: true }
];

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ratatoskr-'));
let failed = false;

for (const { name, expected, linked } of fixtures) {
  const fixture = path.join(root, 'test/ratatoskr/fixtures', name);
  const outFile = path.join(outDir, `${name}.js`);

  if (linked) {
    console.log(`- building ${name} (self-contained, expecting refusal)...`);
    let refused = false;
    try {
      execFileSync(process.execPath, [path.join(root, 'bin/ratatoskr-build.js'), fixture, outFile], { stdio: 'pipe' });
    } catch {
      refused = true;
    }
    if (refused) {
      console.log('  ok - self-contained build refused needs-eval=true');
    } else {
      console.error('  FAIL - self-contained build accepted needs-eval=true');
      failed = true;
    }
  }

  const mode = linked ? 'linked' : 'self-contained';
  console.log(`- building ${name} (${mode})...`);
  const buildArgs = [path.join(root, 'bin/ratatoskr-build.js'), fixture, outFile];
  if (linked) buildArgs.push('--linked');
  execFileSync(process.execPath, buildArgs, { stdio: 'inherit' });

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
