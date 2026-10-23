"""Summarize complete AOT cohorts, keeping engines and paired processes distinct."""
import argparse
import json
import statistics
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('cohorts', nargs='+', type=Path)
args = parser.parse_args()
rows = []
for cohort in args.cohorts:
    assert (cohort / 'PASS').is_file(), f'incomplete cohort: {cohort}'
    for row in json.loads((cohort / 'rows.json').read_text()):
        rows.append(row | {'cohort': str(cohort)})
summary = {}
for engine in sorted({r['engine'] for r in rows}):
    summary[engine] = {}
    for app in sorted({r['app'] for r in rows if r['engine'] == engine}):
        phases = {}
        for phase in sorted({r['name'] for r in rows if r['engine'] == engine and r['app'] == app}):
            selected = [r for r in rows if r['engine'] == engine and r['app'] == app and r['name'] == phase]
            result = {}
            for variant in sorted({r['variant'] for r in selected}):
                data = [r for r in selected if r['variant'] == variant]
                assert len({r['count'] for r in data}) == 1
                gc_available = all(r['worker']['gc_available'] for r in data)
                result[variant] = {key: statistics.median(r[key] for r in data)
                                   for key in ('cpu_us', 'wall_ns', 'rss', 'heap_used_delta')}
                result[variant].update(samples=len(data), requests=data[0]['count'],
                                       gc_available=gc_available,
                                       gc_count=statistics.median(r['gc_count'] for r in data) if gc_available else None,
                                       gc_ms=statistics.median(r['gc_ms'] for r in data) if gc_available else None)
            if 'candidate' in result:
                pairs = {}
                for row in selected:
                    pair = pairs.setdefault((row['cohort'], row['sample']), {})
                    assert row['variant'] not in pair
                    pair[row['variant']] = row
                assert all(set(pair) == {'baseline', 'candidate'} for pair in pairs.values())
                result['paired'] = {}
                for key in ('cpu_us', 'wall_ns'):
                    ratios = [pair['candidate'][key] / pair['baseline'][key] for pair in pairs.values()]
                    result['paired'][key] = dict(candidate_over_baseline=ratios,
                                                median_reduction_percent=100 * (1 - statistics.median(ratios)),
                                                wins=sum(ratio < 1 for ratio in ratios), pairs=len(ratios))
            phases[phase] = result
        summary[engine][app] = phases
print(json.dumps(summary, indent=2))
