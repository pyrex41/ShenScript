# Provenance

These files are a Ratatoskr (formerly Yggdrasil) stage-1 output, generated
fresh against ShenOSKernel-41.2 with a built shen-cl, from the Ratatoskr
repo root:

```
../shen-cl/bin/sbcl/shen eval -q -l ratatoskr.shen \
  -e "(ratatoskr.shake [\"tests/fib.shen\"] \"out\")"
```

The fib demo program, eval-stripped: 102 kernel forms,
`needs-eval=false`.
