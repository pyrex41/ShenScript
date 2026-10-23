# Promise-aware macro walking: tested, not enabled

The experiment builds on local `4ae9947`, the qualified ShenScript 43.1 refresh
including PR117/ec16a9f and the latest 9693dc6 benchmark additions. It tests one
narrow opportunity from [the earlier profile](performance-43.1.md): avoid
creating a Promise at every macro-walker node when the current macro result is
synchronous. Kernel sources, compiler-wide async classification, dependencies,
currying, primitive lowering and dynamic rebinding are unchanged.

**Decision: keep the default implementation unchanged.** The prototype reduces
instrumented Promise resources by 5.36%, but two paired cohorts do not qualify
an end-to-end speed improvement. It is retained as
[`promise-aware-macro-walk.patch`](../benchmarks/performance/promise-aware-macro-walk.patch)
for explicit experiments. There is no runtime switch, automatic installation or
new public API.

## Prototype and behavioral checks

The public `macroexpand` function still always returns a Promise. Internally,
the prototype walks synchronously until it encounters a Promise after settling
trampolines. One async loop resumes the remaining siblings, avoiding a retained
chain of `.then` callbacks for a long list. An actual async macro preserves its
suspension boundary. Foreign thenable results retain their original receiver,
a single getter read, asynchronous resolution and rejection.

Bottom-up and left-to-right visits, identity on equal-but-fresh results,
restart from the first macro after a change, source-form shielding, per-call
registry snapshots, mutation at suspension points, concurrent expansions and
long flat lists are covered. The same **17 regression cases** pass against the
frozen baseline and prototype on Node; both implementations also pass those
cases on Bun. Vector inputs remain atomic. The prototype deliberately removes
gratuitous per-node microtask yields; exact interleaving of host work queued
without returning a Promise is not guaranteed equivalent. Very deep nesting,
cycles and arbitrary exotic/proxied AST objects are not newly qualified.

The tests are retained against the normal implementation to protect those
behavioral requirements in future work. The candidate source and patch are
frozen independently of the restored default.

## Serial paired measurements

Evidence: `_build/performance/macro-walk-20261023/`, with immutable baseline and
candidate `lib/` and `kernel/` snapshots. Both use the same generated kernel,
unchanged 43.1 sources and backend. The first cohort alternates baseline-first;
the repeat starts candidate-first, producing ten pairs balanced across starting
order. Each cohort has thirty fresh Node processes: five pairs for interpreter,
C-minus parser and the complete certification suite.

Each application process validates its complete first result, fifty persistent
results, one hundred typechecks, initializer count and compatible rebinding.
The interpreter evaluates a depth-100 expression; the parser checks the entire
AST of a thirty-assignment program. Across both cohorts, all **2040 complete
application requests** pass. All twenty suite processes validate 154 passed,
zero failed, and retain their complete suite output.

The application harness boots the backend and kernel, without the JavaScript
interop frontend or CLI setup. It is not a full CLI startup benchmark.
Stage clocks separate bootstrap, application loading, first request, persistent
validated batches and typechecking. Parent-to-READY and whole-process wall are
retained. GC events, pause duration, heap-used delta and end-of-stage RSS are
recorded; heap deltas are not allocation totals, and RSS is not sampled peak
memory. Per-process limits are 120 seconds, each cohort is bounded at 600
seconds and stdout at 4 MiB. Code/artifact hashes must remain stable during a
cohort; the initial controller is preserved before adding reverse-order support.

Apple M5, ten logical CPUs, 32 GiB, macOS arm64, Node 22.23.3. Host load was
roughly 24–26 during the first cohort, exceeding the CPU count. These are
**busy-host exploratory results**. The raw ratios and both cohorts remain;
no slow samples were discarded.

Positive percentages below mean lower candidate CPU. Each percentage is derived
from the median of paired baseline/candidate ratios, not from marginal medians.

