"""Real resident protocol: prepare imports libraries without invoking execute."""
import json, socket, subprocess, sys, tempfile, unittest
from pathlib import Path
SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/cv-runtime.py'

class Preparation(unittest.TestCase):
    def run_case(self, fail_first=False):
        with tempfile.TemporaryDirectory() as directory, socket.socket() as listener:
            listener.bind(('127.0.0.1', 0)); listener.listen(); listener.settimeout(20)
            marker = Path(directory) / 'operator-was-called'
            wrapper = '''import importlib.util,sys,builtins
from pathlib import Path
spec=importlib.util.spec_from_file_location('runtime',sys.argv[1]);r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
def forbidden(*args,**kwargs):
 Path(sys.argv[4]).write_text('unexpected operator execution');raise AssertionError('prepare called execute')
r.execute=forbidden
from PIL import Image
original_preinit=Image.preinit
codec_preparations=0
def basic_codecs():
 global codec_preparations
 codec_preparations+=1
 return original_preinit()
Image.preinit=basic_codecs
Image.open=forbidden
if sys.argv[5]=='fail':
 original=builtins.__import__
 def once(name,*args,**kwargs):
  if name=='numpy':
   builtins.__import__=original
   raise ImportError('injected preparation failure')
  return original(name,*args,**kwargs)
 builtins.__import__=once
r.serve(sys.argv[2],sys.argv[3])
assert codec_preparations==(1 if sys.argv[5]=='fail' else 2),codec_preparations
'''
            child = subprocess.Popen([sys.executable, '-B', '-c', wrapper, str(SCRIPT),
                f'127.0.0.1:{listener.getsockname()[1]}', 'test-token', str(marker), 'fail' if fail_first else 'ok'],
                cwd=directory, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                connection, _ = listener.accept()
                with connection:
                    connection.settimeout(20)
                    with connection.makefile('rwb') as channel:
                        hello = json.loads(channel.readline());self.assertEqual(hello['token'], 'test-token')
                        for index in range(2):
                            channel.write(b'{"operation":"prepare"}\n');channel.flush()
                            reply = json.loads(channel.readline())
                            self.assertEqual(reply['operation'], 'prepare')
                            self.assertEqual(reply['ok'], not(fail_first and index == 0))
                        self.assertFalse(marker.exists())
                        self.assertEqual(list(Path(directory).iterdir()), [], 'prepare must not create run/image output directories')
                child.wait(timeout=5);self.assertEqual(child.returncode, 0)
            finally:
                if child.poll() is None: child.kill()
                child.communicate(timeout=5)
    def test_repeated_prepare_without_operator_or_outputs(self): self.run_case()
    def test_library_failure_is_acknowledged_and_retryable(self): self.run_case(True)

if __name__ == '__main__': unittest.main()
