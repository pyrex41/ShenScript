[![Shen Version](https://img.shields.io/badge/shen-42.0-blue.svg)](https://github.com/Shen-Language)
[![Build Status](https://travis-ci.org/rkoeninger/ShenScript.svg?branch=master)](https://travis-ci.org/rkoeninger/ShenScript)
[![Docs Status](https://readthedocs.org/projects/shenscript/badge/?version=latest)](https://shenscript.readthedocs.io/en/latest/?badge=latest)
[![npm](https://img.shields.io/npm/v/shen-script.svg)](https://www.npmjs.com/package/shen-script)

# Shen for JavaScript

<img src="https://raw.githubusercontent.com/rkoeninger/ShenScript/master/assets/logo.png" align="right">

An implementation of the [Shen Language](http://www.shenlanguage.org) by [Mark Tarver](http://marktarver.com/) for JavaScript. Full documentation can be viewed at [shenscript.readthedocs.io](https://shenscript.readthedocs.io/en/latest/).

## Features

  * Allows integration with arbitrary I/O.
  * Async operations are transparent to written Shen code.
  * Easy interop: JS can be called from Shen, Shen can be called from JS.
  * Fairly small production webpack bundle (\~670KB minified, \~110KB gzip compressed).

## Prerequisites

Requires [Node.js](https://nodejs.org/en/download/) 20+. Also runs on [Bun](https://bun.sh) and [Deno](https://deno.com) 2 via their Node compatibility layers.

Works in most modern browers (Chromium, Firefox, Safari and Edge).

## Installing

**The published npm package [`shen-script`](https://www.npmjs.com/package/shen-script) (0.17.0, upstream) is library-only and stale**: it predates this fork, has no `bin` entry and ships no `bin/shen.js`, so `npm install -g shen-script` cannot produce a command-line Shen — and it carries an older kernel than the 41.2 vendored here.

For a working CLI, install from this repo:

```sh
git clone https://github.com/pyrex41/ShenScript && cd ShenScript
npm install          # installs deps; the prepare hook renders lib/kernel.js
node bin/shen.js --version
```

or as a git dependency (`npm install github:pyrex41/ShenScript`), which also triggers the kernel render and links the `shen-script` bin. The generated `lib/kernel.js` is not checked in; `npm run build-kernel` re-renders it explicitly, and runtime needs `node_modules` present (`bin/shen.js` imports `astring`).

## Building and Testing

First, run `npm install` as you would with any other Node project. Then run the following scripts build and test the project. The kernel KLambda is vendored under `kernel/` from Mark Tarver's **S41.2 refresh** (2026-07-11 re-upload; canonical mirror `pyrex41/shen-s41.1`, tag `s41.2-pristine-20260711`) — a restructured kernel that reuses the `41.2` version number but is a different lineage from the community shen-sources 41.2. See `kernel/klambda/PROVENANCE.md` for the full delta and the ShenScript-specific vendored files. The standard library is built from its Shen sources under `kernel/lib/stlib/` (Tarver's refresh ships no precompiled `stlib.kl`); run `npm run build-kernel` (which runs `render-stlib` then `render-kernel`) for the full build from a clean checkout — `npm install`'s `prepare` hook does this automatically when `lib/kernel.js` is missing. Steps after `render-kernel` won't work if the kernel hasn't been rendered.

| Script                   | Description                                                                                              |
|:-------------------------|:---------------------------------------------------------------------------------------------------------|
| `test-backend`           | Runs `mocha` tests for the basic environment and compiler.                                              |
| `verify-kernel`          | Checks the vendored kernel sources against `kernel/klambda/SHA256SUMS`.                                 |
| `vendor-kernel`          | Re-downloads the kernel release archive and refreshes `kernel/` (preserves `compiler.kl`, provenance).  |
| `render-stlib`           | Compiles the Shen standard library from source (`kernel/lib/stlib/`) to the generated `kernel/klambda/stlib.kl`. |
| `render-kernel`          | Translates the kernel sources to JavaScript at `lib/kernel.js`.                                         |
| `build-kernel`           | Runs `render-stlib` then `render-kernel` — the full build from a clean checkout.                        |
| `test-kernel`            | Runs the certification test suite that comes with the Shen kernel.                                      |
| `test-kernel-extensions` | Runs the kernel's extension test suite (programmable pattern matching).                                 |
| `test-frontend`          | Runs `mocha` tests for helper and interop functions.                                                    |
| `bundle-dev`    | Applies babel transforms and webpack's into web-deployable bundle.                                                |
| `bundle`        | Builds bundle in production mode.                                                                                 |
| `bundle-min`    | Builds minified production bundle.                                                                                |
| `bundles`       | Generates all bundles.                                                                                            |
| `lint`          | If you make changes, run `lint` to check adherence to style and code quality.                                     |

## Running

### Demo Page

Run `npm start` to start webpack watch or `npm run bundle-dev` to do a one-time build.

If you open `index.html` in your browser a basic webpage will load, and when ready, it will display the load time. (The production webpack bundle does not automatically create a Shen environment and does not log anything.) `index.html` should be viewable without hosting in a web server, but you will not be able to use the `load` function to load additional Shen code if opened from a relative `file://` path. `http-server` is adequate for hosting in a web server.

If you open the JavaScript console in the developer tools, it is possible to access to the `$` global object and execute commands:

```javascript
$.exec("(+ 1 1)").then(console.log);
```

Chaining the `then` call is necessary because `exec` will return a `Promise`. For more information refer to the [documentation](https://shenscript.readthedocs.io/en/latest/interop.html).

### REPL

Run `npm run repl` (or `node bin/shen.js repl`) to run a command-line REPL. It should have the same behavior as the `shen-cl` REPL. `node.` functions will be available. Run `(node.exit)` to exit the REPL.

The CLI passes its arguments to the kernel's `launcher` extension, so the standard launcher commands work: `node bin/shen.js repl`, `node bin/shen.js eval -e "(+ 1 1)"`, `node bin/shen.js script file.shen`, etc. The CLI also runs under `bun bin/shen.js` and `deno run -A bin/shen.js`.

### Yggdrasil (tree-shaken standalone programs)

ShenScript is a stage-2 target for [Yggdrasil](https://github.com/pyrex41/yggdrasil), the Shen tree-shaker. Given a stage-1 output directory (shaken `kernel.kl` + user `.kl` files + `yggdrasil.manifest.txt`):

```
node bin/yggdrasil-build.js <shaken-dir> <out.js> [--linked]
```

The default mode emits one self-contained ES module (~120KB for the fib demo, no dependencies) that runs on Node 20+, Bun and Deno. `--linked` emits a small artifact that imports from this checkout and is the only mode supporting `needs-eval=true` programs.

## Benchmarks

Measured 2026-06-12 on an Apple M4 (macOS 26.5.1) with Node v25.4.0, Bun 1.3.14, Deno 2.8.3, after the call-path optimizations that landed the same day (arity-specialized wrappers; plain async wrappers; maybe-await call sites, sync demotion and let flattening — see the git log). All three runtimes pass every suite.

**Test suites** (full eval-capable backend):

| Suite | Node | Deno | Bun |
|:--|--:|--:|--:|
| `test-kernel` (134 kernel certification tests) | ~10 s | ~9 s | ~19.5 s |
| `test-kernel-extensions` (8 tests) | 0.4 s | 0.5 s | 0.7 s |

Before those optimizations the kernel suite ran 19.0 s / 18.4 s / 50.1 s (Bun 1.3.6) on the same machine — roughly 2× faster on Node/Deno and 2.5× on Bun. For reference, shen-lua under LuaJIT runs the equivalent certification suite in ~6 s.

**Standalone Yggdrasil artifacts** (AOT-compiled, eval-stripped; median of repeated runs, including process spawn; LuaJIT column is Yggdrasil's shen-lua target on the same shaken input, for reference):

| Workload | Node | Deno | Bun | LuaJIT |
|:--|--:|--:|--:|--:|
| fib 20 (≈ pure startup + boot) | 112 ms | 56 ms | 50 ms | 27 ms |
| fib 32 (~2.1M recursive calls) | 161 ms | 110 ms | 113 ms | 89 ms |

The self-contained JS artifact is ~140 KB vs ~640 KB for the Lua one.

Two notes on the spread:

- Shen-level calls go through wrappers that support currying. These used to be variadic `(...args)` functions — a pattern JavaScriptCore pays for far more heavily than V8 — and async wrappers added a second promise layer per call. Wrappers are now arity-specialized plain functions, and compiled call sites only `await` when the callee actually returned a Promise (most kernel functions now compile to plain sync functions). That work is what produced the suite numbers above.
- The remaining Bun-vs-Node/Deno suite gap is engine-level: JSC's per-async-frame and promise-allocation throughput trails V8 on this workload (confirmed by Bun's own profiling in [oven-sh/bun#32208](https://github.com/oven-sh/bun/issues/32208), filed from this codebase). Bun's startup and sync-path performance are excellent — it's the fastest runtime here for the eval-stripped AOT artifacts.
## Optional Nix environment

Nix is optional; the normal ShenScript build and launcher commands continue to work
with tools installed by any method. For a pinned development toolchain:

```sh
nix develop
```

The flake also exports `packages.toolchain` for composition by
[Bifrost](https://github.com/pyrex41/bifrost):

```sh
nix shell .#toolchain
```

If direnv is installed, `direnv allow` opts this checkout into the same dev
shell automatically. Nothing activates until that explicit authorization, and
Nix is never required at runtime.
