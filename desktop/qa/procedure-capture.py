"""Routine trace collection is explicit and never traverses omitted values."""
import importlib.util,unittest,math
from pathlib import Path
s=importlib.util.spec_from_file_location('runtime',Path(__file__).resolve().parents[1]/'scripts/cv-runtime.py');r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
class Capture(unittest.TestCase):
 def test_routine_does_not_convert_bulk_values_and_returns_original(self):
  class Expensive:
   def tolist(self):raise AssertionError('must not convert diagnostic data')
  trace=r.ProcedureTrace('essential');step=trace.unit('step','actual');value=Expensive()
  with step:self.assertIs(step.set_output('model',value),value)
  self.assertEqual(step.node['outputs']['model']['status'],'NOT_CAPTURED');self.assertEqual(step.node['status'],'SUCCEEDED')
  self.assertEqual(trace.data['capture']['mode'],'essential')
 def test_scalar_and_boundary_evidence_remain_real_detached_snapshots(self):
  trace=r.ProcedureTrace('essential');step=trace.unit('step','actual');checks=[{'id':'real','status':'FAIL','actual':[1,2],'threshold':3}]
  with step:
   step.set_output('boundaryChecks',checks);step.set_output('score',-0.0);step.set_output('nan',float('nan'));step.set_output('label','actual')
  checks[0]['actual'][0]=99
  self.assertEqual(step.node['outputs']['boundaryChecks'][0]['actual'],[1,2]);self.assertEqual(math.copysign(1,step.node['outputs']['score']),-1);self.assertIsNone(step.node['outputs']['nan']);self.assertEqual(step.node['outputs']['label'],'actual')
 def test_full_diagnostics_keep_complete_original_snapshot(self):
  trace=r.ProcedureTrace('full');step=trace.unit('step','actual');value={'candidates':list(range(512))}
  step.set_output('model',value);value['candidates'][0]=-1
  self.assertEqual(step.node['outputs']['model']['candidates'][0],0);self.assertNotIn('capture',trace.data)
 def test_boundaries_still_validate_and_errors_are_not_swallowed(self):
  class Bad:
   def tolist(self):raise ValueError('invalid boundary data')
  step=r.ProcedureTrace('essential').unit('step','actual')
  with self.assertRaises(ValueError):step.set_output('boundaryChecks',Bad())
  with self.assertRaises(ValueError):step.set_output('',[])
 def test_large_text_not_copied_and_default_remains_full(self):
  step=r.ProcedureTrace('essential').unit('step','actual');step.set_output('text','x'*1025);self.assertEqual(step.node['outputs']['text']['status'],'NOT_CAPTURED')
  self.assertEqual(r.ProcedureTrace().capture,'full')
  with self.assertRaises(ValueError):r.ProcedureTrace('missing')
if __name__=='__main__':unittest.main()
