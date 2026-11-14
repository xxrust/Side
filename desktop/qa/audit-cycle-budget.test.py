"""First-unit latency exemption never waives correctness or later-unit limits."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('cycle_audit', Path(__file__).with_name('audit-cycle-budget.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class BudgetPolicyTests(unittest.TestCase):
    def fixture(self, first=140, second=90):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        observation, execution = {'rows': []}, {'units': []}
        for index, overhead in enumerate([first, second]):
            identity = str(index)
            record = {'runs': [{'runId': identity, 'timing': {'program': {'algorithmMs': 500, 'sdkMs': 10}}}]}
            raw = json.dumps(record).encode()
            Path(directory.name, identity).write_bytes(raw)
            execution['units'].append({'unitId': identity, 'execution': 'COMPLETED', 'recordRef': {
                'root': directory.name, '$asset': identity, 'sha256': hashlib.sha256(raw).hexdigest()}})
            observation['rows'].append({'unitId': identity, 'complete': True, 'runIds': [identity],
                'algorithmMs': 500, 'visibleMs': 500+overhead, 'durableMs': 550,
                'unitTiming': {'totalMs': 540, 'nativeSession': {'nativeMs': 520, 'dispatchMs': 530}}})
        return observation, execution

    def test_only_first_latency_is_exempt(self):
        o, e = self.fixture()
        result = module.audit(o, e)
        self.assertTrue(result['acceptancePassed'])
        self.assertEqual(result['firstUnit']['overheadMs'], 140)
        self.assertEqual(result['budgetedUnitCount'], 1)
        self.assertFalse(module.audit(o, e, exempt_first=False)['acceptancePassed'])

    def test_second_overrun_still_fails(self):
        o, e = self.fixture(second=101)
        result = module.audit(o, e)
        self.assertFalse(result['acceptancePassed'])
        self.assertEqual(result['overBudgetUnits'], ['1'])

    def test_first_fault_does_not_exempt_second(self):
        o, e = self.fixture(second=101)
        o['rows'][0]['complete'] = False
        e['units'][0]['execution'] = 'FAULT'
        result = module.audit(o, e)
        self.assertFalse(result['acceptancePassed'])
        self.assertIsNone(result['firstUnit'])
        self.assertEqual(result['overBudgetUnits'], ['1'])

    def test_first_missing_display_and_durable_still_fails(self):
        o, e = self.fixture()
        o['rows'][0]['complete'] = False
        self.assertFalse(module.audit(o, e)['acceptancePassed'])
        e['units'][0]['recordRef']['sha256'] = 'invalid'
        with self.assertRaisesRegex(ValueError, 'digest mismatch'):
            module.audit(o, e)

if __name__ == '__main__':
    unittest.main()
