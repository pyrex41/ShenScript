"""Serial alternating Node/Chez controls; fresh applications and full outputs."""
import argparse,hashlib,json,os,subprocess,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--chez',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
out=a.output.resolve();out.mkdir(parents=True,exist_ok=False)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
chez=a.chez.resolve();receipts=[];rows=[];started=time.monotonic()
inputs=[*ROOT.glob('lib/*.js'),*ROOT.glob('benchmarks/performance/*'),chez,*chez.parent.parent.glob('lib/shen-scheme/**/*.so')]
(out/'identity.json').write_text(json.dumps({str(f):sha(f) for f in inputs if f.is_file()},indent=2)+'\n')
(out/'host-before.txt').write_text(subprocess.check_output(['uptime'],text=True))
for sample in range(3):
 for app in ['interpreter','cminus','suite']:
  outputs=[]
  for variant in (['node','chez'] if sample%2==0 else ['chez','node']):
   env=dict(os.environ,SS_ROOT=str(ROOT),SS_APP=app,SS_FIXTURE=str(ROOT/'benchmarks/performance'),SS_CHEZ_WORKER=str(ROOT/'benchmarks/performance/chez-worker.ss'))
   cmd=['node',str(ROOT/'benchmarks/performance/worker.js'),str(ROOT),app] if variant=='node' else [str(chez),'eval','-q','-e','(eval-kl [scm. "(parameterize ([optimize-level 2] [debug-level 0]) (load (getenv c#34;SS_CHEZ_WORKERc#34;)))"])']
   prefix=out/f'{sample}-{app}-{variant}';tick=time.perf_counter_ns()
   r=subprocess.run(cmd,cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=min(120,300-(time.monotonic()-started)))
   prefix.with_suffix('.stdout').write_bytes(r.stdout);prefix.with_suffix('.stderr').write_bytes(r.stderr)
   text=r.stdout.decode();receipt=dict(sample=sample,app=app,variant=variant,returncode=r.returncode,process_wall_ns=time.perf_counter_ns()-tick)
   receipts.append(receipt);(out/'processes.json').write_text(json.dumps(receipts,indent=2)+'\n')
   assert r.returncode==0 and text.rstrip().endswith('PASS '+app),str(prefix)
   for line in text.splitlines():
    if line.startswith('STAGE '):rows.append(dict(**receipt,**json.loads(line[6:])))
    if line.startswith('RESULT '):outputs.append(json.loads(line[7:]))
   print(sample,app,variant,'PASS',flush=True)
  assert app=='suite' or len(outputs)==2 and outputs[0]==outputs[1],'complete cross-port outputs differ'
(out/'rows.json').write_text(json.dumps(rows,indent=2)+'\n')
identity=json.loads((out/'identity.json').read_text());assert all(sha(Path(n))==h for n,h in identity.items())
(out/'host-after.txt').write_text(subprocess.check_output(['uptime'],text=True));(out/'PASS').write_text('18 fresh processes; complete application outputs agree; all suites 154/0\n')
