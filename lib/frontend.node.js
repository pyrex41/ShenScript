import { createRequire } from 'node:module';
import frontend from './frontend.js';

const require = createRequire(import.meta.url);

export default async $ => {
  const {
    caller, define, defineTyped, defmacro, isArray,
    lookup, s, symbol, symbolOf, toList, valueOf
  } = $ = await frontend($);

  await defineTyped('node.exit', [s`number`, s`-->`, s`unit`], x => process.exit(x));
  await defmacro('node.exit-macro', expr => {
    if (isArray(expr) && expr.length === 1 && expr[0] === s`node.exit`) {
      return [...expr, 0];
    }
  });

  // The REPL's own read exits cleanly at EOF on the first byte of a line, as
  // Ctrl-D does in other Lisps. Only this read checks: a program reading
  // (stinput) still sees -1 from read-byte, or "empty stream" from read and
  // lineread. Mirrors Shen/JIT's shen-jit.repl-read.
  await define('shen.read-evaluate-print', async () => {
    const stream = await caller('stinput')();
    const first = await caller('shen.my-read-byte')(stream);
    if (first === -1) {
      await caller('nl')(1);
      process.exit(0);
    }
    const read = await caller('shen.read-loop')(stream, first, null, x => caller('shen.return?')(x));
    const lineread = await caller('shen.package-user-input')(valueOf('shen.*package*'), read);
    const history = await caller('shen.update-history')();
    return await caller('shen.evaluate-lineread')(lineread, history, valueOf('shen.*tc*'));
  });

  await define('node.require', x => require(x));
  await symbol('node.global', globalThis);

  if (!lookup('js.globalThis').valueExists) {
    await symbol('js.globalThis', globalThis);
  }

  /*************************
   * Declare Port Features *
   *************************/

  const features = [
    s`shen-script`,
    s`js`,
    s`node`,
    symbolOf(valueOf('*implementation*').toLowerCase().split(' ').join('-')),
    symbolOf(valueOf('*os*').toLowerCase())];
  await caller('shen.x.features.initialise')(toList(features));

  return $;
};
