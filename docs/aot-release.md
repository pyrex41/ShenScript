# ShenScript 1.1.0-rc.1 candidate

Prerelease with explicit AOT performance profiles. Source
correctness and paired application checks pass on the recorded runtimes.
Release CI and archive status are recorded on the GitHub release. Quiet-host
replication and browser/Deno adaptive qualification remain separate gates.

## Source and contracts

The fork retains the authenticated community 43.1/ec16a9f kernel including
PR 117 and the 9693dc6 benchmark additions. The stage-1 exporter is pinned to
`0aa8947e22f54a83cda091d37782c923084c6d66`. Its private KL serializer adapter and
source authentication are described in [the baseline report](aot-baseline.md).
Vendored sources, original/sibling worktrees, baseline snapshots and failed
receipts are preserved.

Ordinary dynamic output remains the default:

| Option | Contract |
|---|---|
| `--module` | Export the initialized environment and late-bound caller API |
| `--analyze` | Emit binding/call facts without changing output code |
| `--sealed` | Enforce selected binding immutability; use exact head workers |
| `--no-direct` | Retain sealing while disabling head workers for ablation |
| `--tail-loops` | Lower eligible synchronous self-tail recursion; requires sealing |
| `--adaptive` | Conditional suspension plus bounded internal scheduling checkpoints |

Read [sealed bindings](aot-sealed.md), [direct workers](aot-direct-results.md),
[tail loops](aot-tail-loops.md) and [adaptive execution](aot-adaptive-design.md).
Sealing requires a manifest declaration of `needs-eval=false`; supported APIs
reject selected binding changes. Arbitrary JS reflection or mutation of runtime
intrinsics is outside that contract.

Adaptive builds preserve public async Promise/arity/error conventions and actual
async suspension. Internal callback-start and microtask order can differ.
Every 64th general head-call checkpoint yields in its caller, including fallback
and anonymous owners. This retains stack safety when former Promise yields
become synchronous. Existing synchronous callers retain public boundaries after
async rebinding. Unsupported bodies retain native async execution with checkpoints.

## Explicit measured application profiles

| Application | Build flags |
|---|---|
| C-minus parsing | `--module --linked --adaptive` |
| Routing rules | `--module --sealed --tail-loops` |
| Inventory lists | `--module --sealed --tail-loops` |
| Numerical heat diffusion | `--module --sealed --adaptive --tail-loops` |

These are deliberate build choices, not runtime workload detection. Parser
reachability requires eval and stays linked. The other modules are
self-contained. Routing, inventory and heat diffusion are representative bounded
applications; C-minus is the unchanged upstream test source plus a wrapper.
Complete ASTs, ordered query answers, inventory results and numerical fields
are checked on every request. Results do not establish every application's best
flags, interactive CLI speed, or a universal engine ranking.

## Final paired results

Evidence root: `_build/performance/aot/20261024/` in the isolated
`work/aot-performance-release` worktree. Accepted cohorts are
`checkpoint-confirm-1` and `checkpoint-confirm-2`, summarized in
`checkpoint-summary.json`. Source checkout aggregate data is
`docs/aot-results-1.1.0-rc.1.json`.

Two independently started, reversed five-pair cohorts contain 160 successful
fresh processes. Timings are serial, with 1,000 warmups and identical request
counts for each pair. Parser counts are doubled and numerical counts tripled
from M0 calibration to retain useful execution-stage lengths after optimization;
`release-counts.json` records them. Every request validates its complete result.
Source, artifact and dependency hashes pass before/after each cohort. Generation
and diagnostic hooks are outside speed trials. Processes are bounded at
120 seconds, cohorts at 15 minutes and individual child output at 8 MiB.

Engines are Node 22.23.3 and Bun 1.4.3 on shared arm64 macOS. These are medians
of paired persistent reductions, including validation:

| Application | Node CPU reduction | CPU wins | Bun CPU reduction | CPU wins |
|---|---:|---:|---:|---:|
| Parser | 29.82% | 10/10 | 42.35% | 10/10 |
| Rules | 2.96% | 8/10 | 14.87% | 10/10 |
| Lists | 5.06% | 10/10 | 7.87% | 10/10 |
| Numerical | 53.19% | 10/10 | 61.00% | 10/10 |

Paired wall reductions for parser/rules/lists/numerical are
30.34/3.55/5.25/54.13% on Node and 47.84/11.67/6.28/61.20% on Bun.
Boundary load averages range from 2.74 to 4.59. Shared-host results remain
exploratory. Node rules have a small effect relative to observed variation;
quiet-host confirmation remains open rather than establishing a universal win.

Final control snapshot index SHA-256:
`858650bf09e1840a972ef37afaf89e5b811a2aee01be2734bb8d9e499552e550`.
Final selected snapshot index SHA-256:
`4574389878fc54deb84b7ba0a79ea16be1420e6bc31a90ae8bc9b63a094b5ea1`.
The `checkpoint-v2-*-frozen` indices authenticate stage-1 inputs, code and linked
libraries. Every copied library matches the measured compiler/runtime source.
`generation.json` records actual flags; `select-profiles.js` checks shared
inputs and artifact identities when assembling the selected set.

## Startup, size and resources

Persistent wins have import/code costs. Median import CPU in milliseconds:

| Application | Node control → selected | Bun control → selected |
|---|---:|---:|
| Parser | 18.18 → 26.12 | 17.80 → 21.47 |
| Rules | 4.42 → 4.89 | 9.53 → 10.07 |
| Lists | 3.82 → 4.18 | 8.55 → 9.06 |
| Numerical | 3.83 → 5.26 | 8.74 → 9.87 |

