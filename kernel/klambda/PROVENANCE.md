# Provenance

The runtime kernel is the unmodified community Shen 43.2 release,
`Shen-Language/shen-sources` tag `shen-43.2` (tag object `7b7563e5`, commit
`e6947f507ebc`). No port edits are made to KL.

- Asset: `ShenOSKernel-43.2.tar.gz`, from
  `https://github.com/Shen-Language/shen-sources/releases/download/shen-43.2/ShenOSKernel-43.2.tar.gz`.
- SHA-256: `23c71508f0de24785e1f127ea4fab440081904d81c463090bc642ee840417f32`.

Against 43.1 the only definition changes are `*version*`, empty-list guards in
`shen.by-hypothesis` and `shen.search-user-datatypes` (via the new helpers
`shen.by-hypothesis-h` and `shen.search-user-datatypes-h`), and renumbered
generated names. This port patches neither function.

`scripts/vendor.js` reproduces this tree and regenerates full-tree
`kernel/SHA256SUMS` and `kernel/klambda/SHA256SUMS`. The port-added provenance
and checksum manifests are the only local additions to the resulting tree.
The precompiled standard library and all 23 KL modules come from the same
unmodified release. Character streams use the public 43.1 API. The historical
Tarver/Common Lisp compiler remains in pre-42.2 history and is not restored.
