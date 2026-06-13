#!/usr/bin/env node
import { createShen } from '../lib/shen.node.js';
import { stdStreamOptions } from '../lib/streams.node.js';

// runLauncher drives the kernel launcher extension
// (kernel/klambda/extension-launcher.kl) so the CLI speaks the standard Shen
// launcher protocol shared with shen-cl and shen-go: `shen repl`,
// `shen script FILE ARGS...`, and `shen eval [-e EXPR] [-l FILE] [-q]
// [-s KEY VALUE] [-r]`, plus --help and --version.
//
// It re-implements shen.x.launcher.default-handle-result in JS (rather than
// calling shen.x.launcher.main directly) for two reasons, both mirroring
// shen-go's cmd/shen/main.go:
//   1. A launch-repl result must run a JS-level loop that exits on stdin EOF,
//      instead of the kernel's shen.repl, which spins forever on closed stdin.
//   2. error / unknown-arguments results must exit nonzero (the kernel's
//      handler only prints to stdout and returns normally).
(async () => {
  const options = stdStreamOptions();
  const stinput = options.stinput;
  let shen;
  try {
    shen = await createShen(options);
  } catch (e) {
    console.error(e);
    process.exit(1);
    return;
  }

  const { caller, nameOf, s, toList } = shen;
  const isCons = shen.isCons;
  const asString = shen.asString;

  // The Shen-level top-level loop, re-driven from JS so it can exit cleanly
  // when stdin reaches EOF. Mirrors shen.repl/shen.loop (toplevel.kl), but
  // breaks out of the loop once the stdin stream reports EOF instead of
  // tail-calling itself forever.
  const repl = async () => {
    await caller('shen.credits')();
    for (;;) {
      await caller('shen.initialise_environment')();
      await caller('shen.prompt')();
      stinput.eof = false;
      try {
        await caller('shen.read-evaluate-print')();
      } catch (e) {
        const message = e && typeof e.message === 'string' ? e.message : String(e);
        // EOF on a closed stdin surfaces as the kernel's "empty stream" error.
        // Anything else is a genuine user error: print it and keep looping.
        if (!(stinput.eof && message === 'error: empty stream')) {
          await caller('shen.toplevel-display-exception')(e);
        }
      }
      if (stinput.eof) {
        return;
      }
    }
  };

  // Build the launcher argv: [prog, ...cliArgs].
  const argv = toList(['shen', ...process.argv.slice(2)]);

  let result;
  try {
    result = await caller('shen.x.launcher.launch-shen')(argv);
  } catch (e) {
    // An uncaught Shen exception (e.g. -l on a missing file) becomes the
    // launcher protocol's own (error Msg) result.
    const message = e && typeof e.message === 'string' ? e.message : String(e);
    result = [s`error`, message];
  }

  if (!isCons(result) && !(Array.isArray(result) && result.length > 0)) {
    console.error('ERROR: unexpected launcher result');
    process.exit(1);
    return;
  }

  const head = isCons(result) ? result.head : result[0];
  const rest = isCons(result) ? result.tail : result.slice(1);
  const restHead = isCons(rest) ? rest.head : (Array.isArray(rest) ? rest[0] : null);
  const restTail = isCons(rest) ? rest.tail : (Array.isArray(rest) ? rest.slice(1) : null);
  const restRestHead = isCons(restTail) ? restTail.head : (Array.isArray(restTail) ? restTail[0] : null);

  const stdout = options.stoutput;
  const print = line => stdout.writeString(line + '\n');

  switch (head) {
    case s`success`:
      if (restHead !== null && restHead !== undefined) {
        print(asString(restHead));
      }
      break;
    case s`launch-repl`:
      await repl();
      break;
    case s`show-help`:
      print(asString(restHead));
      break;
    case s`error`:
      process.stderr.write('ERROR: ' + asString(restHead) + '\n');
      process.exit(1);
      return;
    case s`unknown-arguments`: {
      // result = (unknown-arguments prog bad ...)
      const prog = asString(restHead);
      const bad = asString(restRestHead);
      process.stderr.write(`ERROR: Invalid argument: ${bad}\nTry \`${prog} --help' for more information.\n`);
      process.exit(1);
      return;
    }
    default:
      process.stderr.write('ERROR: unexpected launcher result: ' + nameOf(head) + '\n');
      process.exit(1);
      return;
  }
})();
