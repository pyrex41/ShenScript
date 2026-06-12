import ShenBase, { createShen as createShenBase } from './lib/shen.web.js';
import { StringInStream, fetchRead } from './lib/utils.js';

const webOptions = options => ({ openRead: fetchRead, InStream: StringInStream, ...options });

export const createShen = (options = {}) => createShenBase(webOptions(options));

export class Shen extends ShenBase {
  constructor(options = {}) {
    super(webOptions(options));
  }
}

window.Shen = Shen;
