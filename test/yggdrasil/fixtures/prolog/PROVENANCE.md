# Provenance

These files are a Ratatoskr (formerly Yggdrasil) stage-1 output, generated
fresh against ShenOSKernel-41.2 with a built shen-cl, from the Ratatoskr
repo root:

```
../shen-cl/bin/sbcl/shen eval -q -l ratatoskr.shen \
  -e "(ratatoskr.shake [\"tests/prolog.shen\"] \"out\")"
```

The program (`tests/prolog.shen`) drags the kernel's CPS Prolog engine
into the footprint (112 kernel forms, `needs-eval=false`), exercising
`shen.bind!`, pvars and freeze/thaw - the parts of the kernel most
sensitive to the compiler's sync-call detection.