First-request Node CPU improves 17.4% for numerical and 2.3% for rules, is flat
for lists, and regresses 2.9% for parser. Bun improves 2.7% for numerical and
6.8% for lists, while parser/rules regress 5.4/2.2%. All phases and parent process
wall time are retained separately. Compilation-plus-validation receipts do not
constitute an isolated compiler-speed study.

| Application module | Control bytes | Selected bytes | Control gzip-9 | Selected gzip-9 |
|---|---:|---:|---:|---:|
| Parser (linked dependencies excluded) | 560,695 | 1,099,236 | 72,173 | 96,625 |
| Rules | 105,768 | 121,945 | 21,919 | 24,595 |
| Lists | 77,967 | 88,879 | 18,136 | 20,295 |
| Numerical | 79,393 | 150,786 | 18,346 | 25,334 |

Separate Node diagnostics observe 5,864,403 → 1,687,052 Promise resources per
100 parser requests (71.23% fewer), and 5,501,003 → 899,610 for numerical
(83.65% fewer). Rule/list Promise counts remain unchanged. Final independent
bounce diagnostics observe 9,080 → 6,740 rule and 27,630 → 22,870 list
Trampoline constructions per ten requests, with numerical unchanged at 31,650.
These count specific classes, not total allocated bytes.

Median Node persistent GC counts for parser/rules/lists/numerical are
1,474 → 698.5, 2,547 → 1,792, 910.5 → 871 and 2,855 → 1,974; summed event
durations are 116.4 → 53.8, 98.6 → 75.6, 83.6 → 78.2 and 157.2 → 87.5 ms.
Bun GC telemetry is unavailable, not zero.

Boundary median Node RSS in MiB is 119.1 → 136.6 for parser, 83.8 → 98.8 for
rules, 80.9 → 80.6 for lists and 83.0 → 82.7 for numerical. Bun medians are
73.5 → 76.7, 61.7 → 60.3, 41.8 → 42.0 and 34.6 → 38.2 respectively.
Parser/rule RSS growth is a material tradeoff. Boundary RSS is not peak RSS,
heap delta is not allocated bytes, and the cause of RSS growth is not established.

## Compatibility and package gate

Local Node 20.20.2, 22.23.3, 24.22.1 and Bun 1.4.3 pass 601 port tests, including
19 adaptive controls. The full kernel is separately rendered through adaptive
compilation: 154 kernel, 123 extension and 29 benchmark checks pass on all four
runtimes. Self-contained, linked and browser-safe source modes, real suspension,
thenables, rebinding and linked future eval pass. Real browser-engine execution
and Deno adaptive execution remain unqualified. Remote Linux CI runs on the release commit; its status is recorded in the
GitHub release notes.

The package validator creates a canonical temporary consumer outside the
checkout and clears NODE_PATH, preventing workspace dependency fallback. It
checks shipped library bytes, ordinary CLI execution, all four stage-2 profiles,
all four authenticated applications and the actual installed 154/123/29 suites.
Run both locked-dependency reproduction and ordinary fresh-install compatibility:

```sh
node test/yggdrasil/test.package.js _build/release-locked AUTHENTICATED_SNAPSHOT
node test/yggdrasil/test.package.js _build/release-fresh AUTHENTICATED_SNAPSHOT --fresh-dependencies
```

Each successful gate records the tarball SHA-256, actual dependency versions,
installation location and complete output. Benchmark dependencies are astring
1.8.3/parsimmon 1.18.1; fresh-install compatibility is separate from performance
qualification. The final archive receipts use `release-package-final-{locked,fresh}`
under the evidence root. No registry publication, upstream write or master
rewrite is part of this preparation.

All three default webpack bundles build. The current minified bundle is
853,072 bytes, or 115,295 with deterministic gzip-9; webpack emits its size
advisory. This validates builds, not browser performance.

## Rejected experiments and remaining work

- The generator adapter is rejected despite fewer Promise resources: all eight
  pilot CPU comparisons regress. Its source and reconstruction instructions
  are in `benchmarks/experiments/aot-generators/`.
- `qualified-*` and `release-*` pre-checkpoint measurements are historical
  experiments. Deep 20,000-level recursion exposed the missing stack break,
  including fallback/anonymous owners. They do not qualify current code. The
  retained failing controls now pass with checkpoints.
- Direct eval, compound awaited assignments and sparse awaited arrays have
  retained red/green controls and conservative fallback. Saved synchronous
  callers retain their prior behavior after async rebinding.
- Broad adaptive rules are excluded after regressing Node in pilots. Sampling
  identified substantial Prolog-vector allocation and wrapper creation.
  Callback specialization, checkpoint-cost reduction and Prolog storage changes
  need separate semantic/application evidence. M5 is deferred.
- Quiet-host replication, actual browser/Deno adaptive qualification and remote
  CI remain open. Ordinary output keeps its existing dynamic convention.

## Complete certification suite timing

A fresh check at code commit `62db70a` ran the complete 154-test community suite
in twelve serial processes: three per engine/profile, alternating run order.
All processes passed 154/154 with zero failures. Median wall times exclude
kernel initialization:

| Full-kernel profile | Node 22.23.3 | Bun 1.4.3 |
|---|---:|---:|
| Ordinary/default | 5.818 s | 7.332 s |
| Adaptive | 7.651 s | 8.409 s |

Median ordinary process wall times including startup were 6.052/8.230 s.
Ordinary suite CPU medians were 11.501/14.003 s; adaptive medians were
17.492/16.426 s. Process CPU includes worker threads and can exceed wall time.
Host load changed from 9.44/6.11/4.29 to 10.20/7.70/5.15, so these are
exploratory status measurements. Full adaptive execution is slower here; the
AOT application improvements above must not be applied to the whole suite.
Raw receipts: `_build/performance/aot/suite-times-1792845501331832000/`.
The release attaches the portable timing summary separately from the package.
