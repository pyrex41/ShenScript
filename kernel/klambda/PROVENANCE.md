# Provenance

The `kernel/` tree (including this directory) is vendored **byte-for-byte** from
the community **ShenOSKernel 42.2** release, the kernel that upstream
[shen-scheme 0.50](https://github.com/tizoc/shen-scheme/tree/v0.50) ships:

- Repository: [`Shen-Language/shen-sources`](https://github.com/Shen-Language/shen-sources)
- Tag: `shen-42.2`, commit `73507e069fe147aefb728d632c4ce40bc6a7b314`
  (2026-10-01)
- Release asset: `ShenOSKernel-42.2.tar.gz`
  (<https://github.com/Shen-Language/shen-sources/releases/download/shen-42.2/ShenOSKernel-42.2.tar.gz>)
- SHA-256: `1d02273003654d34ec020ae67cb214ecec410dee3350419ff807d82b652678d8`
  (the checksum pinned in shen-scheme 0.50's Makefile)
- `(version)` is `"42.2"`, set by `init.kl`'s `shen.initialise-environment`.

Every file under `kernel/` is identical to the corresponding file in that
archive, with exactly two additions: this `PROVENANCE.md` and `SHA256SUMS`
(checksums of every `klambda/*.kl`). This was verified by downloading the
archive, checking its SHA-256, extracting it and running a recursive `diff`
against `kernel/` (no differences). The `.kl` files are release build outputs
(not tracked in the git tag); `sources/*.shen` are byte-identical to
`sources/` at the tag. `scripts/vendor.js` (`npm run vendor-kernel`) repeats
the download, checksum and replacement.

## Lineage choice

Through August 2026 ShenScript vendored Mark Tarver's pristine **S42** kernel
(see History below). 42.1 and 42.2 are releases of the **community**
`shen-sources` line, which differs structurally from Tarver's kernel. Per
pyrex41/ShenScript#14 (umbrella pyrex41/bifrost#26, pyrex41/yggdrasil#32),
every port driven by Bifrost and Yggdrasil adopts **option (a): ShenOSKernel
42.2 wholesale**, so that cross-port agreement runs on the kernel shen-scheme
0.50 ships. This undoes the Tarver-lineage loader work:

- Every `.kl` module is a plain list of `(defun ...)` forms. All global state is
  set up by `init.kl`'s `(shen.initialise)`, which ShenScript calls once, after
  defining every module and installing its native overrides
  (`scripts/render.js`, `scripts/config.js`).
- The property store is `dict.kl`'s `shen.dict` again (`*property-vector*` is
  `(shen.dict 20000)`), and lambda forms live under the `shen.lambda-form`
  property (no `shen.*lambdatable*`). `lib/overrides.js` restores the native
  Map-backed `put` / `shen.dict*` layer ShenScript used on ShenOSKernel 41.x, and
  drops the S42-only `shen.set-lambda-form-entry` shim that wrote into
  `shen.*lambdatable*` (under 42.2 it would have written to a table nothing
  reads; the kernel's own definition is now used).
- The standard library is the release's precompiled `stlib.kl`, loaded after the
  kernel and initialised with `(stlib.initialise)` as `doc/port-upgrades.md`
  (41.1) requires. The from-source `scripts/render-stlib.js` generator is gone.

## Extensions

`extension-features.kl`, `extension-expand-dynamic.kl` and
`extension-launcher.kl` are booted (the launcher drives `bin/shen.js`).
`extension-programmable-pattern-matching.kl`, `extension-namespaces.kl` and
`extension-type-annotations.kl` are opt-in and not booted; their `.shen`
sources are exercised by `npm run test-kernel-extensions`
(`kernel/tests/extensions/`), which passes on 42.2 (the pattern-matching hooks
the Tarver kernel had removed are back).

## 42.1 / 42.2 port audit (`doc/port-upgrades.md`)

- **42.0 `update-lambda-table`:** ShenScript caches no callable forms; `fn`,
  partial and dynamic application go through the kernel's `shen.lambda-form`
  property, which `update-lambda-table` unputs for zero/unknown arity.
  `test/kernel/test.extensions.js` checks this.
- **42.1 source-form handlers:** ShenScript overrides `macroexpand` natively. The
  override now mirrors `shen.macroexpand-h` / `shen.source-macro-walk`: a
  subform whose head has a handler in `shen.*source-form-handlers*` is neither
  descended into nor passed to a macro. The reader (`read`, `lineread`,
  `read-from-string`, `shen.try-parse`, `shen.process-sexprs`) is not
  overridden, so the 42.1 parse-then-expand order and EOF-without-newline
  handling are the kernel's own; the extension suite's source-forms tests pass.
- **42.2 namespaces:** the bundled `extension-namespaces.kl` is the release's
  regenerated one.

## Verification

Run `node scripts/verify-kernel.js` to check every `.kl` file in this directory
against `SHA256SUMS`.

## History: Tarver S42 lineage (superseded)

Before 42.2, the kernel KLambda tracked **Mark Tarver's pristine S42**, mirror
commit `28825a211f5b2fb952510dab17267ca8eb9594a0`, tag `s42-pristine-20260825`
(canonical mirror `pyrex41/shen-upstream`, `KLambda/*.kl`; upstream
<https://www.shenlanguage.org/Download/S42.zip>), and before that Tarver's S41.2
refresh (tag `s41.2-pristine-20260711`). That lineage reused the community
version numbers but differed structurally: no `dict.kl` (a plain
`(vector 20000)` property store hashed via `shen.change-pointer-value` /
`shen.remove-pointer`), no `init.kl` / `shen.initialise` (initialisation as
load-order-dependent top-level forms in `declarations.kl` and ~160 `(declare
...)` forms in `types.kl`, which forced ShenScript to boot those modules after
its overrides), a `cl.*` `backend.kl`, `shen.*lambdatable*` instead of
`shen.lambda-form`, no custom-pattern hooks, and no precompiled `stlib.kl` (it
was generated from `Lib/StLib` sources by `scripts/render-stlib.js`). Before the
Tarver lineage, ShenScript vendored the community ShenOSKernel 41.2 release
(`ShenOSKernel-41.2.zip`, SHA-256
`49f1b85d02348d9b3ebc461570c5c56cc066270ab81e35d5257625fb9d17fe82`) plus a
shen-cl-generated `compiler.kl`, which 42.2 does not need.
