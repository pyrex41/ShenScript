# Provenance

These files are a Ratatoskr stage-1 output, generated fresh against Mark
Tarver's refreshed S42 kernel (2026-07-11 upload; canonical mirror
pyrex41/shen-s41.1 tag s42-pristine-20260711) with a built shen-cl,
from the Ratatoskr repo root on branch kernel/tarver-s41-refresh-20260711
(commit 8ae561a):

```
../shen-cl/bin/sbcl/shen eval -l ratatoskr.shen \
  -e "(ratatoskr.shake [\"tests/metaeval.shen\"] \"out\")"
```

The metaeval program: 548 kernel defuns (incl. the synthesised shen.initialise),
`needs-eval=true`, manifest `kernel-version=42`.
