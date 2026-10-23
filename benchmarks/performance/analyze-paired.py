"""Summarize retained baseline/candidate process pairs across cohorts."""
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
for app in ('interpreter', 'cminus', 'suite'):
    phases = {}
    for phase in sorted({r['name'] for r in rows if r['app'] == app}):
        selected = [r for r in rows if r['app'] == app and r['name'] == phase]
        pairs = {}
        for row in selected:
            pair = pairs.setdefault((row['cohort'], row['sample']), {})
            assert row['variant'] not in pair, 'duplicate pair member'
            pair[row['variant']] = row
        assert all(set(pair) == {'baseline', 'candidate'} for pair in pairs.values())
        result = {'pairs': len(pairs)}
        for metric in ('cpu_us', 'wall_ns', 'gc_count', 'gc_ms', 'heap_used_delta', 'rss'):
            result[metric] = {
                variant: statistics.median(pair[variant][metric] for pair in pairs.values())
                for variant in ('baseline', 'candidate')
            }
        for metric in ('cpu_us', 'wall_ns'):
            ratios = [pair['candidate'][metric] / pair['baseline'][metric]
                      for pair in pairs.values()]
            result[metric]['candidate_over_baseline'] = ratios
            result[metric]['median_paired_reduction_percent'] = 100 * (1 - statistics.median(ratios))
            result[metric]['candidate_wins'] = sum(ratio < 1 for ratio in ratios)
        phases[phase] = result
    summary[app] = phases
print(json.dumps(summary, indent=2))
