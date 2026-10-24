# Adaptive continuation design (M3 proposal)

Status: bounded continuation implementation and compatibility controls pass;
paired application qualification and adoption are reported in aot-release.md.
The application profiles show large Promise costs, but a call graph alone does
not prove that results cannot be Promises: parameters and vector elements can
contain foreign JS values. Do not demote callers on that assumption.

The explicit alternative: keep public async ABI and mutable-cell behavior, but let
internal calls run synchronously until an executed await actually receives a
native Promise. Use the explicit `--adaptive` execution profile, separately
from sealed bindings. Internal scheduling may change: incidental microtask yields may disappear,
and bounded checkpoints can insert a yield;
actual asynchronous operations must still suspend. Programs relying on those
incidental yields for shared-state coordination must use ordinary output.
Public compiled async functions must retain Promise results, async metadata,
arity, currying, overapplication, errors and thenable behavior.

## Runtime protocol

An optional import-free runtime adapter owns a private WeakMap from actual
registered public function objects to `{worker, arity}`. Map only successfully
transformed named async definitions initially. Preserve ordinary sync functions
and unsupported async bodies. No assumptions about unknown callbacks/native code.

- A shared async identity function supplies the Promise boundary. It supplies exactly
  the old async function's Promise-return/adoption boundary.
- `aotReturn(value)` returns primitive values directly; objects/functions use
  `aotPromise(value)`. This is essential: opaque objects, foreign thenables,
  native/cross-realm Promises and internal Trampolines must keep the original
  async return protocol, including then getters. Do not probe `.then` manually.
- A private transformed worker catches synchronous prefix errors and returns a
  rejected Promise. Its first real suspension returns an async continuation
  containing the remaining original expression. Fast final returns call
  `aotReturn`; slow continuations use native async return directly.
- `aotFunction(worker, arity)` creates a plain dispatcher tagged `async:true` and
  wraps it with `$.l(dispatcher, arity)`. The dispatcher returns a worker Promise
  unchanged, otherwise calls `aotPromise` on its primitive result. This preserves
  the public Promise guarantee without adding a second Promise on slow paths.
  Do not set dispatcher `.arity`: preserve current generic-wrapper metadata
  behavior instead of incidentally changing partial-application quirks.
- `aotDefine(name, f)` calls ordinary `$.d`, then transfers any WeakMap entry
  onto the actual registered wrapper. This handles the current zero-arity
  rewrapping behavior. If registration fails, leave the prior entry untouched.
- `aotCall(receiver, f, ...args)` checks the captured function object and exact
  arity. A mapped exact call invokes the worker; everything else invokes the
  original function with `Reflect.apply(f, receiver, args)`. Capture `f` before
  argument effects/awaits. Rebinding or proxies therefore fall back correctly.
  Calls through immutable M2 workers can bypass this lookup.

Do not return opaque objects directly from an originally async private worker:
that loses Promise assimilation and can change values, not just scheduling.
Do not add a native async public wrapper around a worker Promise either: that
adds an adoption layer and can duplicate observable then getters. The dispatcher
must reuse the worker's native Promise.

## Compiler lowering

Inject the lowering function into backend options from the builder, avoiding
an unused compiler-pass import in ordinary runtime artifacts. Linked adaptive
artifacts must configure future eval compilation as well. Self-contained output
embeds only the runtime adapter, never the compiler.

Lower only originally async named function arrows first. Recognize compiler
MaybeAwait nodes structurally. For each, evaluate its settled RHS once. If the
result is a native Promise, return a native async continuation that awaits it
and executes the original remainder. Otherwise continue with the actual value.
A bare Await retains its unconditional native suspension.

Use a continuation builder with `fast` and `slow` modes. In slow mode rebuild
the original remainder with saved prefix values and original later awaits;
do not recursively split the remainder again. This avoids exponential copying
of slow continuations. Capture values evaluated before a later suspension in
fresh per-invocation temporaries. Preserve argument/callee evaluation order,
short-circuiting, assignment timing and closure capture.

Required expression cases: MaybeAwait/Await, conditional, sequence, binary and
short-circuit operators, unary, assignment to generated identifiers, calls,
members and arrays. Calls with suspending arguments must capture a method's
receiver and function before argument evaluation. `Reflect.apply` handles general
method receivers; known fixed compiler runtime intrinsics can retain direct
calls under the documented stable-intrinsic contract. Never read a dynamic
`.f` again after awaiting an argument.

