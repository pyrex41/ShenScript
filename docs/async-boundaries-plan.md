# Compiler async boundary investigation

Base: d0f25f6; the macro-walker experiment remains disabled. Work in an isolated
worktree. Preserve earlier baselines/evidence, sibling work and master.

1. Trace classification, conditional awaits, trampolines and generated functions.
2. Build diagnostic AST instrumentation that counts function invocations, actual
   executed await sites and return kinds. Instrument both pre-rendered kernel
   functions and dynamically compiled application definitions. Attribute by
   phase; separate bootstrap/source load/persistent requests/typechecking.
3. Validate instrumentation against sync/async, errors, closures, rebinding and
   suspension controls; compare complete real application and kernel outputs.
   Intrusive profiler timings are never speed or allocation claims.
4. Rank async calls that execute no await, distinguish value/Trampoline/Promise
   returns, inspect concrete generated code and choose the narrowest justified
   next experiment. Do not infer sync safety from current callee implementations.
5. Run appropriate tests and source/artifact audits. Keep a concrete report and
   reproducible diagnostic tools; no default compiler change without evidence.
   No push, upstream write or master rewrite.
