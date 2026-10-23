"""Serial source-bound baseline/candidate macro-walker comparisons."""
import argparse, hashlib, json, os, selectors, subprocess, time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
p = argparse.ArgumentParser()
p.add_argument('--baseline', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
p.add_argument('--samples', type=int, default=5)
p.add_argument('--candidate-first', action='store_true')
a = p.parse_args()
assert 1 <= a.samples <= 5
out = a.output.resolve(); out.mkdir(parents=True, exist_ok=False)
variants = {'baseline': a.baseline.resolve(), 'candidate': ROOT}
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
dump = lambda p, value: p.write_text(json.dumps(value, indent=2) + '\n')
identity = {str(f): sha(f) for variant in variants.values() for directory in ['lib', 'kernel'] for f in (variant / directory).rglob('*') if f.is_file()}
identity.update({str(f): sha(f) for f in Path(__file__).parent.iterdir() if f.is_file()})
dump(out / 'identity.json', identity)
(out / 'host-before.txt').write_text(subprocess.check_output(['uptime'], text=True))
(out / 'processes-before.txt').write_text(subprocess.check_output(['ps', '-axo', 'pid,pcpu,pmem,etime,comm'], text=True))
started = time.monotonic(); receipts = []; rows = []; outputs = {}
def run(variant, app, sample):
    command = ['node', str(ROOT / 'benchmarks/performance/worker.js'), str(variants[variant]), app]
    tick = time.perf_counter_ns(); ready = None; raw = bytearray()
    deadline = time.monotonic() + min(120, 600 - (time.monotonic() - started))
    prefix = out / f'{variant}-{app}-{sample}'
    with prefix.with_suffix('.stderr').open('wb') as stderr:
        proc = subprocess.Popen(command, cwd=ROOT, stdout=subprocess.PIPE, stderr=stderr)
        selector = selectors.DefaultSelector(); selector.register(proc.stdout, selectors.EVENT_READ)
        try:
            while selector.get_map():
                if time.monotonic() >= deadline: raise TimeoutError('process/cohort limit')
                for key, _ in selector.select(.5):
                    block = os.read(key.fileobj.fileno(), 65536)
                    if not block: selector.unregister(key.fileobj); continue
                    raw.extend(block)
                    if len(raw) > 4194304: raise RuntimeError('stdout limit')
                    if ready is None and b'READY\n' in raw: ready = time.perf_counter_ns() - tick
            code = proc.wait(timeout=max(.001, deadline - time.monotonic()))
        except BaseException:
            proc.kill(); proc.wait(); raise
        finally:
            selector.close(); prefix.with_suffix('.stdout').write_bytes(raw)
    text = raw.decode()
    receipt = dict(variant=variant, app=app, sample=sample, returncode=code, ready_wall_ns=ready, process_wall_ns=time.perf_counter_ns()-tick)
    receipts.append(receipt); dump(out / 'processes.json', receipts)
    assert code == 0 and text.rstrip().endswith('PASS ' + app), str(prefix)
    stages = [json.loads(line[6:]) for line in text.splitlines() if line.startswith('STAGE ')]
    events = json.loads(next(line[3:] for line in text.splitlines() if line.startswith('GC ')))
    for stage in stages:
        collections = [e for e in events if stage['start_ms'] <= e['start_ms'] < stage['end_ms']]
        rows.append(dict(**receipt, **stage, gc_count=len(collections), gc_ms=sum(e['duration_ms'] for e in collections)))
    dump(out / 'rows.json', rows)
    if app != 'suite':
        outputs.setdefault(app, []).append(next(line for line in text.splitlines() if line.startswith('RESULT ')))
    print(variant, app, sample, 'PASS', flush=True)
# Reverse both workload and variant order between paired fresh processes.
for sample in range(a.samples):
    for app in (['interpreter', 'cminus', 'suite'] if sample % 2 == 0 else ['suite', 'cminus', 'interpreter']):
        for variant in (['baseline', 'candidate'] if (sample + int(a.candidate_first)) % 2 == 0 else ['candidate', 'baseline']):
            run(variant, app, sample)
assert all(sha(Path(n)) == h for n, h in identity.items()), 'source/artifact drift'
assert all(len(set(values)) == 1 for values in outputs.values()), 'complete paired outputs differ'
(out / 'host-after.txt').write_text(subprocess.check_output(['uptime'], text=True))
(out / 'PASS').write_text('all process outputs and source/artifact stability checks passed\n')
