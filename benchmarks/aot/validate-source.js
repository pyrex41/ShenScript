// Full-runtime source oracle, deliberately separate from artifact timings.
import { fileURLToPath } from 'node:url';
import { createShen } from '../../lib/shen.node.js';
import { stdStreamOptions } from '../../lib/streams.node.js';
import { application } from './cases.js';
const $ = await createShen(stdStreamOptions());
$.assign('*hush*', $.s`true`); await $.caller('tc')($.s`-`);
await $.caller('cd')(fileURLToPath(new URL('./sources/', import.meta.url)));
for (const name of ['parser', 'rules', 'lists', 'numerical']) {
  await $.caller('load')(name + '.shen');
  const { request, check } = application($, name);
  for (let i = 0; i < 4; i++) check(await request());
  console.log('SOURCE_ORACLE PASS', name);
}
