# Async compiler boundaries, 2026-10-23

The next experiment should remove an unconditional async wrapper around a
conditional suspension, starting with `shen.parse-failure?`. The existing
compiler already avoids awaiting ordinary values at individual call sites.
However, an enclosing `async` function still returns a Promise even when none
of those sites suspends. This investigation changes diagnostic tools only;
the production compiler and runtime remain unchanged.

Source baseline: `d0f25f6a6b1d411ab1ed1e2134e91be4cb8ca7dc`, with the
43.1/ec16a9f kernel and the previous macro-walker experiment disabled. Work was
performed in the isolated `work/async-boundary-profile` worktree. These are new
ShenScript observations, independent of historical Chez/SOR measurements.

## What the counters show

The diagnostic renderer instruments generated kernel functions; the worker
also instruments dynamically compiled application definitions. Counts include
generated defuns, lambdas and IIFEs, rather than every JavaScript call. Every
invocation has its own frame. The transformation preserves async declarations
and records executed `await` expressions, return kinds and outer conditional
branches. Bootstrap, source loading, first execution, persistent execution and
typechecking have separate counters. Post-stage validation is `outside`.

| Phase | Generated async calls | Successful bodies with no local await | Fraction |
|---|---:|---:|---:|
| Interpreter, 50 persistent requests | 115,200 | 55,150 | 47.87% |
| C-minus parser, 50 persistent requests | 1,300,350 | 952,600 | 73.26% |
| Interpreter, 100 typechecks | 55,900 | 46,700 | 83.54% |
| Parser, 100 typechecks | 86,100 | 72,100 | 83.74% |
| Complete community suite | 21,193,872 | 14,815,128 | 69.90% |

Persistent execution excludes bootstrap and source compilation/loading. The
interpreter evaluates a depth-100 application; the parser processes a complete
30-assignment program and validates its entire AST. This harness uses the
backend and kernel with byte streams; it does not cover CLI/JS frontend startup.

The largest concrete cases are:

| Boundary | Observed work | Implication |
|---|---|---|
| `shen.parse-failure?` | 940,200 parser calls; all return values without a local await | A small wrapper makes a currently synchronous callee appear asynchronous to its callers. |
| `shen.newpv` | 25,200 parser typecheck calls; all have zero local awaits, despite three possible sites | Sequential continuation handling has wider reach than splitting a single branch. |
| `shen.gc` | 25,200 parser typecheck calls; all have zero local awaits; only 100 take the statically await-free outer branch | An outer-`if` split would cover just 0.40% of these calls. |
| `shen.fix-help` | 25,050 interpreter calls; 10,050 have zero local awaits | A branch split is plausible here, but has less reach than the parser target. |
| `tuple?` / its inner trap IIFE | 10,000 calls each in the interpreter; outer always awaits, inner never awaits | Nested error-handling scopes create another boundary; rejection handling must be preserved. |

The full suite repeats the first three patterns: `shen.parse-failure?` has
3,544,961 zero-await calls; `shen.newpv` and `shen.gc` each have 2,273,707.
These are body invocation counts, not measured Promise allocation savings.

## Why those boundaries exist

`hasExternalCalls` in `lib/backend.js` conservatively classifies calls through
mutable function cells. `buildFunction` retains `async` when the generated body
contains a possible await. `MaybeAwait` already emits this conditional pattern:

```js
(w$ = $.t(f(...args))) instanceof Promise ? await w$ : w$
```

For `(defun shen.parse-failure? (X) (= X (fail)))`, the generated function is
effectively:

```js
async X => {
  let w$;
  return $.asShenBool($.equate(X,
    (w$ = $.t(fail$c.f())) instanceof Promise ? await w$ : w$));
}
```

`fail` returns synchronously in these workloads. Nevertheless, this async
wrapper returns a Promise, and parser callers await it. Removing only the
inner conditional await cannot remove that wrapper. Declaring `fail` permanently
synchronous would also be incorrect under live rebinding.

`shen.newpv` extends the same issue across ticket lookup, variable allocation
and ticket update. `shen.gc` performs conditional ticket lookup/decrement.
Those callees currently return values on the measured paths. Their source
shape explains why a simple outer-branch transformation misses most calls.

## Independent sampling and limits

