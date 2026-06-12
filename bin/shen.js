#!/usr/bin/env node
import { createShen } from '../lib/shen.node.js';
import { stdStreamOptions } from '../lib/streams.node.js';

(async () => {
  try {
    const { caller, toList } = await createShen(stdStreamOptions());
    await caller('shen.x.launcher.main')(toList(['shen', ...process.argv.slice(2)]));
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
