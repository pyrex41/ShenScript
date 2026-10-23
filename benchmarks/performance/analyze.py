"""Recompute stage and paired CPU summaries, validating complete verdicts."""
import argparse, json, statistics
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('evidence',type=Path);a=p.parse_args()
rows=json.loads((a.evidence/'rows.json').read_text());processes=json.loads((a.evidence/'processes.json').read_text())
median=statistics.median
summary={}
for app in ['interpreter','cminus','suite']:
    result={}
    for phase in sorted({r['name'] for r in rows if r['app']==app}):
        result[phase]={}
        for variant in ['original','updated','optimized']:
            selected=[r for r in rows if r['app']==app and r['name']==phase and r['variant']==variant]
            result[phase][variant]={m:median(r[m] for r in selected) for m in ['cpu_us','wall_ns','gc_count','gc_ms','heap_used_delta','rss']}
        for before,after in [('original','updated'),('updated','optimized')]:
            ratios=[]
            for sample in sorted({r['sample'] for r in rows}):
                get=lambda v:next(r['cpu_us'] for r in rows if r['app']==app and r['name']==phase and r['variant']==v and r['sample']==sample)
                ratios.append(get(before)/get(after))
            result[phase][before+'/'+after]=ratios
    if app!='suite':
        outputs=[]
        for receipt in processes:
            if receipt['app']==app:
                text=(a.evidence/f"{receipt['variant']}-{app}-{receipt['sample']}.stdout").read_text()
                outputs.append(json.loads(next(line[7:] for line in text.splitlines() if line.startswith('RESULT '))))
        assert outputs and all(o==outputs[0] for o in outputs),'complete outputs differ'
    summary[app]=result
(a.evidence/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
for app,phases in summary.items():
    for phase,values in phases.items():
        print(app,phase,'CPUms',*[round(values[v]['cpu_us']/1000,3) for v in ['original','updated','optimized']], 'paired port',values['updated/optimized'])
