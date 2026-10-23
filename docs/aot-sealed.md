# Optional sealed AOT bindings

Status: binding analysis/enforcement implemented; call optimizations are still
being qualified. Ordinary output retains the existing dynamic behavior.

```sh
node bin/yggdrasil-build.js SHAKE app.mjs --module --analyze
node bin/yggdrasil-build.js SHAKE app.mjs --module --sealed
```

`--analyze` emits `app.mjs.analysis.json` without changing the generated JS.
`--sealed` also installs binding guards and seals eligible functions as each
unique definition is registered. The manifest must declare `needs-eval=false`;
the builder checks that declaration, while source authentication is the
responsibility of the stage-1/provenance workflow. The authenticated parser
baseline currently requires eval and remains a linked dynamic control.

Analysis distinguishes call positions from literal data symbols and tracks
parameters, lets, lambdas/freezes, conditionals, traps, arities and tail positions.
It reports recursive components, unknown calls and eligibility reasons. It does
not infer pure functions or prove that arbitrary returned values cannot be
Promises. A long call chain is analyzed with iterative graph traversal.

Eligible bindings have one named definition, no known replacement definition,
no computed definition target that could replace them, distinct parameters and
no collision with a native/override binding. Duplicate or replaceable functions
stay dynamic. Escaping public wrappers keep their identity and calling behavior.
Native/override calls retain the compiler's existing behavior; no new native
synchrony assumption is made by this contract.

For selected functions, ordinary `defun`/registration, direct cell writes,
function-metadata changes and globals-map replacement/deletion/clear are
rejected. Data globals and unselected functions remain mutable. Guards are
installed before program definitions and do not reorder overrides, initialization
or user forms. This enforces an optimizer binding invariant through supported
APIs, not a security boundary against arbitrary JS reflection or mutation of
runtime intrinsics. For example, deliberate `Map.prototype` bypasses are outside
the contract.

Self-contained, linked and browser-safe module forms have integration controls
on Node and Bun, including initialization order, duplicate-definition fallback,
lexical shadowing and rejected selected-binding mutations. Analysis-only output
is checked byte-for-byte against ordinary output. Browser-engine performance
and Deno execution are not established by those tests.

At this milestone sealing itself does not remove wrappers, Promises or
trampolines and makes no speed claim. The next candidate uses these binding
facts for exact-arity internal calls while preserving the original function
bodies, async behavior and public wrappers.