Keep original declarations for w$/flattened lets. New temps use names that
cannot collide with escaped Shen identifiers. Stop at nested function boundaries.
Retain native async execution for unsupported statement shapes (including
new tail-loop bodies at first), unsafe targets or excessive code growth. Reject functions with more than 16 await sites, cap construction at 2,048
lowering steps, and cap output at four times input AST nodes plus 128.
An absolute 20,000-node limit also applies. The analysis sidecar records each
transformed function and fallback reason.
The current M4 pass handles synchronous bodies only. Async self-tail bodies
retain trampolines while benefiting from adaptive scalar-returning callees.

## Qualification requirements

Compare ordinary and adaptive output for all application results/effects and
actual async suspension. Add adversarial controls for early/delayed errors,
concurrent invocations, callee capture before argument rebinding/awaits,
short-circuiting, computed method receivers, closures/lets, partial/overapplication,
zero arity, native Promise overrides and foreign thenable getters (including
non-callable or changing getters). Compare getter counts and values where no
incidental-yield interleaving is involved. Demonstrate the intentional scheduling
difference separately. Test dynamic eval/redefinition in linked mode.

Measure adaptive alone, direct alone and combined profiles with fresh artifacts,
paired repeats, resource diagnostics and code-size budgets. No default scheduling
change, inferred binary64 storage or purity proof from Shen number/call graphs.

## Implemented limits and evidence

Native generators were tested first and rejected: despite reducing Promise
resources and passing semantic controls, they sharply regressed both engines.
Their source and reconstruction instructions are in
`benchmarks/experiments/aot-generators/`; no iterator driver is shipped.

The implemented pass emits plain branches and native async continuations.
Unsupported expressions retain native async execution, with the adaptive
profile scheduling checkpoints still applied. Direct eval,
compound assignments across awaits, sparse/spread arrays with awaits, optional
references, nullish operators and nonstandard parameter/declaration shapes
fall back. These limits preserve lexical scope and reference evaluation timing. It adapts named
functions only; anonymous callbacks remain ordinary functions. Static public
calls to names never transformed in the build avoid WeakMap probes. Later
redefinitions still work through their public functions, and linked future eval
uses the adaptive backend when requested. Ordinary builds import no adapter.

Nineteen backend controls pass on Node and Bun, including effect order, receivers,
callee capture, actual incremental I/O, foreign thenables, public ABI and bounded
fallback. The entire ec16a9f kernel was independently rendered with this pass:
154 kernel, 123 extension and 29 benchmark checks pass on both engines. Source
and receipts are retained under `_build/performance/aot/20261024/`. Browser-safe
source and mode controls pass; real browser-engine execution and Deno adaptive
execution remain unqualified. Higher-order specialization is a later measured
step; do not infer callback purity or suspension properties from this pass.

## Stack and synchronous-boundary safeguards

Removing a fulfilled-Promise yield can turn previously safe head recursion into
native JS recursion. This affects fallback and anonymous callers too when they
call a transformed leaf. The adaptive profile inserts a caller-side checkpoint
before every general head call in an async compilation context. Every 64th
checkpoint awaits a shared fulfilled Promise. Inline primitives and existing
synchronous compilation contexts retain their original convention. Tail calls
still use the trampoline unless the separate synchronous M4 pass applies.

The checkpoint await occurs in the caller before the call, rather than in a
Promise wrapper around the callee result. This matters for foreign thenables
that the original call treated as data. It preserves callee-before-argument
order within the call and avoids extra result assimilation. Internal callback
start/microtask order can differ; use ordinary output for programs relying on
that ordering. The native public async Promise protocol remains in place.

Hybrid workers are used only where the original caller has a maybe-await
boundary. A saved synchronous closure retains its original behavior after its
callee is redefined asynchronously. Checkpoint sites count toward the pass's
16-await budget and its instrumented-input AST growth limit.

Retained red/green controls cover 20,000-level head recursion in transformed,
fallback and anonymous owners, forced-checkpoint thenable data, and synchronous
caller rebinding. Pre-checkpoint timings do not qualify the safeguarded version.
