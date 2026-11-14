"""Actual serial worker protocol releases sent report ownership while idle."""
import json,socket,subprocess,sys,tempfile,unittest
from pathlib import Path
SCRIPT=Path(__file__).resolve().parents[1]/'scripts/cv-runtime.py'
class TransportLifetime(unittest.TestCase):
 def test_sent_payload_released_before_next_execute_and_artifacts_stay_owned(self):
  wrapper='''import importlib.util,sys,weakref
spec=importlib.util.spec_from_file_location('runtime',sys.argv[1]);r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
class Report(dict):pass
saved=None
def execute(*args,**kwargs):
 global saved
 resident=kwargs['resident'];report=Report(result={'large':'x'*1000000})
 saved=weakref.ref(report)
 resident['artifacts']={('run','pixels'):b'preserved'}
 resident['liveImages']={'preview':b'actual-preview'}
 return {'report':report,'artifacts':{'pixels':b'preserved'}}
def prepare(codes,resident):
 return {'prepared':len(codes),'rejected':0,'reportReleased':saved() is None,'artifactPreserved':resident['artifacts'][('run','pixels')]==b'preserved'}
r.execute=execute;r.prepare_programs=prepare;r.serve(sys.argv[2],'token')
'''
  with tempfile.TemporaryDirectory() as tmp,socket.socket() as listener:
   listener.bind(('127.0.0.1',0));listener.listen();listener.settimeout(10)
   child=subprocess.Popen([sys.executable,'-B','-c',wrapper,str(SCRIPT),f'127.0.0.1:{listener.getsockname()[1]}'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
   try:
    connection,_=listener.accept()
    with connection:
     connection.settimeout(10)
     with connection.makefile('rwb') as channel:
      self.assertEqual(json.loads(channel.readline())['token'],'token')
      request=json.dumps({'runtimeMemoryScope':'a'*64}).encode()
      message={'call':1,'directory':tmp,'cacheRoot':tmp,'requestBytes':len(request)}
      channel.write(json.dumps(message).encode()+b'\n'+request);channel.flush()
      reply=json.loads(channel.readline());self.assertTrue(reply['ok']);report=channel.read(reply['reportBytes'])
      self.assertEqual(json.loads(report)['result']['large'],'x'*1000000)
      self.assertEqual(channel.read(9),b'preserved');self.assertEqual(channel.read(14),b'actual-preview')
      for call,ok in [(0,False),(1,True)]:
       channel.write(json.dumps({'operation':'collect-garbage','id':'test-ticket','pid':child.pid,'call':call}).encode()+b'\n');channel.flush()
       maintenance=json.loads(channel.readline());self.assertEqual(maintenance['ok'],ok);self.assertEqual(maintenance['pid'],child.pid);self.assertEqual(maintenance['call'],1)
       if ok:self.assertGreaterEqual(maintenance['gcMs'],0);self.assertEqual(maintenance['id'],'test-ticket')
      codes=b'["pass"]';channel.write(json.dumps({'operation':'prepare-programs','sourceBytes':len(codes)}).encode()+b'\n'+codes);channel.flush()
      state=json.loads(channel.readline());self.assertTrue(state['reportReleased']);self.assertTrue(state['artifactPreserved'])
    child.wait(timeout=5);self.assertEqual(child.returncode,0,child.stderr.read().decode())
   finally:
    if child.poll() is None:child.kill();child.wait()
    child.stdout.close();child.stderr.close()
if __name__=='__main__':unittest.main()
