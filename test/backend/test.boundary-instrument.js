import { equal, ok, rejects } from 'node:assert/strict';
import backend from '../../lib/backend.js';
import { parseForm } from '../../scripts/parser.js';
import { createInstrumenter, attachBoundaryCounters } from '../../benchmarks/performance/boundary-instrument.js';

const setup = () => {
  const $ = backend(), probe = createInstrumenter();
  const { stats } = attachBoundaryCounters($, {}, probe, () => 'test');
  const evalJs = $.evalJs;
  $.evalJs = ast => evalJs(probe.instrument(ast, 'test'));
  return { $, probe, stats, exec: code => $.settle($.evalKl(parseForm(code))) };
};
const named = (stats, name) => Object.values(stats).find(row => row.name === name && row.kind === 'defun');

describe('diagnostic async boundary instrumentation', () => {
  it('leaves synchronous calls synchronous and counts their body exits', async () => {
    const { $, exec, stats } = setup();
    await exec('(defun plus-one (X) (+ X 1))');
    equal($.lookup('plus-one').f(2), 3);
    const row = named(stats, 'plus-one');
    equal(row.async, false); equal(row.calls, 1); equal(row.completed, 1);
    equal(row.zeroAwaitValues, 1); equal(row.awaitEvents, 0);
  });
  it('distinguishes an async declaration from an actually executed await', async () => {
    const { $, exec, stats } = setup();
    $.defun('external', async x => x + 1);
    await exec('(defun branch (X) (if (= X 0) 0 (+ 1 (external X))))');
    const first = $.lookup('branch').f(0); ok(first instanceof Promise);
    equal(await $.settle(first), 0); equal(await $.settle($.lookup('branch').f(1)), 3);
    const row = named(stats, 'branch');
    equal(row.async, true); equal(row.calls, 2); equal(row.zeroAwaitValues, 1);
    equal(row.awaitEvents, 1); equal(row.awaitSites, 1); equal(row.splitConditional, true);
    equal(row.rootTrue, 1); equal(row.rootFalse, 1);
  });
  it('separates returned trampolines from values and observes rebinding', async () => {
    const { $, exec, stats } = setup();
    $.defun('external', x => x + 1); $.defun('tail', x => x + 1);
    await exec('(defun branch-tail (X) (let Y (external X) (tail Y)))');
    equal(await $.settle($.lookup('branch-tail').f(1)), 3);
    $.defun('external', async x => x + 10);
    equal(await $.settle($.lookup('branch-tail').f(1)), 12);
    const row = named(stats, 'branch-tail');
    equal(row.calls, 2); equal(row.zeroAwaitTrampolines, 1);
    equal(row.awaitEvents, 1); equal(row.trampolines, 2); equal(row.tailTargets.tail, 2);
  });
  it('counts escaping exceptions without swallowing them', async () => {
    const { $, exec, stats } = setup();
    $.defun('external', async x => x);
    await exec('(defun failure (X) (if X (simple-error "boundary failure") (+ 1 (external 1))))');
    await rejects(() => $.settle($.lookup('failure').f($.s`true`)), /boundary failure/);
    const row = named(stats, 'failure');
    equal(row.calls, 1); equal(row.completed, 1); equal(row.exceptions, 1); equal(row.zeroAwaits, 0);
  });
  it('keeps closures and per-invocation state separate', async () => {
    const { $, exec } = setup();
    await exec('(defun make-adder (X) (lambda Y (+ X Y)))');
    const a = await $.settle($.lookup('make-adder').f(10));
    const b = await $.settle($.lookup('make-adder').f(20));
    equal(await $.settle(a(1)), 11); equal(await $.settle(b(2)), 22);
  });
  it('keeps await counts independent when calls resolve out of order', async () => {
    const { $, exec, stats } = setup(); const resolve = [];
    $.defun('external', x => new Promise(yes => { resolve[x] = yes; }));
    await exec('(defun pending (X) (+ 1 (external X)))');
    const a = $.lookup('pending').f(0), b = $.lookup('pending').f(1);
    resolve[1](20); equal(await $.settle(b), 21);
    resolve[0](10); equal(await $.settle(a), 11);
    const row = named(stats, 'pending');
    equal(row.calls, 2); equal(row.completed, 2); equal(row.awaitEvents, 2); equal(row.zeroAwaits, 0);
  });
});
