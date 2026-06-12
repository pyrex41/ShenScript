[![Shen Version](https://img.shields.io/badge/shen-41.2-blue.svg)](https://github.com/Shen-Language)
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

## Building and Testing

First, run `npm install` as you would with any other Node project. Then run the following scripts build and test the project. The kernel sources ([shen-sources](https://github.com/Shen-Language/shen-sources.git) release 41.2) are vendored under `kernel/` - see `kernel/klambda/PROVENANCE.md`. Steps after `render-kernel` won't work if the kernel hasn't been rendered.

| Script                   | Description                                                                                              |
|:-------------------------|:---------------------------------------------------------------------------------------------------------|
| `test-backend`           | Runs `mocha` tests for the basic environment and compiler.                                              |
| `verify-kernel`          | Checks the vendored kernel sources against `kernel/klambda/SHA256SUMS`.                                 |
| `vendor-kernel`          | Re-downloads the kernel release archive and refreshes `kernel/` (preserves `compiler.kl`, provenance).  |
| `render-kernel`          | Translates the kernel sources to JavaScript at `lib/kernel.js`.                                         |
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

### Ratatoskr (tree-shaken standalone programs)

ShenScript is a stage-2 target for [Ratatoskr](https://github.com/pyrex41/ratatoskr) (formerly Yggdrasil 2.0), the Shen tree-shaker. Given a stage-1 output directory (shaken `kernel.kl` + user `.kl` files + `ratatoskr.manifest.txt`):

```
node bin/ratatoskr-build.js <shaken-dir> <out.js> [--linked]
```

The default mode emits one self-contained ES module (~120KB for the fib demo, no dependencies) that runs on Node 20+, Bun and Deno. `--linked` emits a small artifact that imports from this checkout and is the only mode supporting `needs-eval=true` programs.

## Benchmarks

Measured 2026-06-12 on an Apple M4 (macOS 26.5.1) with Node v25.4.0, Bun 1.3.6, Deno 2.8.3. All three runtimes pass every suite; the times below are wall-clock for a single run.

**Test suites** (full backend: KL compiled at runtime through the async compiler path):

| Suite | Node | Deno | Bun |
|:--|--:|--:|--:|
| `test-kernel` (134 kernel certification tests) | 19.0 s | 18.4 s | 50.1 s |
| `test-kernel-extensions` (8 tests) | 0.5 s | 0.8 s | 1.1 s |

**Standalone Ratatoskr artifacts** (AOT-compiled, eval-stripped; median of repeated runs, including process spawn):

| Workload | Node | Deno | Bun |
|:--|--:|--:|--:|
| fib 20 (≈ pure startup + boot) | 116 ms | 52 ms | 52 ms |
| fib 32 (~2.1M recursive calls) | 144 ms | 105 ms | 110 ms |

For reference against Ratatoskr's LuaJIT target: on these AOT artifacts LuaJIT runs 28 ms / 92 ms, so Bun and Deno are within ~15–25% on artifact compute (and the JS artifact is ~5× smaller, ~120 KB vs ~640 KB). The full kernel certification suite is a different story — shen-lua/LuaJIT runs it in ~6 s wall on the same machine vs 18–50 s here, because the suite exercises the async compiler path described below, an overhead the eval-stripped AOT artifacts don't pay.

Two notes on the spread:

- Shen-level calls used to go through a variadic `(...args)` wrapper (currying support) that JavaScriptCore pays for far more heavily than V8. `funSync`/`funAsync` now emit arity-specialized fixed-parameter wrappers for arities 0–4, which made AOT artifacts 2.2× faster on Node and 4.7× faster on Bun.
- The kernel suite is the opposite story: it exercises the full backend, where every call is an `async` function and gets awaited (so Shen code can transparently perform async I/O). V8's `await` is roughly 2× cheaper than JavaScriptCore's (an awaited recursive micro-benchmark runs 60 ms on Node, 86 ms on Deno, 136 ms on Bun), and that per-call overhead dominates a 134-test suite — hence Bun's slower suite time despite its fast startup and fast AOT-artifact numbers.
