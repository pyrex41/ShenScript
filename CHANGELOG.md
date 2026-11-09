# Fork changelog

## Unreleased

- Move the vendored kernel to the community ShenOSKernel 43.4 release (tag
  `shen-43.4`, commit `f34b307b490880eedcfe1f5e5d3cc24ca3d2602e`, archive sha256
  `15e7972e...a2756`), vendored unmodified by `scripts/vendor.js`; kernel and
  `stlib.kl` are regenerated together. `yggdrasil-build` accepts 43.1 through
  43.4 manifests.

## 1.1.0-rc.2 — prerelease

- Move the vendored kernel to the community ShenOSKernel 43.2 release (tag
  `shen-43.2`, commit `e6947f507ebc`, archive sha256 `23c71508...417f32`),
  vendored unmodified by `scripts/vendor.js`. `yggdrasil-build` accepts 43.1 and
  43.2 manifests. Historical performance records below and under `docs/` remain
  measurements of the 43.1/ec16a9f kernel, including the AOT application
  results attached to 1.1.0-rc.1; they were not re-measured on 43.2.

## 1.1.0-rc.1 — prerelease

- Authenticate Yggdrasil application artifacts against community ShenOSKernel
  43.1/ec16a9f, including PR 117, and retain complete result validation and
  separate startup/persistent measurements on Node and Bun.
- Add `--module` exports and correct the production package dependencies/files
  required by the stage-2 CLI.
- Add optional `--analyze` reports and `--sealed` binding guards. Selected
  exact-arity non-tail calls use private workers; `--no-direct` provides the
  sealing-only control.
- Add optional `--tail-loops` for synchronous, closure-free self-tail recursion.
- Add explicit `--adaptive` conditional continuations. Public async functions
  retain Promise/arity/error behavior; internal incidental microtask yields may
  disappear, and bounded checkpoints retain head-recursion stack safety.
  Actual asynchronous suspension is preserved. Unsupported JS-inline
  cases and oversized bodies retain their native async conventions.
- Retain the rejected generator experiment, independent pass measurements,
  mutation/interop controls, and full-kernel adaptive qualification.

Ordinary builds retain dynamic calling behavior. Consult
[the release report](docs/aot-release.md) before choosing an optimized profile.
Distribution uses the GitHub prerelease archive on the pyrex41 fork. npm
registry publication is separate.

The complete 154-test certification suite is distinct from the AOT application
benchmarks. Three fresh serial samples on the shared host measured ordinary
suite wall medians of 5.82 s on Node and 7.33 s on Bun; the full adaptive kernel
measured 7.65/8.41 s. This release makes no full-suite adaptive speedup claim.
