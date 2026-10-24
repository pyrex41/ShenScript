# Exact-arity AOT workers

M2 implementation and application checks pass. Performance is exploratory on a
busy shared host; ordinary dynamic output remains the default. This is separate
from the older full-runtime continuation experiment and Chez/SOR results.

`--sealed` assigns a private raw worker to each eligible definition. Exact
non-tail calls select that worker, or the ordinary cell before a forward
definition is installed. Arguments occur once in generated source. Tail calls,
partial/overapplication, lexical/unknown targets and replaceable bindings keep
the original paths. Function bodies, async declarations, settlement and public
wrappers retain their original protocol. `--sealed --no-direct` selects the
sealing-only control.

## Authenticated application comparison

Evidence: `_build/performance/aot/20261024/`, `m2-confirm-{1,2}` and
`m2-confirm-summary.json`. Each cohort contains five fresh-process pairs for
each of three applications on Node and Bun, serially run, with reversed cohort
starting order, 1,000 warmup requests and the M0 calibrated request counts.
Every request validates its complete output. The parser requires eval and stays
outside this sealed comparison. Its authenticated shake was not changed.

These are median **paired** persistent CPU reductions against the sealing-only
M1 control, with wins out of ten; they are not ratios of aggregate medians.

| Application | Node CPU | Node wins | Bun CPU | Bun wins |
|---|---:|---:|---:|---:|
| Rules | 1.33% | 9/10 | 9.46% | 8/10 |
| Lists | 1.18% | 9/10 | 2.45% | 8/10 |
| Numerical | 1.95% | 8/10 | 1.51% | 8/10 |

Median paired wall reductions are respectively 1.55/1.22/1.97% on Node and
4.27/1.02/0.96% on Bun. Import CPU increases about 3–4% on Node and 1–5% on Bun;
import and first request are retained separately from persistent execution.
No speed claim is made for compilation. Host load and process contention are
retained before/after each cohort; quiet-host confirmation remains open.

Raw application bytes grow from 110,817 to 119,166 (rules), 82,020 to 86,618
(lists) and 83,512 to 88,403 (numerical). Node persistent GC counts remain
similar, consistent with wrapper dispatch removal rather than a new allocation
representation. Bun GC telemetry is unavailable, not zero. Heap deltas and RSS
are retained but are not allocated-byte or peak-memory measurements.

Frozen control snapshot index SHA-256:
`f7126c1f67b411385bca4455c38a6664cf1b9afc224a838e87d2729744edae27`.
Frozen compact candidate snapshot index SHA-256:
`9a8b937d565229ac5f9c2bae350dcb118961df752bf5630d11e0fbf1543b7fc3`.
Each index lists individual source/artifact hashes. Cohorts verify snapshot,
harness, dependency and package identities before and after measurement.

The initial three-pair pilot used a different conditional representation that
duplicated argument syntax; its evidence is preserved under `m2-pilot` and
does not qualify the compact implementation. Eight nested head calls now have
a linear source-size control and execute their effects exactly eight times.

## Mechanism and correctness

`benchmarks/aot/trace-direct.js` instruments disposable copies, never speed
artifacts. Its 11 validated requests execute 132,352 direct vector reads in the
numerical app, 7,106 filter calls in lists and 3,817 lazy-dereference calls in
rules. Full per-function counters are in `m2-direct-traffic/summary.json`.

Seven focused controls pass on Node and Bun: arity boundaries, async/rejection,
lexical capture, callee evaluation before argument mutation, forward errors,
thenable assimilation/microtask order, and source growth. The Node full port
suite passes 576 tests plus 154 kernel, 123 extensions and 29 benchmark checks.
Sealed self-contained/linked/browser-safe mode controls pass on both hosts.
Browser-engine speed, Deno and default adoption remain unqualified.
