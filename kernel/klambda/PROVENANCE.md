# Provenance

The kernel KLambda under this directory tracks **Mark Tarver's S41.2 refresh**,
re-uploaded on **2026-07-11**. Note that upstream reused the `41.2` version
number for a **restructured kernel** with different lineage from the community
ShenOSKernel-41.2 this checkout previously built against, so treat the string
"41.2" as ambiguous: here it means **S41.2 (2026-07-11 refresh)**.

## Canonical source

- Mirror repo: `pyrex41/shen-s41.1` (private), the designated canonical mirror
  of Tarver's uploads.
- Tag: `s41.2-pristine-20260711`
- Commit: `11fc51b`
- Path in the tag: `KLambda/*.kl`

The 15 kernel `.kl` files listed in `SHA256SUMS` (all except `stlib.kl` and the
`extension-*.kl`, see below) are **byte-identical** to `KLambda/*.kl` at that
tag. Verified by `git show <tag>:KLambda/<f>.kl | cmp -` against each file.

### Secondary source (the mirror's own upstream)

- URL: <https://www.shenlanguage.org/Download/S41.2.zip>
- Last-Modified: 2026-07-11
- Archive SHA-256: `51becbfd60fa8c93c3f8ae5b20b948eaa84c4b1d14ad2f5d2a056002a53ee836`

The archive expands to a different tree layout than the community release
(`KLambda/`, `Sources/`, `Lib/`, `Primitives/`, `Test Programs/`), which is why
`scripts/vendor.js` — written for the community `ShenOSKernel-<v>.zip` GitHub
release — cannot re-vendor this lineage as-is (see the note in that file).

## What the refresh changed vs community ShenOSKernel-41.2

Kernel module set (15 files): `backend core declarations load macros prolog
reader sequent sys t-star toplevel track types writer yacc`.

- **New:** `backend.kl` — a `cl.*` KLambda->Common-Lisp backend. Irrelevant to
  the JS runtime but part of upstream's boot list; it defines only `cl.*`
  functions (no top-level forms) so it is harmless to render and include.
- **Removed:** `compiler.kl` (a shen-cl CL artifact, never in the ShenOS
  release), `dict.kl` (the dict layer is gone; `*property-vector*` is now a
  plain `(vector 20000)` and `put`/`get`/`unput` hash into it via the pointer
  functions `shen.change-pointer-value` / `shen.remove-pointer` in `sys.kl`),
  and `init.kl` (`shen.initialise` no longer exists; environment setup is now
  top-level forms in `declarations.kl`, and type signatures are established by
  ~160 top-level `(declare ...)` forms in `types.kl`).
- `hush` / `input+` and all 16 `dict.kl` functions are gone; `shen.hush`,
  `shen.input-h+` / `shen.process-input+`, `shen.initialise-lambda-tables`
  (lambda **table**, replacing the lambda-**form** machinery), pointer
  functions and others are new.

## ShenScript-specific vendored files (NOT from the upstream kernel)

These are carried by ShenScript and are **not** part of Tarver's refresh.
`stlib.kl` is generated (see below); the `extension-*.kl` are listed in
`SHA256SUMS` but are not byte-identical to any upstream S41.2 file:

- **`stlib.kl`** — **generated, not vendored** (and gitignored). It is built from
  the Shen standard-library **sources** under `kernel/lib/stlib/` by
  `scripts/render-stlib.js` (`npm run render-stlib`, run first by
  `npm run build-kernel`). Those sources are vendored from the canonical mirror
  `pyrex41/shen-upstream`, tag `s41.2-pristine-20260711`, `Lib/StLib` — Tarver's
  refresh externalises the standard library to these sources (loaded and
  type-checked at install time via `install.shen`) and ships no precompiled
  `stlib.kl`. The generator renders a stlib-less kernel, boots it (so the native
  synchronous `@p` / `shen.pvar?` the type engine needs are installed before any
  source is type-checked), runs `install.shen` through the kernel's own `load`
  while intercepting `eval-kl` to capture the compiled `defun`s, then appends
  `update-lambda-table` calls registering each exported function's arity and
  lambda-table entry. That registration is what the **retired** community
  precompiled `stlib.kl` (348 pure defuns) omitted, which is why it left
  `(arity filter)` = -1 and `(fn filter)` undefined; the from-source build fixes
  that. `stlib.kl` is therefore no longer in `SHA256SUMS` (it is generated, and
  its gensym numbering is not stable across generations).
- **`extension-features.kl`, `extension-expand-dynamic.kl`,
  `extension-launcher.kl`** — community extensions ShenScript boots (the
  launcher drives the CLI and Yggdrasil stage-1). They were compiled against the
  pre-refresh lambda-form API; `lib/overrides.js` provides a
  `shen.set-lambda-form-entry` compatibility shim that writes into the refresh's
  `shen.*lambdatable*` so they keep working.
- **`extension-programmable-pattern-matching.kl`** — opt-in, not booted. It is
  **inert on this lineage**: the refresh removed the `shen.custom-pattern-compiler`
  / `shen.custom-pattern-reducer` hooks from the pattern compiler (nothing in the
  kernel reads `shen.*custom-pattern-compiler*` anymore), so custom patterns fall
  through to their default rule. `test/kernel/test.extensions.js` detects the
  missing hook and skips rather than fails.

## Boot order

ShenScript renders all modules into one image and evaluates their top-level
forms in order, so it needs both define-before-use and its native overrides
installed before any top-level form that depends on them. See the extended note
in `scripts/config.js`: kernel defun modules boot first, then `overrides($)`,
then `declarations` (init forms) and `types` (declares), then the extensions and
`stlib`.

## Verification

Run `node scripts/verify-kernel.js` to check every `.kl` file in this directory
against `SHA256SUMS`.
