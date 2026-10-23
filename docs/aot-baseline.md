# Authenticated AOT application baseline

M0 implements the first slice of the [AOT plan](aot-performance-plan.md).
This establishes executable artifact measurements, not a compiler speedup.
The production compiler/runtime behavior is unchanged. The stage-2 builder gains
an optional `--module` output API, and its packaged dependencies are corrected.

## Source and artifacts

The source baseline is ShenScript `572841d`. Generation reads the stage-1
exporter directly from Git commit `0aa8947e22f54a83cda091d37782c923084c6d66`,
and copies the sixteen-module universe from ShenScript's authenticated community
43.1/ec16a9f kernel. Every copied KL module is verified against its checksum;
all source/adapter hashes are retained in `inputs.json`. The original S42
fixtures remain compatibility tests and are not relabeled as current 43.1.

The stock bootstrap and export writer emit unreadable KL for embedded quotes.
This was reproduced with both Node and the existing Chez host. A private,
tested serializer adapter in the generation process lowers unsafe string
constants to `cn`/`n->string` expressions. Vendored kernel and exporter files
remain unchanged. Parser validation includes a quoted-string rule, so that
prerequisite is exercised rather than avoided. Failed attempts are retained.

Four workloads run from freshly generated module artifacts. The C-minus parser
is the unchanged upstream test application plus a request wrapper. Routing,
inventory reconciliation and heat diffusion are representative examples, not
external production workloads. Expected outputs are independently specified:
complete ASTs, ordered query answers including duplicates/empty answers, every
inventory line/shortage/total, and the entire numerical field with boundary,
range and finite checks. Ordinary source execution passes the same oracles on
Node and Bun. The details are in [the benchmark guide](../benchmarks/aot/README.md).

The parser stays linked: the exporter's conservative treatment of data symbols
retains `declare` and evaluation machinery. Its manifest says `needs-eval=true`.
The other three artifacts are self-contained. No manifest flags were overridden
to claim otherwise. Linked dependencies are copied into a private immutable
snapshot and module imports rewritten to that snapshot before measurements.

## Measurement

Receipts are under `_build/performance/aot/20261024/` in the release worktree.
`frozen-baseline/snapshot.json` authenticates artifacts and linked code.
`baseline-warm/` has forty serial fresh processes: five samples for each of
four applications on each of Node 22.23.3 and Bun 1.4.3. Every request is checked.
Import, first request, warmup and persistent execution are separately clocked;
generation is outside those execution measurements. READY uptime and total
parent process wall are retained. All source/artifact hash checks pass.

Pilot batches target roughly 1–5 seconds. A 10/100/1,000 warmup study showed
substantial tiering effects for the parser, especially on Bun. The accepted
baseline uses 1,000 warmup requests; initial ten-warmup cohorts are preserved as
preliminary. This is a fixed policy for subsequent comparisons, not a claim
that arbitrary workloads have reached every engine's final optimization tier.

| Engine | Application | Requests / process | Median persistent CPU µs / request | Median persistent wall µs / request |
|---|---|---:|---:|---:|
| Node | Parser | 859 | 1,750.03 | 1,758.67 |
| Node | Routing rules | 16,228 | 141.11 | 135.09 |
| Node | Inventory lists | 8,497 | 250.15 | 251.29 |
| Node | Heat diffusion | 1,163 | 1,338.04 | 1,343.36 |
| Bun | Parser | 358 | 3,316.98 | 2,971.64 |
| Bun | Routing rules | 4,260 | 331.68 | 207.08 |
| Bun | Inventory lists | 4,188 | 423.42 | 307.85 |
| Bun | Heat diffusion | 1,369 | 1,716.71 | 1,439.21 |

These are separate engine baselines, not a universal engine ranking. The arm64
macOS host is shared; load averages were approximately 6.9–7.2 at cohort
boundaries. CPU includes runtime worker threads and may exceed wall time.
Bun does not expose GC events through this API: its GC counters are unavailable,
not zero. Heap delta is not allocated bytes and boundary RSS is not peak RSS.
Busy-host results remain exploratory; candidate gains require paired repeats.

## First optimization decision

Separate Node CPU sampling and Promise-resource diagnostics run the same frozen
artifacts with complete result checks. Their clocks are not speed samples.
Initial profiles identify generated `aot.heat-step`, vector access, `future`,
`settle`, GC and wrapper machinery as important numerical costs. Rules also
spend substantial samples in Prolog allocation and wrappers. List execution
includes material complete-result validation cost, which must not be mistaken
for compiler overhead.

The next slice is M1: scope-aware call facts and an explicit enforceable binding
contract. Compare direct-call workers and synchronous/continuation handling
independently against this baseline before combining them. Keep unknown calls
and dynamic behavior on their ordinary paths. No sealed mode is implemented or
qualified by M0, and prior full-runtime continuation results do not qualify it.

## Functional and package checks

The source changes pass 553 port tests, 154 community kernel tests, 123 extension
tests and 29 benchmark coverage checks on Node and Bun. Nine new serializer
controls cover quotes, character-code text, multiline/backslash/Unicode strings,
normal forms and rejection of unsupported values. Yggdrasil mode tests cover
self-contained and linked module output, completed initialization, caller results
and saved callers observing rebinding.

Packaging previously omitted `scripts/parser.js`/`scripts/config.js`, while the
stage-2 CLI imports them; `parsimmon` was development-only. Those files are now
included and the existing locked parser version is a production dependency.
Fresh packed-install qualification builds and executes an AOT module through
the installed CLI and checks the normal Shen launcher. Runtime dependency
versions and the tarball SHA-256 are retained. No registry publication occurs.

M1–M6 and release preparation remain active. Interactive browser performance,
Deno execution, sealed contracts, new call optimizations and release adoption
are not qualified by these baseline results.
