import { createShen } from '../lib/shen.node.js';

const $ = await createShen();
const result = await $.exec('(+ 1 1)');

if (result !== 2) {
  console.error(`expected 2, got ${result}`);
  process.exit(1);
}

const version = $.valueOf('*version*');
const implementation = $.valueOf('*implementation*');
const release = $.valueOf('*release*');

if (version !== '41.2') {
  console.error(`expected *version* 41.2, got ${version}`);
  process.exit(1);
}

console.log(`ok - Shen ${version} on ${implementation} ${release}`);
