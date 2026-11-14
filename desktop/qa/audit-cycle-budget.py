"""Audit saved desktop observations without counting nested timings twice.

Usage: python3 desktop/qa/audit-cycle-budget.py OBSERVATION EXECUTION
Reads and hashes every referenced durable record, including faulted units.
This is a retrospective breakdown, not a substitute for desktop acceptance.
"""
import hashlib
import argparse
import json
import math
import pathlib
import statistics
import sys


def audit(observation, execution, *, exempt_first=True):
    units = {unit['unitId']: unit for unit in execution['units']}
    records = {}
    for unit_id, unit in units.items():
        ref = unit['recordRef']
        raw = (pathlib.Path(ref['root']) / ref['$asset']).read_bytes()
        if hashlib.sha256(raw).hexdigest() != ref['sha256']:
            raise ValueError(f'durable record digest mismatch: {unit_id}')
        records[unit_id] = json.loads(raw)
    rows = []
    for observed in observation['rows']:
        if not observed.get('complete'):
            continue
        unit_id = observed['unitId']
        unit = units[unit_id]
        runs = records[unit_id]['runs']
        if set(observed['runIds']) != {run['runId'] for run in runs}:
            raise ValueError(f'run identity mismatch: {unit_id}')
        algorithm = sum(run['timing']['program']['algorithmMs'] for run in runs)
        sdk = sum(run['timing']['program']['sdkMs'] for run in runs)
        timing = observed['unitTiming']
        native = timing['nativeSession']
        total = max(observed['visibleMs'], observed['durableMs'])
        if not math.isclose(algorithm, observed['algorithmMs'], abs_tol=1e-6):
            raise ValueError(f'algorithm timing mismatch: {unit_id}')
        buckets = {
            'sdkOutputMs': sdk,
            'nativeOtherMs': native['nativeMs'] - algorithm - sdk,
            'sessionBridgeMs': native['dispatchMs'] - native['nativeMs'],
            'unitOutsideDispatchMs': timing['totalMs'] - native['dispatchMs'],
            # First row also includes toolbar preflight before unit-start.
            # Later rows contain presentation/archive observation tail here.
            'outsideUnitMs': total - timing['totalMs'],
        }
        if any(value < -1e-6 for value in buckets.values()):
            raise ValueError(f'non-nested timing boundaries: {unit_id}')
        overhead = total - algorithm
        if not math.isclose(sum(buckets.values()), overhead, abs_tol=1e-6):
            raise ValueError(f'budget does not close: {unit_id}')
        rows.append({'unitId': unit_id, 'overheadMs': overhead, **buckets})
    def summarize(items):
        return {key: {'mean': statistics.mean(row[key] for row in items),
                      'max': max(row[key] for row in items)}
                for key in rows[0] if key != 'unitId'} if items else {}
    first_id = observation['rows'][0]['unitId'] if observation['rows'] else None
    budget_rows = [row for row in rows if not exempt_first or row['unitId'] != first_id]
    return {
        'schema': 'side-cycle-budget-audit-2',
        'budgetPolicy': {'limitMs': 100, 'firstUnitExempt': exempt_first,
                         'exemptUnitId': first_id if exempt_first else None,
                         'scope': 'Only latency limit is waived for first unit; execution, display and durable record requirements remain'},
        'verifiedDurableRecords': len(records),
        'completedObservedUnits': len(rows),
        'faultedUnits': [key for key, unit in units.items()
                         if unit['execution'] != 'COMPLETED'],
        'allRows': summarize(rows),
        'firstUnit': next((row for row in rows if row['unitId'] == first_id), None),
        'budgetedRows': summarize(budget_rows),
        'budgetedUnitCount': len(budget_rows),
        'budgetedWithin100ms': sum(row['overheadMs'] <= 100 for row in budget_rows),
        'overBudgetUnits': [row['unitId'] for row in budget_rows if row['overheadMs'] > 100],
        'within100ms': sum(row['overheadMs'] <= 100 for row in rows),
        'acceptancePassed': bool(rows) and len(rows) == len(units)
            and all(unit['execution'] == 'COMPLETED' for unit in units.values())
            and all(row['overheadMs'] <= 100 for row in budget_rows),
        'rows': rows,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('observation')
    parser.add_argument('execution')
    parser.add_argument('--include-first', action='store_true', help='Reproduce the former all-unit latency policy')
    args = parser.parse_args()
    observation, execution = (json.loads(pathlib.Path(path).read_text())
                              for path in (args.observation, args.execution))
    print(json.dumps(audit(observation, execution, exempt_first=not args.include_first), indent=2))