| CPU stage | First five pairs | Reversed repeat | Candidate wins / ten |
| --- | ---: | ---: | ---: |
| Interpreter load | +0.97% | +3.02% | 7/10 |
| Parser load | +2.99% | +0.50% | 7/10 |
| Complete suite | -1.19% | -1.46% | 4/10 |
| Parser first request | -11.04% | -4.42% | 3/10 |

Across ten pairs, median paired load reductions are 2.00% and 1.50%; suite CPU
is 1.32% higher, and the parser's first request is 8.23% higher. These small,
noisy load gains do not justify changing the default. Marginal suite medians
in the first cohort look substantially better for the candidate; the paired
ratios do not, illustrating why the paired records matter.

Persistent/typechecking times also move, but a separate attribution worker
records **366/741 calls** to the changed macro entry point during the two
application loads and **zero** during first, persistent and typechecking stages.
Thus apparent typechecking gains are not direct macro-walker execution gains;
heap/JIT state and contention can carry over from loading. Bootstrap attribution
is outside this counter's scope. Timing changes alone do not establish causation.

## Promise resources and GC

A separate Node `async_hooks` diagnostic counts PROMISE initialization events
while running the complete suite and its bootstrap:

| Variant | Instrumented Promise resources |
| --- | ---: |
| Baseline | 80,557,111 |
| Prototype | 76,236,381 |
| Reduction | 4,320,730 / 5.36% |

Both diagnostic processes pass the full suite. Hooks affect optimization and
execution cost, so these counts are not uninstrumented timing samples or exact
heap-byte savings. In the first timing cohort, median suite collections are
1842 versus 1787 and GC pauses 774.2 versus 745.1 ms. Less Promise machinery
alone does not guarantee less total CPU. No claim of a 5.36% speedup, heap-byte
reduction or smaller peak footprint is made.

## Qualification and next step

The prototype passes the complete Node suite: 504 backend cases, ten frontend,
ten CLI, 154 kernel, 123 extension and 29 upstream benchmark checks. It also
passes all 524 port cases, 154/0 kernel, 123/0 extension and 29 benchmark cases on
Bun 1.4.3. ESLint, Yggdrasil and all three browser bundle builds pass. These are
functional qualification, not independent review or interactive-browser testing.

After restoring the default, the complete Node suite and the new Bun regression
cases pass again. Package qualification checks the restored runtime, report and
public frontend from a fresh `/tmp` installation. Deno and controlled-host
performance remain open. Prior evidence and sibling worktrees are preserved;
no push, upstream write or master rewrite occurs.

The next investigation should measure compiler-generated async boundaries and
trampoline settlement in an actual symbolic application. A function with one
potentially suspending branch can still allocate a Promise on every invocation.
That broader boundary is a more promising target than this walker alone, but
needs guards for rebinding, async callbacks, exceptions and stack safety. This
experiment does not implement that compiler redesign.

## Reproduce from a source checkout

Use a clean isolated worktree and a working generated `lib/kernel.js`. Preserve
a baseline before applying the patch; do not point the baseline at mutable files
in another developer's checkout.

```sh
npm ci --ignore-scripts
npm run build-kernel
# Copy lib/ and kernel/ into an owned, immutable BASELINE directory first.
git apply --check benchmarks/performance/promise-aware-macro-walk.patch
git apply benchmarks/performance/promise-aware-macro-walk.patch
node node_modules/mocha/bin/mocha.js test/backend/test.macro-walk.js
npm test
python3 benchmarks/performance/compare-macro-walk.py --baseline BASELINE \
  --output _build/new-macro-cohort --samples 5
python3 benchmarks/performance/analyze-macro-walk.py _build/new-macro-cohort
# Repeat with a new directory and --candidate-first to reverse starting order.
```

The patch must be applied explicitly; importing ShenScript does not enable it.
Retain the source snapshots, raw outputs and diagnostics alongside the report.
