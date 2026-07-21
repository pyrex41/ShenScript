// npm `prepare` hook: render lib/kernel.js when it's missing (fresh checkout,
// or installing this repo as a git dependency), and no-op when it's already
// there so routine `npm install <pkg>` runs stay fast. `npm run build-kernel`
// re-renders unconditionally, and the `prepack` hook does the same so a
// published tarball never ships a stale kernel.
import fs from 'node:fs';
import { execSync } from 'node:child_process';

if (fs.existsSync(new URL('../lib/kernel.js', import.meta.url))) {
  console.log('lib/kernel.js already rendered — skipping (run `npm run build-kernel` to re-render)');
} else {
  execSync('npm run build-kernel', { stdio: 'inherit' });
}
