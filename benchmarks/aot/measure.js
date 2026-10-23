// Serial baseline or balanced paired artifact execution, with bounded receipts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const [baseText, candidateText, outText, countsText, samplesText = '5', warmupText = '1000'] = process.argv.slice(2);
if (!countsText) throw new Error('Usage: measure.js BASELINE CANDIDATE_OR_- NEW_OUTPUT COUNTS_JSON [SAMPLES 1..10] [WARMUP 0..10000]');
const variants = { baseline: path.resolve(baseText), ...(candidateText === '-' ? {} : { candidate: path.resolve(candidateText) }) };
const out = path.resolve(outText), counts = JSON.parse(fs.readFileSync(countsText, 'utf8')), samples = Number(samplesText), warmup = Number(warmupText);
if (!Number.isSafeInteger(warmup) || warmup < 0 || warmup > 10000) throw new Error('Invalid warmup');
if (!Number.isSafeInteger(samples) || samples < 1 || samples > 10) throw new Error('Invalid samples');
fs.mkdirSync(out, { recursive: false });
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const hashes = {};
for (const [variant, directory] of Object.entries(variants)) {
  const snapshot = JSON.parse(fs.readFileSync(path.join(directory, 'snapshot.json'), 'utf8'));
  for (const [file, hash] of Object.entries(snapshot)) {
    if (sha(path.join(directory, file)) !== hash) throw new Error('Snapshot changed: ' + variant + '/' + file);
    hashes[path.join(directory, file)] = hash;
  }
}
for (const file of fs.readdirSync(new URL('./', import.meta.url)).filter(x => x.endsWith('.js'))) hashes[path.join(root, 'benchmarks/aot', file)] = sha(path.join(root, 'benchmarks/aot', file));
const dump = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n');
for (const file of ['package.json', 'package-lock.json', 'node_modules/astring/package.json', 'node_modules/astring/dist/astring.mjs', 'node_modules/astring/dist/astring.js']) {
  const absolute = path.join(root, file); if (fs.existsSync(absolute)) hashes[absolute] = sha(absolute);
}
dump('identity.json', hashes); dump('counts.json', counts);
const host = name => {
  const time = spawnSync('uptime', [], { encoding: 'utf8' }); fs.writeFileSync(path.join(out, name + '.txt'), time.stdout || time.stderr);
  const proc = spawnSync('ps', ['-axo', 'pid,pcpu,pmem,etime,comm'], { encoding: 'utf8' }); fs.writeFileSync(path.join(out, name + '-processes.txt'), proc.stdout || proc.stderr);
};
host('host-before');
const receipts = [], rows = [], results = new Map(), started = performance.now();
for (let sample = 0; sample < samples; sample++) {
  for (const engine of Object.keys(counts)) {
    const apps = sample % 2 ? Object.keys(counts[engine]).reverse() : Object.keys(counts[engine]);
    for (const app of apps) {
      const choices = (sample + Number(process.env.AOT_CANDIDATE_FIRST || 0)) % 2 ? Object.entries(variants).reverse() : Object.entries(variants);
      for (const [variant, directory] of choices) {
        if (performance.now() - started > 900000) throw new Error('Cohort exceeded 15 minutes');
        const count = counts[engine][app];
        if (!Number.isSafeInteger(count) || count < 1 || count > 1000000) throw new Error('Invalid request count');
        const prefix = path.join(out, `${engine}-${app}-${variant}-${sample}`), start = performance.now();
        const run = spawnSync(engine, [path.join(root, 'benchmarks/aot/worker.js'), directory, app, String(count), String(warmup)], {
          cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 8388608,
          env: { ...process.env, AOT_PROMISES: '', AOT_CPU_PROFILE: '' }
        });
        fs.writeFileSync(prefix + '.stdout', run.stdout || ''); fs.writeFileSync(prefix + '.stderr', run.stderr || '');
        const receipt = { sample, engine, app, variant, count, status: run.status, process_wall_ms: performance.now() - start, error: run.error?.message };
        receipts.push(receipt); dump('processes.json', receipts);
        const lines = (run.stdout || '').trimEnd().split('\n');
        if (run.error || run.status !== 0 || !lines.at(-1).startsWith('PASS ')) throw run.error || new Error('Artifact worker failed: ' + prefix);
        const worker = JSON.parse(lines.at(-1).slice(5));
        if (worker.name !== app || worker.requests !== count || worker.warmup !== warmup || worker.engine !== engine) throw new Error('Worker receipt mismatch');
        receipt.worker = worker; receipt.ready_uptime_ms = JSON.parse(lines.find(x => x.startsWith('READY ')).slice(6)).uptime_ms;
        dump('processes.json', receipts);
        const complete = lines.find(x => x.startsWith('RESULT '));
        if (!complete) throw new Error('Missing complete result');
        if (results.has(app) && results.get(app) !== complete) throw new Error('Complete results differ: ' + app);
        results.set(app, complete);
        const gc = JSON.parse(lines.find(x => x.startsWith('GC ')).slice(3));
        for (const line of lines.filter(x => x.startsWith('STAGE '))) {
          const stage = JSON.parse(line.slice(6)), events = gc.filter(x => x.start_ms >= stage.start_ms && x.start_ms < stage.end_ms);
          rows.push({ ...receipt, ...stage, gc_count: events.length, gc_ms: events.reduce((sum, x) => sum + x.duration_ms, 0) });
        }
        dump('rows.json', rows); console.log('AOT_MEASURED', engine, app, variant, sample);
      }
    }
  }
}
for (const [file, hash] of Object.entries(hashes)) if (sha(file) !== hash) throw new Error('Source/artifact changed: ' + file);
host('host-after'); fs.writeFileSync(path.join(out, 'PASS'), 'Complete outputs, all requests and source/artifact identities pass\n');
