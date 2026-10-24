# ShenScript AOT performance plan

Status: M0–M4 implemented and selected application profiles measured in the
release worktree; M6 package gates produce the final local candidate. M5 specialization is
deferred after profiling, pending a separately
useful callback/storage experiment. See [the release report](aot-release.md)
and [the baseline report](aot-baseline.md) for evidence and limits.
Source inspected: `45be974e1f11b7bb0ac102a280a4cd63ac61ff8f`.
Primary target: complete applications emitted through Yggdrasil/Ratatoskr,
with the fastest practical JavaScript execution consistent with their declared
runtime contract. Full interactive-kernel loading is a secondary target.

## Starting position before this plan

ShenScript has the community 43.1/ec16a9f kernel including PR 117, fixed-arity
wrappers through ten arguments, and the failing-list-equality fix. The macro
walker was rejected for default use. The opt-in continuation prototype improves
persistent parsing in busy-host full-runtime trials, but changes raw JS return
types and microtask ordering. Those results do not qualify AOT applications.
See [the continuation report](performance-continuation.md).

`bin/yggdrasil-build.js` currently feeds retained KL through `lib/backend.js`.
Self-contained output embeds the runtime, platform streams and overrides;
`--web` exports the initialized environment; `--linked` supports compiler/eval
use. Calls still use the ordinary mutable cells, wrappers and settlement paths.
Tree shaking is reachability analysis, not a proof of immutable call targets.

The checked-in fib/prolog fixtures are authenticated S42 compatibility fixtures.
The test that substitutes 43.1 manifest fields checks manifest handling, not
43.1 kernel provenance. Keep those tests, but generate fresh 43.1 workloads for
performance qualification. A local stage-1 checkout exists at
`../yggdrasil-43.1-final`; its advertised version does not establish that its
kernel includes PR 117. Verify the actual bytes before using it.

## Milestones and order

| Milestone | Result | Dependency / decision |
|---|---|---|
| M0: authenticated AOT baseline | Real artifacts, complete correctness oracles, serial benchmark runner and profiles | First executable work; no compiler optimization |
| M1: analysis and build contract | Scope-aware call facts, eligibility report and explicit binding/scheduling policy | Establish which assumptions can be enforced |
| M2: direct exact-arity calls | Internal workers for eligible non-tail calls; ordinary wrappers at boundaries | First optimization candidate, measured independently |
| M3: synchronous call chains | Proven synchronous workers and conditional suspension at mixed boundaries | Compare alone and combined with M2 |
| M4: self-tail loops | Constant-stack self recursion without per-step Trampoline allocation | Requires binding and closure correctness |
| M5: higher-order specialization | Bounded specialization of measured known-callback hot paths | Only when remaining profiles justify it |
| M6: qualify and adopt | Reproducible gains, compatibility matrix, release documentation | Each optimization can be accepted or rejected separately |

M2 and M3 ordering may swap if M0 profiles show one overwhelmingly dominates.
Do not implement all passes before measuring the first one. Each milestone ends
with a source-bound report and a small reviewable commit; preserve rejected
experiments. No improvement percentage is promised in advance.

## M0: build the workload and measurement foundation

1. Refresh the ShenScript checkout/branch state without rewriting master or
   disturbing dirty worktrees. Record the baseline commit, lockfile and engines.
   Create a separate worktree and an immutable source/artifact baseline.
2. Authenticate stage 1: pin exporter commit, execution host, exact kernel bytes
   and shake options. Require the community ec16a9f kernel, not merely a 43.1
   version string. If the exporter needs an update, isolate that work and check
   reachability/init correctness before measuring stage 2.
3. Produce and retain fresh shakes, manifests, source inputs and generated JS.
   Compare outputs with the ordinary ShenScript execution and independent
   expected results/effects. Include load/init ordering and required primitives.
4. Build a persistent application harness around the emitted artifact, without
   importing the full compiler/kernel into `needs-eval=false` runs. Expose a
   defined entry API or generate an artifact driver; do not time source loading
   on one side and precompiled execution on the other.
5. Profile the actual artifacts, then choose the first pass by measured cost.

Initial workload matrix:

| Workload | Purpose | Complete validation |
|---|---|---|
| C-minus parser over a fixed program corpus | Symbolic allocation, parser calls and Promise boundaries | Entire ASTs and failure results |
| Rule/Prolog application over a fixed fact/query corpus | Higher-order calls, backtracking and tail transitions | Complete ordered answers, failures and effects |
| Substantial list-processing application | Map/filter/fold pipelines and callback dispatch | Entire transformed data plus effect/order checks |
| Iterative numerical application using ordinary numbers/vectors | Tight loops, arithmetic and vector access | Final state and numerical acceptance rule established before timing |
| Fib, exact-arity calls, tail loops, rebinding and async controls | Explain mechanism and catch regressions | Deterministic results; never substitute for application wins |

