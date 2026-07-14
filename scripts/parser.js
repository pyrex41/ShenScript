import fs from 'node:fs';
import parsimmon from 'parsimmon';
import config from './config.js';
import { flatMap } from '../lib/utils.js';

const { alt, createLanguage, regexp, string } = parsimmon;
const { klPath, klFiles, klFilesPostOverride, klExt } = config;

const language = createLanguage({
  whitespace: _ => regexp(/\s*/m),
  numeric:    _ => regexp(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?![^\s()])/).map(Number),
  textual:    _ => regexp(/[^"]*/m).trim(string('"')),
  symbolic:   _ => regexp(/[^\s()]+/).map(Symbol.for),
  value:      r => alt(r.numeric, r.textual, r.symbolic, r.form),
  form:       r => r.value.trim(r.whitespace).many().wrap(string('('), string(')')),
  file:       r => r.value.trim(r.whitespace).many()
});
const parseFile = s => language.file.tryParse(s);
const parseForm = s => parseFile(s)[0];
const parseFiles = files => flatMap(files, file => parseFile(fs.readFileSync(`${klPath}/${file}${klExt}`, 'utf-8')));
// Skip modules whose .kl is absent (with a warning). stlib.kl is generated from
// the vendored Lib/StLib sources by scripts/render-stlib.js; before that runs it
// does not exist, and render.js must still be able to produce a stlib-less kernel
// (which render-stlib.js itself boots to do the generation).
const parseFilesOptional = files =>
  parseFiles(files.filter(file => {
    const exists = fs.existsSync(`${klPath}/${file}${klExt}`);
    if (!exists) {
      console.warn(`  (skipping ${file}${klExt}: not present)`);
    }
    return exists;
  }));
// Kernel modules booted before ShenScript's native overrides are installed.
const parseKernel = () => parseFiles(klFiles);
// Modules booted after overrides (init/declare forms + extensions + stlib).
const parseKernelPostOverride = () => parseFilesOptional(klFilesPostOverride);

export { parseFile, parseForm, parseFiles, parseKernel, parseKernelPostOverride };
