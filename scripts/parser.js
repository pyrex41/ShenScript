import fs from 'node:fs';
import parsimmon from 'parsimmon';
import config from './config.js';
import { flatMap } from '../lib/utils.js';

const { alt, createLanguage, regexp, string } = parsimmon;
const { klPath, klFiles, klExt } = config;

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
const parseKernel = () => flatMap(klFiles, file => parseFile(fs.readFileSync(`${klPath}/${file}${klExt}`, 'utf-8')));

export { parseFile, parseForm, parseKernel };
