import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

// --- --web target: a browser-safe module that boots and exports the env ---
// The output must carry no node built-ins, and importing it must both run the
// program's top-level forms (fib prints via console) and expose callable Shen
// functions with JS<->Shen marshalling through the exported `$`.
{
  const name = 'fib';
  const fixture = path.join(root, 'test/ratatoskr/fixtures', name);
  // .mjs so it's imported as ESM irrespective of the temp dir's package scope.
  const outFile = path.join(outDir, `${name}.web.mjs`);
  console.log(`- building ${name} (--web)...`);
  execFileSync(process.execPath, [path.join(root, 'bin/ratatoskr-build.js'), fixture, outFile, '--web'], { stdio: 'inherit' });

  const src = fs.readFileSync(outFile, 'utf-8');
  const leaks = ['node:fs', 'streams.node', 'process.', 'import fs'].filter(t => src.includes(t));
  if (leaks.length === 0) {
    console.log('  ok - browser-safe (no node built-ins)');
  } else {
    console.error(`  FAIL - web output leaked node-isms: ${leaks.join(', ')}`);
    failed = true;
  }

  // Import boots the runtime and runs the top-level forms (prints "fib 20 …");
  // assert the exported env exposes a working caller with number marshalling.
  const $ = (await import(pathToFileURL(outFile).href)).default;
  const got = $.caller('fib')(10);
  if (got === 55) {
    console.log('  ok - caller("fib")(10) === 55 via exported $');
  } else {
    console.error(`  FAIL - caller fib(10): expected 55, got ${JSON.stringify(got)}`);
    failed = true;
  }
}

// --web must refuse --linked (it is always self-contained).
{
  let refused = false;
  try {
    execFileSync(process.execPath,
      [path.join(root, 'bin/ratatoskr-build.js'), path.join(root, 'test/ratatoskr/fixtures/fib'), path.join(outDir, 'x.js'), '--web', '--linked'],
      { stdio: 'pipe' });
  } catch { refused = true; }
  console.log(refused ? '  ok - --web --linked refused' : '  FAIL - --web --linked was accepted');
  if (!refused) failed = true;
}

fs.rmSync(outDir, { recursive: true, force: true });

if (failed) {
  process.exit(1);
}
