# Provenance

These files are a Ratatoskr (formerly Yggdrasil) stage-1 output, generated
fresh against ShenOSKernel-41.2 with a built shen-cl, from the Ratatoskr
repo root:

```
../shen-cl/bin/sbcl/shen eval -q -l ratatoskr.shen \
  -e "(ratatoskr.shake [\"tests/metaeval.shen\"] \"out\")"
```

The metaeval demo program, which genuinely requires runtime eval
(builds expressions as data and evaluates them): 568 kernel forms,
`needs-eval=true`.  Self-contained builds must refuse it; `--linked`
builds must run it.