Prefer existing real sources. If list/numerical consumers are missing, select
and document bounded representative applications before choosing an optimizer
for them. Do not relabel a synthetic loop as application evidence. A workload
whose authenticated manifest needs eval remains a dynamic-control workload;
do not force it into the self-contained cohort by changing its manifest.

Record, separately:

- Stage-1 shake and stage-2 generation time, retained function count and output
  bytes (raw and compressed with a pinned tool/settings).
- Fresh-process import/bootstrap and first completed request.
- Warmup progression and persistent requests, including all validation work on
  both sides. Fix warmup/request counts in a pilot before comparative runs.
- Process CPU, wall, end-of-stage heap/RSS, GC counts/pauses and engine version.
  Heap delta is not allocated bytes; RSS at a boundary is not peak RSS.
- Separate allocation/Promise/Trampoline diagnostics and CPU profiles. Hooks are
  excluded from speed comparisons. Count wrapper/worker paths in diagnostics.

Start with Node and Bun, comparing each engine against its own baseline. Use
serial paired fresh processes, alternate order, and retain at least ten pairs
in two independently started, reversed cohorts. Scale request batches so the
primary execution stage is about 1–5 seconds in the pilot. Bound each process
at 120 seconds, each cohort at 15 minutes and each stdout/stderr artifact at
8 MiB; preserve failures before a bounded retry. Record host contention before
and after each cohort. Busy-host results are exploratory. Keep generation
outside execution trials and verify source/artifact hashes after the cohort.

Deliverables: proposed `benchmarks/aot/` fixtures, generation/measurement tools,
provenance and result schema; `_build/performance/aot/<run>/` receipts; a baseline
report ranking costs by workload. Existing full-runtime benchmarks remain
secondary regression controls, not the primary performance score.

## M1: analysis and explicit runtime contracts

Add an analysis module used by stage 2 before emission. Track lexical bindings,
definition/load order, arities, calls in head/tail positions, escaped functions,
unknown calls, possible suspension and recursive strongly connected components
(SCCs). Resolve primitive identities after overrides and initialization rules.
Unknown facts stay unknown. Emit an eligibility report with a reason for every
optimized or rejected call site. Test scope/shadowing, not just symbol names.

Treat these build profiles separately:

- **Compatible dynamic output:** keep current rebinding/eval/interop behavior.
  A fast path must preserve it through local proofs or validated guards and a
  correct fallback. An entry-only guard does not protect a mutable nested call.
- **Explicit sealed AOT output (proposed `--sealed`):** selected function targets
  and audited primitive contracts become immutable after a defined init point.
  `needs-eval=false` is necessary for the first implementation, not sufficient
  proof. Reject or leave dynamic any unresolved definition, mutation or escape.

Sealing must specify and enforce the mutation boundary. Account for Shen defun,
JS registration, exported environment/lookup cells and direct cell writes; do not
silently keep a writable cell while internal calls bypass it. Define which host
mutations are supported rather than implying protection against arbitrary JS
reflection. Keep an interoperable public wrapper/API with explicit result/error
behavior. Selectively seal eligible functions; leave other calls dynamic.

Do not reorder user top-level forms, overrides or initialization to make linking
easier. Calls during initialization must observe the original binding/effect
order. Unsupported init/redefinition patterns remain on the ordinary path.

Separately specify whether a proposed fast execution profile may remove incidental
microtask yields and return values where raw calls previously returned Promises.
The continuation experiment proves this is observable. Preserve actual async
suspension, errors and explicit async operations. Test JS callback/reentry order,
not just final Shen values. No silent default scheduling change.

Deliverable: documented profile contracts, eligibility diagnostics and scope/
call-graph tests. Implementing a proposed flag is later work, not a statement
that sealed output is already qualified.

## M2: direct exact-arity workers

First candidate: internal JS workers for eligible, known, exact-arity non-tail
calls, bypassing cell lookup and currying wrappers. Start with leaves and acyclic
known call chains. Public/dynamic/unknown calls retain current wrappers and
late-bound lookup. Preserve partial and overapplication, closure identity where
observable, native overrides and error behavior.

Do not replace cyclic tail edges with ordinary JS recursion: that would trade
allocation for stack overflow. Tail calls retain settlement/trampolines until
M4 handles an eligible case. Record baseline-versus-worker call counts to prove
which application paths changed. Compare M2 alone against the frozen baseline.

