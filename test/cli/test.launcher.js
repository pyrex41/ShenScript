// Port-authored test suite (NOT part of the canonical Shen kernel suite).
//
// Mirrors shen-go's cmd/shen/main_test.go: drives the real CLI launcher
// (`node bin/shen.js ...`) as a child process and asserts the launcher
// protocol shared with shen-cl and shen-go.
//
// Covered:
//   - eval -e EXPR prints the value
//   - eval -l FILE loads a file, then -e uses its definitions
//   - script FILE runs a script
//   - --version prints the version banner; bad args exit nonzero
//   - piped stdin EOF exits the REPL cleanly (no infinite "empty stream"
//     loop) — guarded with a timeout. This is the JS analogue of shen-go's
//     TestPipedStdinEOFExitsRepl; the fix lives in bin/shen.js (a JS-level
//     repl loop that breaks on stdin EOF) + lib/streams.node.js (NodeInStream
//     sets an `eof` flag), since the kernel shen.loop spins forever otherwise.
//   - -q quiet mode STILL writes pr output to a file. ShenScript (like
//     shen-cl and shen-go, unlike shen-lua/shen-rust) routes pr to file
//     streams regardless of *hush*. This is the ratatoskr stage-1 regression.
//   - adversarial input reports an error and exits nonzero without an
//     unhandled rejection / crash (no Node stack trace dump).
import { equal, ok } from 'node:assert';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const shenJs = path.join(repoRoot, 'bin', 'shen.js');
const node = process.execPath;

// Run the CLI to completion; returns { stdout, stderr, status }.
// A generous timeout guards against the stdin-EOF hang regressing.
const runCLI = (args, input) => {
  const res = spawnSync(node, [shenJs, ...args], {
    input: input ?? '',
    encoding: 'utf8',
    timeout: 60000,
    cwd: repoRoot
  });
  if (res.error && res.error.code === 'ETIMEDOUT') {
    throw new Error(`CLI did not exit within timeout for args ${JSON.stringify(args)}; partial stdout:\n${res.stdout}`);
  }
  return res;
};

const tmp = label => path.join(os.tmpdir(), `ss-launcher-${label}-${process.pid}-${Date.now()}`);

