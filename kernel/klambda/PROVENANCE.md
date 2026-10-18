# Provenance

The `kernel/` tree is vendored from the community ShenOSKernel 43.1 release
of `Shen-Language/shen-sources`:

- Repository: https://github.com/Shen-Language/shen-sources
- Tag: `shen-43.1`, commit `715824a52b55e9c81a9501df8548ff3edd8415f5`
- Release asset: `ShenOSKernel-43.1.tar.gz`
- Archive SHA-256: `900eedef44f440af78f9395ed06e689ce1604546fc309f5bc7c8bc84cc651920`
- `(version)` is `"43.1"`, set by `init.kl` during `shen.initialise`.

Every file under `kernel/` is identical to the release archive, with this
provenance file and `SHA256SUMS` added for local verification. The port follows
the 43.1 guide in `doc/port-upgrades.md`: character stream support is exposed
through public `char-stream?`, `read-unit-string`, and `write-string` names.

The archive contains 23 `klambda/*.kl` modules. The old ShenScript Tarver-line
backend and its generated Common Lisp compiler are historical port artifacts;
they were removed before this upgrade and remain available in the pre-42.2 git
history, not in the 43.1 vendor tree.
