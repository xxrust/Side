"""Compile-only preparation: no operator side effects, exact cached semantics."""
import importlib.util,json,socket,subprocess,sys,tempfile,types,unittest
from pathlib import Path
SCRIPT=Path(__file__).resolve().parents[1]/'scripts/cv-runtime.py'
spec=importlib.util.spec_from_file_location('runtime',SCRIPT)
runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)
class ProgramPreparation(unittest.TestCase):
 def test_execution_gc_probe_attributes_sdk_and_user_callbacks_and_cleans_up(self):
  import gc
  before=list(gc.callbacks);enabled=gc.isenabled();threshold=gc.get_threshold();ledger=runtime.SDKClock()
  with self.assertRaisesRegex(RuntimeError,'actual'):
   with runtime.program_execution_gc_probe(ledger) as report:
    with ledger.service('set_output'):
     gc.collect(0)
     ledger.user(lambda:gc.collect(1))
    raise RuntimeError('actual')
  self.assertEqual(gc.callbacks,before);self.assertEqual(gc.isenabled(),enabled);self.assertEqual(gc.get_threshold(),threshold)
  self.assertEqual([(r['generation'],r['service']) for r in report['collections']],[(0,'set_output'),(1,None)])
  self.assertTrue(all(r['ms']>=0 for r in report['collections']))
 def test_result_validation_probe_labels_framework_work_and_preserves_gc_policy(self):
  import gc
  before=list(gc.callbacks);threshold=gc.get_threshold();enabled=gc.isenabled()
  with runtime.program_execution_gc_probe(runtime.SDKClock(), "result-validation") as report:
   gc.collect(0)
  self.assertIn('result-validation',report['scope'])
  self.assertEqual(len(report['collections']),1)
  self.assertIsNone(report['collections'][0]['service'])
  self.assertEqual(gc.callbacks,before);self.assertEqual(gc.get_threshold(),threshold);self.assertEqual(gc.isenabled(),enabled)
 def test_binding_gc_probe_is_nested_and_removes_callback_on_exception(self):
  import gc
  before=list(gc.callbacks);enabled=gc.isenabled();threshold=gc.get_threshold()
  with self.assertRaisesRegex(RuntimeError,'actual'):
   with runtime.program_binding_gc_probe() as report:
    gc.collect(0)
    raise RuntimeError('actual')
  self.assertEqual(gc.callbacks,before);self.assertEqual(gc.isenabled(),enabled);self.assertEqual(gc.get_threshold(),threshold)
  self.assertGreaterEqual(report['generations'][0]['count'],1)
  self.assertGreaterEqual(report['generations'][0]['ms'],0)
  self.assertIn('never subtracted',report['scope'])
 def test_cache_rebinds_nested_code_and_keeps_syntax_errors_at_actual_path(self):
  resident={};code='def outer():\n def inner():\n  raise RuntimeError("actual")\n return inner\n'
  result=runtime.prepare_programs([code,'if :'],resident)
  self.assertEqual((result['prepared'],result['rejected']),(1,1))
  self.assertEqual(len(resident['programs']),1)
  compiled=runtime.compiled_program(code,'/actual/run/algorithm.py',resident)
  self.assertEqual(resident['compileHits'],1)
  def check(value):
   self.assertEqual(value.co_filename,'/actual/run/algorithm.py')
   for child in value.co_consts:
    if isinstance(child,types.CodeType):check(child)
  check(compiled)
  with self.assertRaises(SyntaxError) as fault:runtime.compiled_program('if :','/actual/run/algorithm.py',resident)
  self.assertEqual(fault.exception.filename,'/actual/run/algorithm.py')
  a={};b={};exec(compiled,a);exec(compiled,b);self.assertIsNot(a['outer'],b['outer'])
 def test_repeated_filename_binding_does_not_leave_cyclic_garbage(self):
  import gc
  state={};code='def outer():\n def inner():\n  return 7\n return inner\n'
  runtime.prepare_programs([code],state)
  gc.collect();enabled=gc.isenabled();gc.disable()
  try:
   for i in range(100):
    compiled=runtime.compiled_program(code,f'/run/{i}/algorithm.py',state)
    self.assertEqual(compiled.co_filename,f'/run/{i}/algorithm.py')
   # Code objects stay valid without retaining garbage helper functions/cells.
   self.assertEqual(gc.collect(),0)
  finally:
   if enabled:gc.enable()
 def test_compile_warnings_remain_available_to_the_actual_run(self):
  import warnings
  state={};code='value = (1 is 1)'
  result=runtime.prepare_programs([code],state)
  self.assertEqual((result['prepared'],result['rejected']),(0,1))
  self.assertNotIn(code.encode(),state['programs'])
  with warnings.catch_warnings(record=True) as observed:
   warnings.simplefilter('always');runtime.compiled_program(code,'/actual/warning.py',state)
  self.assertTrue(observed);self.assertEqual(observed[0].filename,'/actual/warning.py')
 def test_bounds_and_source_changes(self):
  for codes in ['pass',[None],['pass']*33,['x'*(runtime.MAX_PROGRAM_CACHE_SOURCE_BYTES+1)]]:
   state={}
   with self.assertRaises(ValueError):runtime.prepare_programs(codes,state)
   self.assertNotIn('programs',state)
  state={};runtime.prepare_programs(['value=1','value=2'],state)
  for code,value in [('value=1',1),('value=2',2)]:
   scope={};exec(runtime.compiled_program(code,'actual.py',state),scope);self.assertEqual(scope['value'],value)
 def test_real_protocol_never_executes_code_or_creates_artifacts(self):
  with tempfile.TemporaryDirectory() as directory,socket.socket() as listener:
   listener.bind(('127.0.0.1',0));listener.listen();listener.settimeout(15)
   marker=Path(directory)/'forbidden'
   codes=[f'from pathlib import Path\nPath({str(marker)!r}).write_text("executed")', 'raise RuntimeError("not executed")', 'if :']
   child=subprocess.Popen([sys.executable,'-B',str(SCRIPT),'--serve',f'127.0.0.1:{listener.getsockname()[1]}','test-token'],cwd=directory,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
   try:
    connection,_=listener.accept()
    with connection:
     connection.settimeout(15)
     with connection.makefile('rwb') as channel:
      self.assertEqual(json.loads(channel.readline())['token'],'test-token')
      for value,ok in [(codes,True),([None],False),(codes,True)]:
       encoded=json.dumps(value).encode();channel.write((json.dumps({'operation':'prepare-programs','sourceBytes':len(encoded)})+'\n').encode());channel.write(encoded);channel.flush()
       reply=json.loads(channel.readline());self.assertEqual(reply['operation'],'prepare-programs');self.assertEqual(reply['ok'],ok)
       if ok:self.assertEqual((reply['prepared'],reply['rejected']),(2,1))
      self.assertEqual(list(Path(directory).iterdir()),[])
    child.wait(timeout=5);self.assertEqual(child.returncode,0)
   finally:
    if child.poll() is None:child.kill()
    child.communicate(timeout=5)
if __name__=='__main__':unittest.main()
