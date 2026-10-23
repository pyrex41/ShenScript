# Promise-aware macro walking experiment

Base: 4ae9947, qualified 43.1/ec16+969 ShenScript fork. Work in an isolated
worktree and preserve earlier evidence, master and sibling changes.

1. Freeze current generated kernel and runtime/source identity as the baseline.
2. Keep the public macroexpand Promise boundary. Internally, walk synchronously
   until a macro returns a Promise after trampoline settlement; resume through
   an async loop without creating a retained Promise chain for each sibling.
3. Verify bottom-up order, fixpoint restart, identity, source-form shielding,
   mixed synchronous/async macros, rejection, mutation at suspension points,
   concurrent calls and long flat lists. Preserve the current handling of
   source lists and registry snapshots; do not change compiler-wide asyncness.
4. Measure serial fresh baseline/candidate pairs for actual application loading,
   validated persistent requests, typechecking and the complete kernel suite.
   Retain startup, complete output, CPU/wall, GC, heap/RSS and host contention.
   Run allocation diagnostics separately. Busy-host results are exploratory.
5. Run Node/Bun suites, lint, browser builds, Yggdrasil and packaged execution;
   audit sources/artifacts, retain a useful tested change or record rejection.
   No push, upstream write or master rewrite.

Completed: preserve the tested prototype as an explicit patch and keep the
qualified default walker unchanged. Two balanced cohorts do not qualify a speed
win. See [measurements and decision](performance-macro-walk.md).
