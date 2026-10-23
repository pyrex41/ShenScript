"""Summarize diagnostic counts; intrusive profile timings are not benchmarks."""
import argparse
import json
from pathlib import Path


def brief(row):
    pure = 0
    if row.get('splitConditional'):
        if not row['consequentAwaits']:
            pure += row['rootTrue']
        if not row['alternateAwaits']:
            pure += row['rootFalse']
    keys = ('name', 'kind', 'calls', 'zeroAwaits', 'awaitEvents',
            'zeroAwaitValues', 'zeroAwaitTrampolines', 'zeroAwaitPromises',
            'awaitSites', 'rootShape', 'rootTrue', 'rootFalse',
            'consequentAwaits', 'alternateAwaits', 'tailTargets')
    return {key: row.get(key) for key in keys} | {'await_free_root_branches': pure}


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('evidence', type=Path)
parser.add_argument('--suffix', default='v5')
args = parser.parse_args()
summary = {}
for app in ('interpreter', 'cminus', 'suite'):
    data = json.loads((args.evidence / f'{app}-{args.suffix}.json').read_text())
    rows = data['stats']
    phases = {}
    for phase in sorted({row['phase'] for row in rows}):
        selected = [row for row in rows if row['phase'] == phase]
        async_rows = [row for row in selected if row['async']]
        metrics = {
            'async_calls': 'calls', 'zero_local_awaits': 'zeroAwaits',
            'await_events': 'awaitEvents', 'zero_await_values': 'zeroAwaitValues',
            'zero_await_trampolines': 'zeroAwaitTrampolines',
            'zero_await_promises': 'zeroAwaitPromises',
        }
        result = {label: sum(row[key] for row in async_rows)
                  for label, key in metrics.items()}
        result['all_generated_calls'] = sum(row['calls'] for row in selected)
        eligible = [brief(row) for row in async_rows]
        result['top_zero_local_awaits'] = sorted(
            eligible, key=lambda row: row['zeroAwaits'], reverse=True)[:20]
        result['top_root_branch_candidates'] = sorted(
            eligible, key=lambda row: row['await_free_root_branches'], reverse=True)[:15]
        phases[phase] = result
    summary[app] = phases

output = args.evidence / f'boundary-summary-{args.suffix}.json'
output.write_text(json.dumps(summary, indent=2) + '\n')
for app, phases in summary.items():
    for phase, result in phases.items():
        calls = result['async_calls']
        zero = result['zero_local_awaits']
        print(app, phase, 'async', calls, 'zero-await', zero,
              'fraction', round(zero / max(calls, 1), 4))
        for row in result['top_root_branch_candidates'][:4]:
            if row['await_free_root_branches']:
                print('  branch', row['name'], row['await_free_root_branches'],
                      'of', row['calls'])
