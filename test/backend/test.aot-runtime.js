import { equal, throws, ok } from 'node:assert/strict';
import runtime from '../../lib/runtime.js';
import installSealing from '../../lib/aot-runtime.js';

describe('optional AOT binding sealing', () => {
  it('leaves ordinary environments mutable', () => {
    const $ = runtime(); $.defun('f', x => x + 1); $.defun('f', x => x + 2);
    equal($.lookup('f').f(1), 3); equal($.sealFunction, undefined);
  });
  it('rejects registration aliases and direct writes for sealed functions', () => {
    const $ = installSealing(runtime()); $.defun('f', x => x + 1); const cell = $.lookup('f'), f = cell.f;
    equal($.sealFunction('f'), $.symbolOf('f')); equal($.sealFunction('f'), $.symbolOf('f'));
    throws(() => $.defun('f', x => x), /sealed function/); throws(() => $.d('f', x => x), /sealed function/);
    throws(() => { cell.f = x => x; }, TypeError); throws(() => { cell.f.arity = 20; }, TypeError);
    equal(cell.f, f); equal(cell.f(1), 2);
  });
  it('guards map replacement, deletion and clearing', () => {
    const $ = installSealing(runtime()); $.defun('f', () => 1); $.sealFunction('f');
    throws(() => $.globals.set('f', {}), /sealed/); throws(() => $.globals.delete('f'), /sealed/); throws(() => $.globals.clear(), /sealed/);
    throws(() => Object.defineProperty($.lookup('f'), 'f', { value: () => 99 }), TypeError);
    equal($.lookup('f').f(), 1);
  });
  it('preserves global data and nonsealed function rebinding', () => {
    const $ = installSealing(runtime()); $.defun('f', () => 1); $.sealFunction('f');
    $.assign('f', 20); equal($.valueOf('f'), 20);
    $.defun('g', () => 2); $.defun('g', () => 3); equal($.lookup('g').f(), 3);
    ok($.globals.delete('g')); equal($.lookup('f').f(), 1);
  });
  it('preserves exact/partial/overapplication and async functions', async () => {
    const $ = installSealing(runtime()); $.defun('f', async (x, y) => x + y); $.sealFunction('f');
    equal(await $.lookup('f').f(1, 2), 3); equal(await $.settle($.lookup('f').f(1)(2)), 3);
    $.defun('g', x => $.fun(y => x + y)); $.sealFunction('g');
    equal(await $.settle($.lookup('g').f(1, 2)), 3);
  });
  it('rejects undefined function seals without disabling later registration', () => {
    const $ = installSealing(runtime()); throws(() => $.sealFunction('missing'), /undefined function/);
    $.defun('missing', () => 1); equal($.lookup('missing').f(), 1);
  });
  it('keeps borrowed map operations working on unrelated maps', () => {
    const $ = installSealing(runtime()); $.defun('f', () => 1); $.sealFunction('f');
    const other = new Map(); $.globals.set.call(other, 'f', 10); equal(other.get('f'), 10);
    $.globals.clear.call(other); equal(other.size, 0);
  });
});
