// Count actual private-call traffic in disposable instrumented artifacts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
if (process.argv.length !== 4) throw new Error('Usage: trace-direct.js SEALED_SNAPSHOT NEW_OUTPUT_DIRECTORY');
const root = fileURLToPath(new URL('../../', import.meta.url)), input = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
fs.mkdirSync(out, { recursive: false });
const snapshot = JSON.parse(fs.readFileSync(path.join(input, 'snapshot.json'), 'utf8'));
for (const [file, hash] of Object.entries(snapshot)) if (createHash('sha256').update(fs.readFileSync(path.join(input, file))).digest('hex') !== hash) throw new Error('Input snapshot changed');
const workerSource = fs.readFileSync(new URL('./worker.js', import.meta.url), 'utf8')
  .replace("'./cases.js'", JSON.stringify(pathToFileURL(path.join(root, 'benchmarks/aot/cases.js')).href))
  .replace('const { request, check } = application($, name);', 'globalThis.AOT_DIRECT_COUNTS = Object.create(null);\nconst { request, check } = application($, name);')
  + "\nconsole.log('DIRECT_CALLS ' + JSON.stringify(globalThis.AOT_DIRECT_COUNTS));\n";
const worker = path.join(out, 'worker.mjs'); fs.writeFileSync(worker, workerSource);
const summary = {};
for (const name of ['rules', 'lists', 'numerical']) {
  const report = JSON.parse(fs.readFileSync(path.join(input, name + '.mjs.analysis.json'), 'utf8'));
  let sites = 0;
  const source = fs.readFileSync(path.join(input, name + '.mjs'), 'utf8').replace(/\b(aot\$w\d+) \? \1 :/g, (_match, id) => {
    sites++; const key = JSON.stringify(id);
    return `${id} ? (globalThis.AOT_DIRECT_COUNTS[${key}] = (globalThis.AOT_DIRECT_COUNTS[${key}] || 0) + 1, ${id}) :`;
  });
  if (sites !== report.emitted.headCalls || !sites) throw new Error('Unsupported direct-call emission');
  fs.writeFileSync(path.join(out, name + '.mjs'), 'globalThis.AOT_DIRECT_COUNTS = Object.create(null);\n' + source);
  const result = spawnSync('node', [worker, out, name, '10', '0'], { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 8388608,
    env: { ...process.env, AOT_PROMISES: '', AOT_CPU_PROFILE: '' } });
  fs.writeFileSync(path.join(out, name + '.stdout'), result.stdout || ''); fs.writeFileSync(path.join(out, name + '.stderr'), result.stderr || '');
  if (result.error || result.status !== 0 || !result.stdout.includes('PASS ')) throw result.error || new Error('Direct-call diagnostic failed');
  const counts = JSON.parse(result.stdout.trimEnd().split('\n').at(-1).slice('DIRECT_CALLS '.length));
  const names = report.functions.filter(f => f.eligible).map(f => f.name);
  summary[name] = { sites, requests: 11, calls: Object.entries(counts).map(([id, count]) => ({ function: names[Number(id.slice('aot$w'.length))], count })).sort((a, b) => b.count - a.count) };
}
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log('DIRECT_CALL_TRAFFIC PASS');
