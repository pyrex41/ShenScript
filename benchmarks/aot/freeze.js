// Freeze generated artifacts and their linked dependencies before compiler edits.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

if (process.argv.length !== 4) throw new Error('Usage: freeze.js GENERATED_DIRECTORY NEW_SNAPSHOT');
const source = path.resolve(process.argv[2]), target = path.resolve(process.argv[3]);
fs.mkdirSync(target, { recursive: false });
fs.cpSync(source, target, { recursive: true });
const lib = fileURLToPath(new URL('../../lib/', import.meta.url));
fs.mkdirSync(path.join(target, 'lib'));
for (const file of fs.readdirSync(lib).filter(x => x.endsWith('.js') && x !== 'kernel.js')) fs.copyFileSync(path.join(lib, file), path.join(target, 'lib', file));
fs.writeFileSync(path.join(target, 'package.json'), '{"type":"module"}\n');
for (const file of fs.readdirSync(target).filter(x => x.endsWith('.mjs'))) {
  const destination = path.join(target, file);
  const input = fs.readFileSync(destination, 'utf8');
  const output = input.replaceAll(new URL('../../lib/', import.meta.url).href, './lib/');
  fs.writeFileSync(destination, output);
}
const hashes = {};
const walk = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile()) hashes[path.relative(target, file)] = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    else throw new Error('Snapshot contains a non-regular entry');
  }
};
walk(target);
fs.writeFileSync(path.join(target, 'snapshot.json'), JSON.stringify(hashes, null, 2) + '\n');
console.log('AOT_SNAPSHOT', Object.keys(hashes).length, target);