describe('CLI launcher (port-authored, mirrors shen-go main_test)', function () {
  // Each spawn boots the whole kernel, so allow real wall time.
  this.timeout(70000);

  describe('eval', () => {
    it('eval -e EXPR prints the value', () => {
      const out = execFileSync(node, [shenJs, 'eval', '-e', '(+ 1 2)'], { encoding: 'utf8', timeout: 60000 });
      ok(out.includes('3'), `expected 3 in output, got:\n${out}`);
    });

    it('eval -l FILE makes the file definitions available to -e', () => {
      const lib = tmp('lib.shen');
      fs.writeFileSync(lib, '(define double X -> (* 2 X))');
      try {
        const out = execFileSync(node, [shenJs, 'eval', '-l', lib, '-e', '(double 21)'], { encoding: 'utf8', timeout: 60000 });
        ok(out.includes('42'), `expected 42 in output, got:\n${out}`);
      } finally {
        fs.rmSync(lib, { force: true });
      }
    });
  });

  describe('script', () => {
    it('script FILE runs the script', () => {
      const scr = tmp('script.shen');
      fs.writeFileSync(scr, '(print (+ 10 20))');
      try {
        const out = execFileSync(node, [shenJs, 'script', scr], { encoding: 'utf8', timeout: 60000 });
        ok(out.includes('30'), `expected 30 in output, got:\n${out}`);
      } finally {
        fs.rmSync(scr, { force: true });
      }
    });
  });

  describe('--version and bad args', () => {
    it('--version prints the version banner and exits 0', () => {
      const res = runCLI(['--version']);
      equal(0, res.status);
      ok(res.stdout.includes('41.2'), `expected 41.2 in output, got:\n${res.stdout}`);
    });

    it('an unknown command exits nonzero with an invalid-argument message', () => {
      const res = runCLI(['no-such-command', 'x']);
      ok(res.status !== 0, `expected nonzero exit, got ${res.status}`);
      const combined = res.stdout + res.stderr;
      ok(combined.includes('Invalid argument'), `expected invalid-argument error, got:\n${combined}`);
    });
  });

  describe('piped stdin EOF', () => {
    it('exits cleanly after stdin EOF instead of looping on "empty stream"', () => {
      const res = runCLI(['repl'], '(version)\n');
      equal(0, res.status, `repl should exit 0 on stdin EOF; stderr:\n${res.stderr}`);
      ok(res.stdout.includes('41.2'), `expected version evaluated, got:\n${res.stdout}`);
      // The hallmark of the hang regression: a flood of "empty stream" errors.
      const emptyStreamHits = (res.stdout.match(/empty stream/g) || []).length;
      ok(emptyStreamHits === 0, `repl leaked "empty stream" errors on EOF (count=${emptyStreamHits})`);
    });

    it('exits cleanly on empty stdin (immediate EOF)', () => {
      const res = runCLI(['repl'], '');
      equal(0, res.status, `repl should exit 0 on empty stdin; stderr:\n${res.stderr}`);
      ok(!res.stdout.includes('empty stream'), `unexpected empty-stream loop:\n${res.stdout}`);
    });
  });

  describe('quiet mode (-q) still writes pr to files', () => {
    it('routes pr output to a file regardless of *hush* (ratatoskr stage-1 regression)', () => {
      const outFile = tmp('out.txt');
      const expr = `(let S (open "${outFile.replace(/\\/g, '\\\\')}" out) (do (pr "payload" S) (close S)))`;
      try {
        const res = runCLI(['eval', '-q', '-e', expr]);
        equal(0, res.status, `eval -q exited nonzero; stderr:\n${res.stderr}`);
        ok(fs.existsSync(outFile), 'expected the output file to be written');
        equal('payload', fs.readFileSync(outFile, 'utf8'));
      } finally {
        fs.rmSync(outFile, { force: true });
      }
    });
  });

  describe('adversarial input', () => {
    it('eval -e on an adversarial form exits nonzero with a clean error (no crash dump)', () => {
      const res = runCLI(['eval', '-e', '(overflow->str)']);
      ok(res.status !== 0, `expected nonzero exit, got ${res.status}`);
      const combined = res.stdout + res.stderr;
      ok(
        combined.includes('overflow->str'),
        `expected the catchable error to mention overflow->str, got:\n${combined}`);
      // A raw V8/Node stack trace dump (the uncaught-rejection failure mode)
      // would carry these frames. Refuse them.
      ok(!/\bat Object\.<anonymous>/.test(combined) && !combined.includes('UnhandledPromiseRejection'),
        `launcher leaked a host stack trace / unhandled rejection:\n${combined}`);
    });

    it('the REPL survives an adversarial session and keeps evaluating', () => {
      const session = [
        '(value never-bound-xyz)', // unbound global
        '(simple-error "boom")',   // explicit error
        '(if 42 1 2)',             // type error on if
        '(+ 1 2)',                 // valid form, must still work
        '(* 6 7)'                  // valid form, final answer
      ].join('\n') + '\n';
      const res = runCLI(['repl'], session);
      equal(0, res.status, `repl exited nonzero; stderr:\n${res.stderr}`);
      ok(res.stdout.includes('3'), `expected (+ 1 2) => 3 after errors, got:\n${res.stdout}`);
      ok(res.stdout.includes('42'), `expected (* 6 7) => 42 after errors, got:\n${res.stdout}`);
      ok(res.stdout.includes('boom'), `expected the simple-error message in transcript, got:\n${res.stdout}`);
      // No unhandled rejection / V8 dump.
      const combined = res.stdout + res.stderr;
      ok(!combined.includes('UnhandledPromiseRejection'), `repl leaked an unhandled rejection:\n${combined}`);
    });
  });
});
