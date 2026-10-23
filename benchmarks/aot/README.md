# AOT application benchmarks

These workloads execute emitted Yggdrasil/Ratatoskr artifacts. They are separate
from the full-kernel load benchmarks in `../performance/`.

- `parser`: upstream `kernel/tests/c-minus.shen`, unchanged, with an entry wrapper
  and a corpus containing declarations/assignments and quoted strings. Validate
  complete ASTs. The grammar's `/n` escape means CR, not LF.
- `rules`: a representative routing example, checking positive/negative queries
  and the entire ordered `findall` result, including duplicates and empty lists.
  Shen's collection order is reverse proof order, as its own suite specifies.
- `lists`: a representative inventory reconciliation example with valid/invalid
  receipts, higher-order filtering/mapping, complete shortages and totals.
- `numerical`: a representative fixed-boundary heat-diffusion example. Validate
  the complete 32-point field, finite/range/boundary invariants and an independent
  iterative JS oracle (absolute tolerance 1e-10 plus relative 1e-12).

The last three are documented representative examples, not claims about external
production applications. Fib remains a compatibility smoke test elsewhere.

## Generate and freeze

Run from a source checkout with dependencies and a generated `lib/kernel.js`.
Create the parent output directory first. Preserve every previous run.

```sh
mkdir -p _build/aot
node benchmarks/aot/generate.js ../yggdrasil-43.1-final _build/aot/generated
node benchmarks/aot/freeze.js _build/aot/generated _build/aot/baseline
node benchmarks/aot/validate-source.js
```

Generation reads the pinned exporter commit directly from Git, copies its
sixteen-module universe from this checkout's authenticated ec16a9f kernel and
records all input hashes. It installs a private KL serialization adapter in the
stage-1 process because the upstream bootstrap/writer emits unreadable embedded
quotes. Unsafe constants become `cn`/`n->string` expressions. The vendored kernel
and exporter source are not edited. `test.aot-kl.js` covers the serializer.
Generation validates every emitted application before accepting its receipt.
Use a 180-second parent/CI budget for generation; build/validation subprocesses
have their own 120-second limits and retain both output streams.

Current exporter reachability conservatively treats the parser's data symbol
`declare` as a callable kernel name. Its authenticated manifest therefore
requires eval: the parser is emitted as a linked module. Do not alter that flag
to claim a self-contained parser. Other workloads are self-contained. Freeze
copies linked dependencies and changes their module imports to the private
snapshot, preventing later compiler edits from changing the baseline.

## Measure

```sh
node benchmarks/aot/calibrate.js _build/aot/baseline _build/aot/calibration
node benchmarks/aot/warmup-study.js _build/aot/baseline _build/aot/calibration/counts.json _build/aot/warmup
node benchmarks/aot/measure.js _build/aot/baseline - _build/aot/baseline-run _build/aot/calibration/counts.json 5 1000
# After independently generating/freezing a candidate:
node benchmarks/aot/measure.js _build/aot/baseline _build/aot/candidate _build/aot/pairs-1 _build/aot/calibration/counts.json 5 1000
AOT_CANDIDATE_FIRST=1 node benchmarks/aot/measure.js _build/aot/baseline _build/aot/candidate _build/aot/pairs-2 _build/aot/calibration/counts.json 5 1000
node benchmarks/aot/diagnose.js _build/aot/baseline _build/aot/calibration/counts.json _build/aot/diagnostics
```

Calibrate request counts before comparisons and choose/fix warmup from the
progression study. `measure.js` defaults to 1,000 warmup requests; the explicit
last argument controls it. Batch counts target about 1–5 seconds of baseline
execution. Every request receives complete validation, included equally in
both variants. Import, first request, warmup and persistent stages are separate.
READY records worker uptime after import; the parent records whole-process wall.
Generation is not inside execution timing.

Timings are serial, paired in fresh processes with reversed variant/workload
order. Keep Node and Bun baselines separate. Records include engine/version,
CPU/wall, end-of-stage heap/RSS, GC and complete first results. Bun currently does
not expose GC events through this API: `gc_available=false` means unavailable,
not zero collections. Heap delta is not allocation and boundary RSS is not peak.
Each worker has a 120-second/8-MiB output limit and the cohort a 15-minute budget.
Hashes detect changes to frozen inputs, linked code, harness and dependencies.

Diagnostics separately sample Node persistent execution and count Promise
resources. Their clocks are not speed samples, and hook counts are not allocated
bytes. Busy-host results remain exploratory. Retain failed/partial receipts.
