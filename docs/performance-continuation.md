# Parse-failure continuation experiment, 2026-10-23

This opt-in prototype removes an unconditional Promise boundary from
`shen.parse-failure?`. It is a narrow proof target for the
[async boundary investigation](performance-async-boundaries.md), not a general
compiler transformation. Production defaults remain unchanged: successful raw
JS calls change return type and effect/microtask ordering under the prototype.
Across ten busy-host pairs, persistent parser CPU is 14.76% lower (nine wins),
with 72.30% fewer Promise resources in a separate diagnostic. Interpreter
execution does not improve; controlled-host performance qualification is open.

The baseline is `1ee24409609d596be603f38999ac297a7560570e`, with the unmodified
43.1/ec16a9f kernel and the macro-walker experiment disabled. The experiment
uses isolated branch `work/parse-failure-continuation`. Source and generated
baseline artifacts were frozen before patching; no historical Chez/SOR result
is used to qualify this work.

## Implementation and behavior

The original function always returns a Promise:

```js
async X => {
  let w$;
  return $.asShenBool($.equate(X,
    (w$ = $.t(fail$c.f())) instanceof Promise ? await w$ : w$));
}
```

The prototype returns a value on successful synchronous paths and enters an
async continuation only when settlement produces a native Promise:

```js
Object.assign(X => {
  try {
    let result$ = $.t(fail$c.f());
    return result$ instanceof Promise
      ? (async () => $.asShenBool($.equate(X, await result$)))()
      : $.asShenBool($.equate(X, result$));
  } catch (error$) {
    return Promise.reject(error$);
  }
}, { async: true })
```

The live cell is read once, its result is settled once, errors remain rejected
Promises, and `$.l` retains the async calling convention for currying,
overapplication and frontend metadata. The transformation runs only for the
named definition and an exact match of its compiled expression. Lexical
bindings and replacement equality inliners fall back to ordinary compilation.
Only this generated kernel definition changes; the original kernel sources
remain byte-identical. Kernel functions recompiled dynamically use the same
guarded compiler path.

An earlier name/source-shape match failed lexical-`fail` and custom-inliner
controls. It was superseded by the compiled-expression guard. Initial control
expectations for zero-argument partial arity and an equality-named parameter
were also corrected against baseline behavior. Failed receipts are retained;
they do not qualify the final candidate.

The JS-visible differences are deliberate and demonstrated by
`continuation-contracts.js`:

| Observation | Baseline | Prototype |
|---|---|---|
| Successful raw call returns a Promise | yes | no |
| Async metadata | true | true |
| Queued microtask versus subsequent Shen effect | microtask, effect | effect, microtask |

Consequently, functional agreement does not establish compatibility for an
embedding that relies on these yields. No scheduling-preservation claim is made.
The experiment remains an explicit patch, with no default switch or automatic
discovery. A general transformation also needs evaluation-order, binding,
exception-scope and continuation handling beyond this single expression.

## Paired application measurements

Two reversed five-pair cohorts give ten pairs per workload: 60 fresh processes,
2,040 completely checked application requests and twenty complete community
suite runs. The table uses the median of each pair's candidate/baseline ratio;
positive reductions favor the prototype. CPU medians are shown separately and
are not the inputs to the paired percentages.

| Workload / stage | Baseline / candidate median CPU ms | Paired CPU reduction | Candidate CPU wins | Paired wall reduction |
|---|---:|---:|---:|---:|
| Interpreter load | 659.94 / 647.53 | 7.23% | 7/10 | 15.18% |
| Interpreter first request | 1.30 / 1.36 | -1.98% | 5/10 | -2.47% |
| Interpreter persistent 50 | 73.92 / 74.26 | -1.83% | 4/10 | -3.96% |
| Interpreter 100 typechecks | 75.53 / 80.50 | -6.06% | 1/10 | -8.57% |
| Parser load | 1,515.83 / 1,374.84 | 9.74% | 10/10 | 17.87% |
| Parser first request | 15.73 / 15.95 | -4.32% | 4/10 | 29.40% |
| Parser persistent 50 | 404.15 / 350.54 | 14.76% | 9/10 | 38.46% |
| Parser 100 typechecks | 106.17 / 102.56 | 1.03% | 5/10 | 10.22% |
| Community suite | 12,545.13 / 12,100.52 | 3.47% | 6/10 | 6.91% |

Persistent parser CPU reductions are 13.87% and 15.41% in the two cohorts.
This is a promising application signal; there is no general throughput claim.
Interpreter execution and typechecking do not improve. The suite result is
less consistent, and a single parser request does not show a CPU benefit.

Median GC collections in persistent parsing decrease from 78 to 34, with
pauses from 17.04 to 8.49 ms. Suite collections decrease from 1,838.5 to 1,684.5,
with pauses from 581.92 to 542.42 ms. These observations are not allocated-byte
or peak-footprint measurements.

The arm64 macOS host is heavily contended: cohort boundary load averages range
from about 22 to 30, with unrelated compilation/runtime and Defender activity.
Bootstrap comparisons vary sharply (suite bootstrap is 10.95% worse in paired
CPU despite very few changed predicate calls). Wall reductions exceed CPU
reductions in parsing, also indicating scheduling/contention effects. Timings
remain exploratory and need a controlled-host repeat.