Node inspector sampled uninstrumented persistent execution separately: 5,000
validated interpreter requests and 1,000 validated parser requests, in serial
processes, at a requested 1 ms interval. The profiles contain 1,681 and 4,681
samples respectively. `future` plus `settle` account for approximately 19.2%
and 20.5% of sample-weighted intervals. The parser's `shen.parse-failure?`
definition accounts for approximately 4.1%; interpreter `shen.fix-help` for
5.3%. Kernel labels use the nearest preceding generated definition, so nested
functions can share a label. Anonymous dynamic application frames remain
unresolved. These percentages describe sampled intervals, including scheduler
gaps, and are not precise CPU-cost attribution.

The host was busy: load averages were about 32, with unrelated compilation,
runtime and conferencing processes active. Sampling includes unresolved/program
frames and GC (approximately 18.4% interpreter and 13.7% parser). Initial
50-request profiles had too few samples and were retained but superseded.
Sampling and counter runs are diagnostic, not paired performance comparisons.

Zero local awaits does **not** prove synchronous completion: bodies can return
a native Promise or a Trampoline that later reaches asynchronous work. The
counters distinguish those return kinds. They deliberately do not read foreign
`then` getters, so foreign thenables may be counted with values. A returned
Promise that later rejects is a returned Promise, not a locally escaping
exception. Hooks, frame allocation and `try/finally` perturb optimization and
allocation. Retained stage clocks, heap deltas and GC logs cannot quantify the
potential improvement; heap delta is not allocated bytes. No allocation or
speedup claim follows from these counts.

## Next experiment and gates

Prototype continuation handling for the single call in `shen.parse-failure?`:
evaluate the live callee once, settle it once, and continue immediately for an
ordinary result; enter a Promise continuation when it actually suspends. Keep
the prototype separate from the default compiler until qualified. Then consider
the sequential `newpv`/`gc` cases if the narrow experiment earns an application
improvement.

Required semantic controls include mutable cell lookup, sync-to-async rebinding,
evaluation order/effect count, delayed resolution and rejection, synchronous
throws versus Promise rejection, `trap-error`, foreign thenables, closures,
currying/overapplication, tail trampolines and async metadata. A sync continuation
can change JS-visible exception timing and scheduling, so these contracts need
explicit decisions and tests. Current-path observations cannot establish safety.

After correctness, use matched fresh artifacts and retained, balanced process
pairs on the complete interpreter, parser and suite. Separate boot/load from
persistent execution; measure allocated resources and GC as well as CPU/wall
time and host contention. Current performance improvement remains **OPEN**.

## Validation and reproduction

Node passes 530 port tests, 154 community kernel tests, 123 extension tests and
29 benchmark coverage checks. Six focused instrumentation controls pass on
Node and Bun: synchronous preservation, conditional suspension, rebinding and
trampolines, escaping errors, closures and concurrent calls completing in reverse
order. Lint passes. Both reference and instrumented processes pass the complete
154-test suite. Their application runs validate all 204 request results,
typechecks, load effects and live rebinding. Counter conservation checks pass.

Local evidence is retained under
`_build/performance/async-boundaries-20261023/`. Accepted counters are
`*-v5.json`, with corresponding reference/instrumented stdout and stderr,
`accepted-profiles.json`, `final-profile-identity.json` and
`boundary-summary-v5.json`. Earlier failed/intermediate renderings and profiles
are preserved. `cpu-long/` holds the accepted sampling profiles, generated
sampling worker and complete outputs. Production source hashes match the base.

To repeat in a new ignored directory, copy `lib/*.js` except `kernel.js` into
`NEW/variant/lib`, copy `kernel/` into `NEW/variant/kernel`, and render:

```sh
node benchmarks/performance/render-boundaries.js NEW/variant/lib
```

The renderer refuses production `lib` and existing kernel artifacts. For each
of `interpreter`, `cminus`, `suite`, run serial reference and instrumented workers
from the checkout root, retaining both output streams:

```sh
node benchmarks/performance/worker.js . interpreter
SS_BOUNDARY_OUTPUT=NEW/interpreter-v5.json node benchmarks/performance/boundary-worker.js NEW/variant interpreter
python3 benchmarks/performance/analyze-boundaries.py NEW --suffix v5
node benchmarks/performance/profile-boundary-cpu.js NEW/cpu
```

Run the analyzer after all three profiles exist. The CPU tool creates a new
output directory, runs the two applications serially with 60-second process
limits, and validates every request. It does not overwrite the normal worker.
