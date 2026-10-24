# Rejected generator continuation experiment

These are the original lowering/runtime adapters, before the bounded direct
continuation implementation. They are research material, not package runtime
modules. To reconstruct the experiment in an isolated checkout, replace
`lib/aot-adaptive.js` with `lowering.js` and `lib/aot-adaptive-runtime.js` with
`runtime.js`, retaining the adaptive backend/builder integration. For the newer
builder, append `export const pruneAdaptiveCalls = () => {};` to the copied
lowering module (the original experiment predates call pruning). The relative
AST import is intended for that destination.

Evidence: `_build/performance/aot/20261024/m3-{generated,frozen,pilot}`,
`m3-pilot-summary.json`, and `m3-generator-diagnostic.*`. Each pilot process
used the authenticated M0 application, 1,000 warmups and calibrated request
counts, with full output validation. Node/Bun interop controls and build-mode
controls passed. This was one pilot pair per app/engine, not acceptance evidence.

All eight persistent CPU comparisons regress: about 35–66% on Bun and 322–722%
on Node. The numerical Promise diagnostic falls from roughly 5.5 million to
0.69 million resources per 100 requests, illustrating why allocation reduction
alone does not justify adoption. Diagnostic runs are separate from speed trials.
The much slower pilot is sufficient to reject this implementation without ten
acceptance pairs. Original artifacts, source hashes, failed test receipts and
complete pilot output are preserved.
