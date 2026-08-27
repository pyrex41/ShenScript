export default {
  kernelVersion: '42',
  kernelPath:    'kernel',
  testsPath:     'kernel/tests',
  klPath:        'kernel/klambda',
  klExt:         '.kl',
  // Kernel modules for the Shen 42.0 pristine kernel, split into two boot phases around the
  // point where ShenScript's native overrides are installed (scripts/render.js).
  //
  // Upstream boot order (Sources/make.shen) is: yacc core load prolog reader
  // sequent sys t-star toplevel track types writer backend declarations, then
  // macros. shen-cl re-bootstraps on top of a live image, so every function
  // already exists and that order only fixes the final definitions. ShenScript
  // renders all modules into one image and evaluates their top-level forms in
  // order from scratch, so it needs both define-before-use AND its overrides
  // active before any top-level form that depends on them runs.
  //
  // Two refresh-specific facts force the split:
  //  * types.kl now carries 161 top-level (declare ...) forms that run the prolog
  //    type-inference engine at boot (in 41.1 these were set later by init.kl's
  //    shen.initialise-signedfuncs). declare calls shen.prolog-vector (macros.kl)
  //    and reads globals set by declarations.kl (shen.*prolog-memory*, shen.*sigf*).
  //  * that engine calls shen.pvar? / @p, whose compiled kernel forms are async
  //    (trap-error); callers invoke them without awaiting and only work once
  //    overrides.js has replaced them with synchronous native versions.
  // So declarations' init forms and types' declares must run AFTER overrides,
  // exactly as 41.1's shen.initialise did. klFiles is booted before overrides;
  // klFilesPostOverride after. The refresh dropped compiler.kl (shen-cl CL
  // artifact), dict.kl (dict layer replaced by the vector-based property store +
  // shen.change-pointer-value / shen.remove-pointer in sys.kl) and init.kl;
  // backend.kl (cl.* CommonLisp backend) is new. extensions and the precompiled
  // stlib.kl are ShenScript/community additions, not part of the upstream kernel
  // (see kernel/klambda/PROVENANCE.md); they are pure defuns and are booted after
  // overrides for parity with the 41.1 ordering.
  klFiles: [
    'yacc',
    'core',
    'load',
    'prolog',
    'reader',
    'sequent',
    'sys',
    't-star',
    'toplevel',
    'track',
    'writer',
    'backend',
    'macros'
  ],
  klFilesPostOverride: [
    'declarations',
    'types',
    'extension-features',
    'extension-expand-dynamic',
    'extension-launcher',
    'stlib'
  ]
};