## Promise resource diagnostic

Separate serial hook-enabled processes pass the same complete output checks:

| Stage | Baseline PROMISE events | Prototype PROMISE events | Reduction |
|---|---:|---:|---:|
| Interpreter load | 5,386,053 | 4,201,805 | 21.99% |
| Interpreter persistent 50 | 370,603 | 370,603 | 0% |
| Parser load | 11,488,777 | 9,208,133 | 19.85% |
| Parser persistent 50 | 5,201,403 | 1,440,603 | 72.30% |
| Community suite, excluding bootstrap | 80,227,507 | 66,047,663 | 17.67% |

Both typechecking phases also have identical resource counts across variants.
The parser persistent reduction is exactly 3,760,800 events: four per call
identified by the prior boundary profile. The suite reduction is likewise
four times its 3,544,961 predicate calls. This supports the mechanism: removing
the callee boundary also removes Promise settlement/await machinery in callers.
It does not imply a 72% speedup or a corresponding byte/peak-memory reduction.

## Evidence boundaries

Local receipts live under `_build/performance/continuation-20261023/`.
Baseline/candidate source snapshots, generated kernels, hashes, complete stdout
and stderr, per-stage CPU/wall/heap/GC records and host/process observations
are retained. Initial v1 cohorts are preliminary; accepted guarded-source
cohorts are named `guarded-1` and `guarded-2`. Fourteen semantic controls run
against both baseline and candidate on Node and Bun. Sampling/resource hooks
are kept separate from timing processes.

The process harness validates the entire depth-100 interpreter result and the
complete AST of a 30-assignment C-minus program on the first request and all
50 persistent requests. It also checks 100 typechecks, load effects and live
rebinding. Each suite process checks all 154 community tests and retains its
complete output. Bootstrap and source loading are separate stages; the harness
does not measure frontend/CLI startup. Paired comparisons use fresh processes
and reverse workload and variant order; the second cohort reverses the starting
variant as well.

Promise diagnostics count Node `async_hooks` PROMISE initialization events by
phase. These are resource counts, not allocated bytes or speed measurements.
Heap deltas are not allocated bytes. GC events and pauses come from the
uninstrumented timing workers. Busy-host measurements remain exploratory.

The previous boundary profile's 15 production library hashes match this frozen
baseline, including the generated kernel. It records 940,200 predicate calls in
the parser's persistent phase, 296,062/570,161 during interpreter/parser source
loading, and 3,544,961 in the suite. There are no predicate calls during
interpreter persistent execution or either application's typechecking phase.
Differences in those phases cannot be attributed to direct execution of this
predicate; changed heap/JIT state and host contention remain possible causes.

## Functional qualification and remaining gates

The guarded prototype passes 544 port tests, 154 community kernel tests, 123
extension tests and 29 benchmark coverage checks on Node 22.23.3 and Bun 1.4.3.
The fourteen new controls pass on both baseline and candidate in both runtimes.
They cover successful results/metadata, live lookup/effect count, rebinding,
delayed resolution/rejection, synchronous errors, traps, foreign thenables,
trampolines, concurrent calls, closures, currying/overapplication, comparison
errors, source-shape fallback, lexical bindings and custom equality inliners.
Yggdrasil checks and all three browser bundle builds pass; the optimized bundle
retains its asset-size advisory. This does not qualify interactive browsers,
Deno, sealed integration or arbitrary continuation lowering.
After restoring defaults, the complete Node suite, focused Bun controls and
lint pass again. The production library and generated kernel match the frozen
baseline byte for byte. Package dry-run verification includes this report.

The patch stays disabled. Enabling it requires an explicit contract decision
about JS return types and microtask scheduling, plus a controlled-host repeat
and broader application evidence. Extending the method to `newpv`/`gc` requires
a compiler design for sequences, effects, bindings and exception scopes; this
hardcoded proof target is not that design.

## Reproduction

Use a clean checkout with dependencies installed and render/freeze `lib/` and
`kernel/` into an owned baseline first. Never reuse mutable production files as
the baseline. Applying the patch is explicit:

```sh
git apply --check benchmarks/performance/parse-failure-continuation.patch
git apply benchmarks/performance/parse-failure-continuation.patch
npm run build-kernel
node node_modules/mocha/bin/mocha.js test/backend/test.parse-failure-continuation.js
npm test
python3 benchmarks/performance/compare-macro-walk.py --baseline BASELINE --output NEW1 --samples 5
python3 benchmarks/performance/compare-macro-walk.py --baseline BASELINE --output NEW2 --samples 5 --candidate-first
python3 benchmarks/performance/analyze-paired.py NEW1 NEW2 > SUMMARY.json
node benchmarks/performance/profile-promises.js BASELINE NEW_RESOURCES
node benchmarks/performance/continuation-contracts.js BASELINE
node benchmarks/performance/continuation-contracts.js .
```

The existing comparison runner is reused despite its historical filename.
It bounds each process at 120 seconds and each cohort at 600 seconds, retains
every sample and checks source/artifact stability and complete paired results.
Resource profiling has a separate 120-second limit per process. Preserve failed
and partial runs before retrying. Reverse the patch and re-render the kernel to
restore production defaults.
