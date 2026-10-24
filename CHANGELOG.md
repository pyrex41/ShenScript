# Fork changelog

## 1.1.0-rc.1 — local release candidate

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
This candidate has not been published to a registry or tagged as a release.
