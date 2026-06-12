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
