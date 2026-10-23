// Record intentional JS-observable differences; these are default-enabling gates.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseForm } from '../../scripts/parser.js';

if (process.argv.length !== 3) throw new Error('Usage: continuation-contracts.js VARIANT_ROOT');
const root = path.resolve(process.argv[2]);
const { default: backend } = await import(pathToFileURL(path.join(root, 'lib/backend.js')));
const $ = backend(), events = [];
const exec = code => $.settle($.evalKl(parseForm(code)));
$.defun('fail', () => 1);
$.defun('effect', () => { events.push('effect'); return 2; });
await exec('(defun shen.parse-failure? (X) (= X (fail)))');
await exec('(defun caller () (let R (shen.parse-failure? 1) (+ (effect) 0)))');
const target = $.lookup('shen.parse-failure?').f;
const raw = target(1);
assert.equal(await $.settle(raw), $.s`true`);
const result = $.settle($.lookup('caller').f());
queueMicrotask(() => events.push('microtask'));
assert.equal(await result, 2);
assert.equal(target.async, true);
console.log(JSON.stringify({ returnsPromise: raw instanceof Promise, async: target.async, events }));
