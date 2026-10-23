"""Recompute paired CPU/wall/GC summaries and compare complete outputs."""
import argparse,json,statistics
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('evidence',type=Path);a=p.parse_args()
rows=json.loads((a.evidence/'rows.json').read_text());processes=json.loads((a.evidence/'processes.json').read_text());summary={}
for app in ['interpreter','cminus','suite']:
 result={}
 for phase in sorted({r['name'] for r in rows if r['app']==app}):
  stage={}
  for variant in ['baseline','candidate']:
   selected=[r for r in rows if r['app']==app and r['name']==phase and r['variant']==variant]
   stage[variant]={metric:statistics.median(r[metric] for r in selected) for metric in ['cpu_us','wall_ns','heap_used_delta','rss','gc_count','gc_ms']}
  ratios=[]
  for sample in sorted({r['sample'] for r in rows}):
   get=lambda v:next(r['cpu_us'] for r in rows if r['app']==app and r['name']==phase and r['variant']==v and r['sample']==sample)
   ratios.append(get('baseline')/get('candidate'))
  stage['paired_cpu_ratios_baseline_over_candidate']=ratios
  stage['median_paired_cpu_reduction_percent']=(1-1/statistics.median(ratios))*100
  result[phase]=stage
 if app!='suite':
  outputs=[]
  for process in processes:
   if process['app']!=app:continue
   text=(a.evidence/f"{process['variant']}-{app}-{process['sample']}.stdout").read_text()
   assert text.rstrip().endswith('PASS '+app)
   outputs.append(json.loads(next(line[7:] for line in text.splitlines() if line.startswith('RESULT '))))
  assert outputs and all(value==outputs[0] for value in outputs)
 summary[app]=result
(a.evidence/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
for app,phases in summary.items():
 for phase,stage in phases.items():
  print(app,phase,'CPUms',*[round(stage[v]['cpu_us']/1000,3) for v in ['baseline','candidate']], 'paired %',round(stage['median_paired_cpu_reduction_percent'],2), 'ratios',stage['paired_cpu_ratios_baseline_over_candidate'])
