# Parse-failure continuation experiment

Base: 1ee2440; isolated worktree work/parse-failure-continuation. No push,
upstream write or master changes. Preserve baseline and all prior evidence.

1. Render and freeze the unchanged source/artifact baseline.
2. Prototype only the exact shen.parse-failure? equality/fail body. Preserve live
   lookup, single evaluation/settlement, async metadata and rejected errors.
   Return values directly on the fast path; suspend only for native Promises.
3. Verify baseline/candidate semantics: sync/async rebinding, delayed rejection,
   thenables, throws, trap-error, currying, overapplication and trampolines.
   State JS scheduling/return-type differences explicitly; no general compiler
   correctness claim from a name-and-shape-gated experiment.
4. Measure fresh serial paired real interpreter/parser/suite processes. Retain
   complete validation, stage separation, GC/resource counts, hashes and host
   contention. Use two reversed five-pair cohorts; busy-host results exploratory.
5. Run full Node and Bun qualification appropriate to a compiler prototype.
   Keep the patch explicitly opt-in unless end-to-end evidence and semantic
   review justify defaults. Restore production source/artifact before delivery
   if the candidate is not qualified; retain patch, tools, tests and report.

Completed: frozen baseline, guarded prototype, fourteen controls on both
variants/runtimes, full candidate suites, two guarded five-pair cohorts,
separate Promise diagnostics, restored defaults and source/artifact audits.
The parser signal is positive on the busy host. Default enablement remains
open because JS return-type and microtask scheduling compatibility changes;
controlled-host measurements and general continuation lowering remain future work.
