# Shen 43.1 / Chez-guided performance investigation

Base: a4619e2, user's pyrex41/ShenScript fork. Isolated worktree and feature
branch; preserve original checkout, existing evidence and sibling work.

1. Authenticate upstream PR117 and latest 43.1 source state. Retain the old
   generated kernel/source identity; vendor an unmodified matching kernel with
   a pinned archive checksum and regenerated provenance/verification manifest.
2. Build and qualify the new kernel before port optimization. Separate the
   upstream kernel improvement from any ShenScript implementation improvement.
3. Profile actual symbolic application loading, typechecking and execution.
   Record startup/build separately, CPU/wall/heap/GC, full results, host load,
   exact source/runtime hashes and profiler overhead. Compare a matched Chez
   control where its semantics and kernel identity are verified.
4. Choose one measured runtime/compiler bottleneck. Preserve dynamic rebinding,
   async streams, currying/overapplication, exceptions and stack safety. Test
   adversarial behavior and reject an optimization that changes the contract.
5. Run serial paired fresh-process samples with persistent requests, complete
   outputs and source/artifact checks. Run full tests/lint, web build, packaging
   and available alternative-runtime checks. Report costs and remaining gates.

No upstream/public writes or dependency upgrades are authorized by this plan.

Completed kernel currency, profiling, two runtime fixes, paired measurements and
qualification. See [results and remaining gates](docs/performance-43.1.md).
The equality complexity defect is fixed; broad throughput improvement and the
large Chez gap remain unqualified. No upstream/public write was performed.