Likely files: `lib/backend.js`, a new analysis module, `bin/yggdrasil-build.js`,
focused backend/AOT tests and the artifact benchmark harness.

## M3: infer synchronous chains and handle mixed results

Implementation refinement: unknown JS values and callbacks prevent a general
no-Promise proof. The implemented explicit adaptive profile guards actual results
and emits bounded native continuations; public async ABI remains intact. It
does not claim purity/suspension inference from the call graph. The generator
alternative was measured and rejected. See [the adaptive contract](aot-adaptive-design.md).

Compute suspension facts to a fixed point over eligible call-graph SCCs. Seed
from audited primitive/host contracts; unknown callbacks, rebinding, eval and
incremental/async I/O prevent unconditional sync inference. Apply the facts to
internal workers, retaining the required public calling convention.

Begin with fully proven synchronous chains. Only then generalize value/Promise
continuations for mixed paths, preserving single evaluation, evaluation order,
lexical bindings, exception scopes, thenable behavior and actual suspension.
Use the existing parse-failure prototype as evidence/control material, not a
production special case keyed to a kernel function name.

Measure baseline, M2-only, M3-only and M2+M3 separately. An allocation reduction
without a practical application CPU/startup gain does not justify adopting the
more complex pass.

## M4: self-tail recursion to loops

Lower eligible self-tail calls to a loop with simultaneously updated arguments
and preserved left-to-right evaluation. Preserve per-call parameter/let capture:
closures must not accidentally capture loop variables reused by later iterations.
Handle binding stability and exits/errors explicitly. Start outside trap scopes
and captured-state patterns; fall back until those cases have a sound lowering.

Validate deep recursion beyond the native JS stack limit, argument dependencies,
side effects, escaping lambdas/freezes and exceptions. Require an application
profile showing trampoline cost, plus a demonstrated reduction in its transitions
and allocations. Leave mutual recursion/SCC dispatch for a separate measured
proposal rather than expanding this first loop pass.

## M5: measured specialization and runtime tuning

If profiles still justify it, specialize bounded map/fold-style workers for
known callbacks, including captured environments and partial applications.
Preserve order/effects and use an explicit code-size budget (initial proposal:
no more than four variants per source function, then fall back). Avoid an
unbounded inliner or speculative function explosion.

Re-profile before considering list/vector/dictionary representation changes,
numeric specialization or more runtime-source pruning. Do not infer binary64
storage from Shen number. Smaller artifacts, less allocation and faster
execution are separate outcomes. No C/Julia/offload backend is part of this plan.

## M6: adoption gates and stopping rules

For every candidate:

1. Compare complete application outputs/effects and enforce the declared build
   contract, including failures and raw JS interop. Exercise sync/async rebinding,
   traps, delayed rejection, thenables, currying/overapplication and stack safety
   wherever the pass can affect them. Add meaningful adversarial controls.
2. Run focused tests, full port/kernel/extension/benchmark suites, Yggdrasil's
   mode matrix and package smoke. For compiler/shared-runtime changes, qualify
   Node and Bun. Validate browser-safe emission; make browser speed claims only
   after testing the relevant browser engines. Deno stays unqualified until run.
3. Use fresh matched artifacts, serial paired application measurements and pass
   ablations. Require a repeatable win larger than observed noise on a primary
   application. Investigate any repeatable >3% CPU regression elsewhere, and
   report startup, memory and code-size tradeoffs. These are proposed engineering
   gates, not claims of statistical confidence from a win count alone.
4. Promote only the independently useful passes. Keep questionable cases on
   fallback paths. Do not enable sealed/scheduling semantics by default merely
   because their throughput is better. Record PASS, REJECTED or OPEN separately
   for correctness, profile compatibility and performance.

Stop or redesign a pass when repeated controlled measurements miss its target,
complexity exceeds the measured benefit, or its invariants cannot be enforced.
Do not add increasingly broad assumptions to rescue a rejected optimization.
Keep dynamic Shen useful and tested, but judge the AOT work by the emitted
applications the user intends to ship.

## First implementation slice

Implement M0 first: authenticated 43.1 shakes for parser and rule workloads, a
persistent artifact runner, complete expected outputs and one source-bound
Node/Bun baseline report. Include list/numeric selection and cost profiles in
that report before beginning M2 or M3. No new compiler fast path or sealed flag
belongs in this first slice. That gives the next optimization a concrete target
and a baseline that can falsify the performance hypothesis.
