import backend from './backend.js';
import config from './config.node.js';
import kernel from './kernel.js';
import frontend from './frontend.node.js';

export const createShen = (options = {}) => kernel(backend({ ...config, ...options })).then(frontend);

export default class Shen {
  constructor(options = {}) {
    return createShen(options);
  }
}
