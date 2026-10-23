# Provenance

The runtime kernel is the unmodified community Shen 43.1 build at upstream
`ec16a9fa4fc2e87e2aa336fb1ae30e8ac2266394`, the merge of
[PR 117](https://github.com/Shen-Language/shen-sources/pull/117). Upstream still
reports `"43.1"`. This includes the fixes after the original `shen-43.1` tag
(`715824a52b55e9c81a9501df8548ff3edd8411f5`). No port edits are made to KL.

- Build artifact repository: `pyrex41/shen-sources`, tag `upstream-ec16a9f`.
- Asset: `ShenOSKernel-43.1-ec16a9f.tar.gz`.
- SHA-256: `060066a8f84d9a2f7d41cb3b37b986a8d4653279752b739b5063cd648d9baacd`.

The latest upstream 43.1 commit verified for this update is
`9693dc68b7e1c9c32a91be9233530e8de521172e`. Its only changes after `ec16a9f`
are benchmark expansion, coverage tests and related documentation. Those nine
files are copied unchanged from the authenticated upstream source archive:

- Source archive: `https://codeload.github.com/Shen-Language/shen-sources/tar.gz/9693dc68b7e1c9c32a91be9233530e8de521172e`.
- SHA-256: `f2c2e608559fc4ee8f3195dabc830aba8db7a5227e4cbce02a346aec607e6d7f`.
- Runtime sources/KLambda are unchanged between these two commits; this is a
  source snapshot including the newest benchmarks, not a new upstream release.

`scripts/vendor.js` reproduces this combination and regenerates full-tree
`kernel/SHA256SUMS` and `kernel/klambda/SHA256SUMS`. The port-added provenance
and checksum manifests are the only local additions to the resulting tree.
The precompiled standard library and all 23 KL modules come from the same
unmodified build. Character streams use the public 43.1 API. The historical
Tarver/Common Lisp compiler remains in pre-42.2 history and is not restored.
