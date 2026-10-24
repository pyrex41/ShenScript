// Bounded integration entrypoint; CI chooses the installed engine explicitly.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const out = path.resolve('_build', 'test-aot-' + Date.now()); fs.mkdirSync(out, { recursive: true });
for (const [script, name] of [['test.sealed.js', 'sealed'], ['test.optimizers.js', 'optimizers'], ['test.adaptive-kernel.js', 'kernel']]) {
  const result = spawnSync(process.execPath, ['test/yggdrasil/' + script, path.join(out, name)], {
    encoding: 'utf8', timeout: 1200000, maxBuffer: 8388608,
    env: { ...process.env, AOT_TEST_ENGINES: process.env.AOT_TEST_ENGINES || 'node' }
  });
  fs.writeFileSync(path.join(out, name + '.stdout'), result.stdout || ''); fs.writeFileSync(path.join(out, name + '.stderr'), result.stderr || '');
  if (result.error || result.status !== 0) throw result.error || new Error(name + ' failed; see ' + out);
  console.log(result.stdout.trimEnd());
}
console.log('AOT_INTEGRATION PASS', out);
