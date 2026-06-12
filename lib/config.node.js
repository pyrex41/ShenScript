import config from './config.js';
import { multiMatch } from './utils.js';

const isDeno = typeof Deno !== 'undefined' && Deno.version && Deno.version.deno;
const isBun = typeof process !== 'undefined' && process.versions && process.versions.bun;
const implementation = isDeno ? 'Deno' : isBun ? 'Bun' : 'Node.js';
const os = multiMatch(process.platform,
  [/win32|win64/i, 'Windows'],
  [/darwin|mac/i , 'macOS'],
  [/linux/i      , 'Linux']);
const release =
  isDeno ? Deno.version.deno :
  isBun ? process.versions.bun :
  process.version.slice(1);

export default { ...config, implementation, os, release };
