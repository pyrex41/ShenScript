# Shen 43.1 refresh and Chez-guided performance work

This fork now uses the unmodified community 43.1 runtime at `ec16a9f`, including
[PR 117](https://github.com/Shen-Language/shen-sources/pull/117), plus the
benchmark/coverage additions in upstream `9693dc6`. That was upstream HEAD when
this investigation began. It is a pinned source snapshot, not a new official
release; `(version)` still returns `43.1`. Both downloaded archives are pinned
by SHA-256. The full provenance is in
[kernel/klambda/PROVENANCE.md](../kernel/klambda/PROVENANCE.md).

The original baseline is ShenScript `a4619e2`, which used the original 43.1
release at `715824a`. The updated-kernel baseline retains the original port
implementation. The final candidate adds only two production runtime changes:
fixed-arity wrappers through ten arguments and the list equality fix below.
No KL modules are patched, dependencies upgraded, environment serialized, async
I/O removed, or calls statically sealed by this work.

## What the Chez comparison explains

Chez compiles both loaded/evaluated Scheme and ahead-of-time files to machine
code. Its optimizer handles inlining, constant folding, dead code and type-based
elimination of redundant checks. Its runtime supports Scheme tail calls
without a JavaScript-level trampoline/promise for each transition. These are
compiler/runtime facilities, not a blanket consequence of calling a language
"Scheme". See the [official implementation overview](https://github.com/cisco/ChezScheme/blob/main/IMPLEMENTATION.md)
and [compiler controls](https://cisco.github.io/ChezScheme/csug10.0/system.html).
The installed Chez 10.3 source/manual was also inspected; its `cp0` and `cptypes`
passes describe inlining and safe-mode check removal.

ShenScript already compiles KL into JavaScript and benefits from V8/JSC native
JIT compilation. It already has primitive inlining, stable mutable cells for
rebinding, conditional awaits, synchronous demotion, flattened lets and some
fixed-arity wrappers. The remaining costs include explicit trampoline objects,
curried calls, promises and microtask resumptions. A compiled function containing
one potentially suspending branch may still be an async function on a fast
branch that never needs to suspend. Dynamic rebinding and async streams prevent
simply assuming that every current synchronous callee will stay synchronous.
V8's [async implementation discussion](https://v8.dev/blog/fast-async) explains
why these promises/resumptions are real work even when their values settle
quickly; its historical timing claims are not used as current measurements.

A CPU profile of the updated kernel's complete certification suite spends
substantial samples in generated code, GC, `future`, `settle` and generic call
wrappers. An instrumented diagnostic counts **2,526,518 exact calls at arities
5–10** taking the generic wrapper path; fixed-arity wrappers stopped at four.
Instrumentation is excluded from all timing cohorts. Allocation sampling that
includes collected objects also identifies `future` and generated kernel code
as large sources. Heap sample sizes are estimates, not exact allocation totals.

## Changes retained

The existing synchronous and asynchronous wrapper tables now extend through ten
arguments. Exact calls directly invoke the underlying function with fixed
parameters. Partial application, overapplication, zero-argument rewrapping and
higher arities retain the existing generic paths. Async wrappers remain plain
functions returning the callee's promise; their async marker is preserved.
Tests exercise both sides of the cutoff, currying, overapplication, exceptions,
async trampolines and redefinition of an already compiled high-arity callee.

The newest upstream coverage also exposed an existing equality bug. After a
failed Cons comparison, `equate` fell through to generic object comparison,
which compared the same head/tail again. Each failing suffix could be retried
recursively, yielding exponential work for late list mismatches. The specialized
list result is now final; arrays likewise return their structural result.
Generic JavaScript object comparison otherwise stays in its existing path.

A bounded control compares separately constructed 32-element prefixes ending
in different symbols. The old evaluator exceeds a 256-tail-read budget; the
fixed evaluator returns false after 64 reads. This is a deterministic traversal
check, not a timing-derived speedup. The original upstream 29-case coverage
hung on its late list mismatch in a bounded diagnostic; it now passes. Tests
cover native and compiled equality, nested lists/vectors and interop objects.
Very long recursive structures and cyclic equality are not newly qualified.

The benchmark fixture defines its own `power`, which collides with this port's
preloaded StLib system function. Its runner permits only that replacement in
its isolated process. The upstream benchmark/coverage files remain unchanged.

## Measurement boundaries

The retained source-bound evidence is under `_build/performance/20261022/`.
`original-431/` and `updated-431/` freeze the two kernel levels. `wrappers-only/`
retains the first optimization exactly, verified against its recorded hash.
The initial wrapper-only cohort is separate from the final combined candidate.

Each Node cohort has 45 serial fresh processes: five samples for three variants
and three workloads. Order reverses between samples. Stages separate kernel
bootstrap, source application loading, first request, fifty persistent requests,
one hundred typechecks, and the certification suite. Every application request
is checked against its complete result; expected initializer count and dynamic
rebinding are also checked. Complete suite output and 154/0 totals are retained.
The interpreter evaluates a depth-100 expression; the parser processes a C-minus
program with thirty assignments and validates its complete AST.

`rows.json` includes CPU/wall, heap-used delta, end-of-stage RSS, GC count and GC
pause duration. GC events are assigned by their timestamps. Heap deltas can be
negative and **are not allocation counts**; RSS is not a sampled peak. Allocation
profiles use V8 sampling separately from uninstrumented timings. Parent READY and
whole-process wall are retained; Node's inner bootstrap clock excludes module
imports and should not be equated with Chez's process CPU at READY.

A separate alternating Node/Chez control uses the same source applications,
requests and typechecks and compares complete results. It uses dynamic source
loading on both sides, not a precompiled native module on only one side. The
Chez control is the user's qualified Chez-first fork with default compilation,
cache feature off, Chez 10.3 optimize 2/debug 0; all 23 raw KL modules match the
pinned archive used here. Both runtimes pass 154 certification checks. Their
native primitives, I/O implementations, compiler and data representations remain
part of the comparison; this does not isolate one compiler pass.

Timings are exploratory on the shared Apple M5/10-CPU/32-GiB macOS arm64 host,
Node 22.23.3 and Bun 1.4.3. Host load/process snapshots are retained for each
cohort. V8 process CPU includes its compilation/GC worker threads and can exceed
wall time. A source/artifact audit must pass before accepting a cohort.

## Results and limits

The final combined five-pair Node cohort is `paired-final/`. The ordinary
updated-kernel baseline and the candidate have the following CPU medians:

| Stage | Updated kernel, original port | Final port | Paired CPU wins |
| --- | ---: | ---: | ---: |
| Interpreter source load | 939.791 ms | 933.504 ms | 4/5 |
| Parser source load | 1913.675 ms | 1791.420 ms | 4/5 |
| Complete certification suite | 16619.219 ms | 16208.244 ms | 3/5 |
| Interpreter, 50 validated requests | 89.855 ms | 96.800 ms | 2/5 |
| Parser, 50 validated requests | 533.197 ms | 536.713 ms | 3/5 |
| Interpreter, 100 typechecks | 100.100 ms | 98.835 ms | 3/5 |
| Parser, 100 typechecks | 116.861 ms | 125.825 ms | 2/5 |

The median paired CPU reductions are 3.8% for interpreter loading and 5.1% for
parser loading. Marginal medians give different percentages and should not be
substituted for paired ratios. Suite CPU has a 2.5% median paired reduction but
only three wins; interpreter persistent requests and parser typechecks have
higher CPU medians. **A general throughput improvement is not qualified.**
The shared host load changed from about 10/13/20 to 14/15/19 on ten CPUs. The
initial wrappers-only cohort (`paired/`) had five suite wins and a modest 2.4%
median paired reduction; its source is separately frozen and is not presented
as the final candidate's qualification.

Suite collections fall from median 1889 to 1838, with median GC pause totals
837.4 versus 839.4 ms. Parser load collections fall from 284 to 269, with pause
totals 126.3 versus 112.5 ms. These measurements do not establish lower peak
memory or an exact allocation-byte reduction. The earlier allocation profiles
estimated roughly 30 GB allocated over the whole suite with collected objects
included, dominated by generated code and `future`; the wrapper-only generic
wrapper estimate fell from 330 MB to 231 MB. These are one diagnostic sample
per variant, with profiling overhead, rather than release allocation claims.

All 45 final processes pass. The application cells validate **1530 complete
requests** (30 processes times 51), and the 15 certification processes each
validate 154/0 totals. Raw first/persistent/typecheck results, GC events, CPU and
wall timings are retained. The original-release level isolates the upstream
refresh: it does not demonstrate a blanket speedup from PR117 on these shallow
consumer checks, and no such claim is made. The upstream fix is retained for
correct source currency and its targeted typechecker improvement.

The final matched control is `chez-matched-final/`: three alternating pairs per
workload, eighteen fresh processes. Both parser paths create their input list
inside each request; complete result validation is included in the persistent
batch clock on both ports. Thus these are validated requests, not a measurement
of only a machine-code function body. Earlier controls that prebuilt only the
Chez parser input are retained as superseded diagnostics.

| Validated stage | ShenScript CPU ms | Chez CPU ms | Median paired ratio |
| --- | ---: | ---: | ---: |
| interpreter / load | 655.644 | 56.131 | 11.76x |
| interpreter / persistent-50 | 81.894 | 0.277 | 291.02x |
| interpreter / typechecking-100 | 67.399 | 0.842 | 81.01x |
| cminus / load | 1408.867 | 119.939 | 11.75x |
| cminus / persistent-50 | 356.642 | 5.142 | 69.54x |
| cminus / typechecking-100 | 91.100 | 1.278 | 72.34x |
| suite / suite | 11726.064 | 668.674 | 17.61x |

The gap remains large. These fixtures support investigating synchronous versus
async execution boundaries next; they do not attribute the whole difference to
promises or establish this ratio for unrelated applications. Core startup is
separate from these stage clocks. Both references keep dynamic rebinding.

The equality fix is retained because it removes demonstrated exponential work
and makes the new upstream operation coverage finish, independent of noisy
aggregate timing. The wrapper extension removes measured generic-call overhead
without changing its fallback contracts. Neither fix is described as closing
the native-code gap.


## Qualification

- Node: 487 backend tests, 10 CLI tests, 10 frontend tests, 154/0 community
  certification tests, 123/0 extension checks and 29 upstream benchmark cases.
- Bun 1.4.3: all 507 port tests, the same 154/0 and 123/0 suites, 29 benchmark
  cases and the runtime smoke pass. A pre-existing test pinned V8's native
  non-function error text; the baseline control reproduces JSC's extra context.
  That assertion now accepts the two exact native forms; production errors are
  unchanged.
- ESLint passes, including the new benchmark worker. All three web bundles
  build, and the Yggdrasil standalone/linked/web checks pass. This is not an
  interactive-browser qualification. Deno was not available and remains open.
- The npm archive installs with production dependencies in a new `/tmp`
  directory. Version 43.1, late-list mismatch, five-argument calls and currying
  pass through the public frontend. Provenance ships in the archive. Packaging
  re-renders `lib/kernel.js`; its hash must match the measured artifact.
- Source/archive/manifest/artifact verification and final diff review are
  recorded with the raw evidence. Vendor whitespace in multiline KL strings is
  intentionally retained. This is primary-agent validation, not independent
  review. Earlier failed, bounded and superseded attempts remain in evidence.

## Reproduce and remaining work

```sh
npm ci --ignore-scripts
npm run vendor-kernel
npm run verify-kernel
npm run build-kernel
npm test
npm run lint
```

`vendor-kernel` checks both archives before replacing the vendor tree, preserves
port provenance, and regenerates both the full-tree and KL manifests. The
verifier preserves spaces in filenames. Upstream KL contains a few trailing
spaces in multiline strings; those bytes are retained rather than cleaned up.

The benchmark tools are under `benchmarks/performance/`. A fresh performance
comparison needs separately built immutable snapshots for the old and updated
kernel levels, with generated `lib/kernel.js` present in each; paths must not
refer to a sibling's mutable working files. Run serially with a new output:

```sh
python3 benchmarks/performance/run.py --original ORIGINAL_SNAPSHOT \
  --updated UPDATED_SNAPSHOT --output _build/new-cohort --samples 5
python3 benchmarks/performance/analyze.py _build/new-cohort
python3 benchmarks/performance/compare-chez.py --chez /path/to/shen-scheme \
  --output _build/new-chez-control
```

Per-process bounds are 120 seconds, cohort bounds 600/300 seconds, and the Node
cohort caps stdout at 4 MiB. Keep raw receipts and rejected attempts. Source and
artifact hashes must remain stable throughout each cohort. None of these results
are an independent review or a universal JavaScript-versus-Scheme claim.

The next high-leverage investigation is synchronous fast paths with guarded
async slow paths, targeted first at a measured symbolic application. That needs
explicit tests for rebinding, callback suspension, exception timing and stack
safety; globally declaring kernel calls synchronous is not justified. Further
primitive lowering and reader/compiler allocation are other measured candidates.
No promise-elimination compiler redesign or environment cache is implemented here.
