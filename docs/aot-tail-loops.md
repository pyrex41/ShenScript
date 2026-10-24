# Synchronous self-tail loops

`--sealed --tail-loops` lowers exact self-tail calls in eligible synchronous
functions to a `while` loop. Arguments are evaluated once, left to right, into
temporaries before parameters change. Selected bindings are immutable through
the sealed API. Other tail calls retain the original trampoline path.

Functions with closures, traps, nested definitions or async bodies stay on the
original path. This first pass avoids reusing a captured invocation binding and
does not remove async scheduling boundaries. It does not turn head recursion or
mutual recursion into native JS recursion. `--no-direct` can separate this pass
from the exact-head-call worker optimization.

Six controls pass on Node and Bun, covering 100,001 iterations without a bounce,
argument swaps and effects, flattened lets, zero arity, partial/overapplication,
errors, mutual-tail fallback, lexical shadowing, dynamic duplicate bindings and
escaping closure values. Build-mode integration covers self-contained, linked
and browser-safe output on both hosts.

Evidence: `_build/performance/aot/20261024/m4-*`. The separate three-pair pilot
compares sealing-only to sealing plus loops, with 1,000 warmups and complete
application validation. Median paired CPU reductions for rules/lists/numerical
are 3.16/0.98/0.18% on Node and 4.30/5.91/−0.45% on Bun. These are exploratory,
not ten-pair independent acceptance. The numerical application loop itself is
async and is deliberately unchanged; most lowered sites are kernel helpers.
Combined-profile results and remaining adoption gates are reported separately.

`trace-tail.js` independently instruments the original bounce constructor in
fresh runtime environments and validates every result. Across ten requests,
rules drop from 9,080 to 6,740 bounces (25.8%), lists from 27,630 to 22,870
(17.2%), and numerical remains 31,650. Each bounce constructs a Trampoline;
this demonstrates fewer allocations of that class, not total allocated bytes.
No instrumentation runs concurrently with speed measurements.
