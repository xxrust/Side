"""Run with the selected installed Python; exercise real execution, not mocks."""
from pathlib import Path
import base64, importlib.util, io, json, sys, tempfile, unittest

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('cv_runtime', root/'scripts/cv-runtime.py')
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)

class RuntimeOverhead(unittest.TestCase):
    def test_execution_does_not_load_unused_frameworks_and_keeps_normal_imports(self):
        from PIL import Image
        buffer = io.BytesIO()
        Image.new('RGB', (16, 12), (10, 20, 30)).save(buffer, 'PNG')
        data = 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode()
        code = '''
import scipy
assert 'torch' not in __import__('sys').modules
with step('pixels'):
    save_image('actual', image)
    result = {'shape': list(image.shape), 'bgr': image[0,0].tolist(), 'threads': cv2.getNumThreads()}
'''
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            request = directory/'request.json'
            request.write_text(json.dumps({'runId':'overhead-test','code':code,'images':[{'id':'image','name':'original.png','dataUrl':data}]}),encoding='utf-8')
            runtime.execute(request,directory)
            report = json.loads((directory/'result.json').read_text(encoding='utf-8'))
            self.assertEqual(report['status'],'SUCCEEDED',report.get('error'))
            self.assertEqual(report['result'],{'shape':[12,16,3],'bgr':[30,20,10],'threads':1})
            self.assertFalse(report['environment']['libraries']['torch']['importChecked'])
            self.assertNotIn('available',report['environment']['libraries']['torch'])
            self.assertEqual(len(report['artifacts']),1)
            self.assertAlmostEqual(sum(p['ms'] for p in report['timing']['phases']),report['durationMs'],delta=2)
            # An earlier user node may change OpenCV settings; next node resets.
            import cv2
            cv2.setNumThreads(4)
            runtime.execute(request,directory)
            again = json.loads((directory/'result.json').read_text(encoding='utf-8'))
            self.assertEqual(again['result'],report['result'])
            self.assertEqual(again['artifacts'][0]['sha256'],report['artifacts'][0]['sha256'])
            # Only the explicit environment command performs optional imports.
            full = runtime.probe()
            self.assertTrue(full['libraries']['torch']['importChecked'])
            self.assertIn('torch',sys.modules)

if __name__=='__main__':unittest.main()
