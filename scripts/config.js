export default {
  kernelVersion: '43.1',
  kernelPath:    'kernel',
  testsPath:     'kernel/tests',
  klPath:        'kernel/klambda',
  klExt:         '.kl',
  // Modules of the community ShenOSKernel 43.1 release (Shen-Language/shen-sources,
  // commit 9693dc6, including PR117), booted in this order by scripts/render.js. Every module is a
  // plain list of (defun ...) forms with no top-level side effects, so the order
  // only decides which definition wins when two modules define the same name.
  // All global state (the shen.dict-based *property-vector*, arities, lambda
  // forms, type signatures, *version*, ...) is set up afterwards by
  // init.kl's (shen.initialise), which render.js calls AFTER installing
  // ShenScript's native overrides (lib/overrides.js), so initialisation runs
  // through the native @p / shen.pvar? / put / shen.dict* the type engine and
  // property store need. The precompiled standard library (stlib.kl) is
  // initialised by (stlib.initialise) right after (doc/port-upgrades.md, 41.1).
  //
  // The extension-*.kl files come from the same release. features,
  // expand-dynamic and launcher are booted (the launcher drives bin/shen.js);
  // programmable-pattern-matching, namespaces and type-annotations are opt-in
  // and are not booted (see kernel/klambda/PROVENANCE.md).
  klFiles: [
    'toplevel',
    'core',
    'sys',
    'dict',
    'sequent',
    'yacc',
    'reader',
    'prolog',
    'track',
    'load',
    'writer',
    'macros',
    'declarations',
    'types',
    't-star',
    'init',
    'extension-features',
    'extension-expand-dynamic',
    'extension-launcher',
    'stlib'
  ],
  // Forms evaluated after the overrides are installed, in order.
  initForms: [
    'shen.initialise',
    'stlib.initialise'
  ]
};
