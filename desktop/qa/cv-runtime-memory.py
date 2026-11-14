"""Real SDK memory execution: exact bytes, mutable input isolation and timings."""
from pathlib import Path
from collections import OrderedDict
import base64, hashlib, importlib.util, io, json, tempfile, time, unittest
from unittest.mock import patch

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('runtime',root/'scripts/cv-runtime.py')
runtime=importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)

class MemoryRuntime(unittest.TestCase):
    def test_optional_json_capture_keeps_boundaries_layers_and_diagnostics(self):
        from PIL import Image
        buffer=io.BytesIO();Image.new('RGB',(2,2)).save(buffer,'PNG')
        image={'id':'actual','dataUrl':'data:image/png;base64,'+base64.b64encode(buffer.getvalue()).decode()}
        with tempfile.TemporaryDirectory() as temporary:
            base=Path(temporary);resident={'root':base,'decoded':OrderedDict(),'decodeHits':0,'decodeMisses':0,'environment':None}
            for capture in ['essential','full']:
                directory=base/capture;directory.mkdir()
                request={'runId':capture,'artifactMode':'inspection','procedureValueCapture':capture,'optionalJsonArtifactIds':['optional','boundary','geometry'],'images':[image],
                    'code':"with step('actual'):\n    save_json('optional',{'values':[1,2,3]})\n    save_json('boundary',{'actual':3},section='boundary')\n    save_layers('geometry',[])\nresult={'valid':True}"}
                payload=runtime.execute(None,directory,resident,request_data=request);report=payload['report']
                self.assertEqual(report['status'],'SUCCEEDED',report.get('error'));artifacts={a['id']:a for a in report['artifacts']}
                for name in ['boundary','geometry']:self.assertIn('sha256',artifacts[name]);self.assertNotIn('collection',artifacts[name])
                optional=artifacts['optional']
                if capture=='essential':
                    self.assertEqual(optional['collection']['status'],'NOT_CAPTURED')
                    self.assertTrue(all(k not in optional for k in ['sha256','bytes','data','path','memoryRef']))
                    self.assertNotIn((capture,'optional'),resident['artifacts'])
                else:
                    self.assertNotIn('collection',optional);self.assertEqual(json.loads(resident['artifacts'][(capture,'optional')]),{'values':[1,2,3]})

    def test_inspection_originals_materialize_only_on_explicit_valid_file_request(self):
        from PIL import Image
        buffer=io.BytesIO();Image.new('RGB',(5,3),(10,20,30)).save(buffer,'PNG');raw=buffer.getvalue()
        images=[{'id':f'actual-{i}','dataUrl':'data:image/png;base64,'+base64.b64encode(raw).decode()} for i in range(2)]
        with tempfile.TemporaryDirectory() as temporary:
            base=Path(temporary);resident={'root':base/'originals','decoded':OrderedDict(),'decodeHits':0,'decodeMisses':0,'environment':None}
            resident['root'].mkdir()
            request={'runId':'arrays','artifactMode':'inspection','images':images,
                     'code':"result={'paths':[r['path'] for r in image_records],'pixels':image[0,0].tolist()}"}
            directory=base/'arrays';directory.mkdir()
            report=runtime.execute(None,directory,resident,request_data=request)['report']
            self.assertEqual(report['status'],'SUCCEEDED',report.get('error'))
            self.assertEqual(report['result'],{'paths':[None,None],'pixels':[30,20,10]})
            self.assertFalse((directory/'inputs').exists());self.assertEqual(list(resident['root'].iterdir()),[])
            for index in [-1,2,True,0.0,'0']:
                directory=base/f'invalid-{str(index)}';directory.mkdir()
                request.update(runId=directory.name,code=f'input_file({index!r})')
                report=runtime.execute(None,directory,resident,request_data=request)['report']
                self.assertEqual(report['status'],'FAILED');self.assertEqual(report['error']['type'],'ValueError');self.assertIn('INPUT_FILE_INDEX_INVALID',report['error']['message'])
                self.assertFalse((directory/'inputs').exists())
            directory=base/'explicit';directory.mkdir()
            request.update(runId='explicit',code="first=input_file(1)\nfirst.write_bytes(b'explicit mutation')\nsecond=input_file(1)\nresult={'same':first==second,'bytes':second.read_bytes().decode(),'states':[r['fileStatus'] for r in image_records]}")
            report=runtime.execute(None,directory,resident,request_data=request)['report']
            self.assertEqual(report['status'],'SUCCEEDED',report.get('error'))
            self.assertEqual(report['result'],{'same':True,'bytes':'explicit mutation','states':['NOT_MATERIALIZED','EXPLICIT_TEMPORARY_COPY']})
            self.assertEqual([p.name for p in (directory/'inputs').iterdir()],['image-001.original'])

    def test_gray_input_expansion_preserves_depth_and_independent_writable_arrays(self):
        import cv2
        import numpy as np
        for dtype in [np.uint8, np.uint16]:
            with self.subTest(dtype=dtype), tempfile.TemporaryDirectory() as temporary:
                pixels=np.arange(5*7,dtype=dtype).reshape(5,7)*(1 if dtype==np.uint8 else 1024)
                ok,encoded=cv2.imencode('.png',pixels);self.assertTrue(ok)
                base=Path(temporary);originals=base/'originals';originals.mkdir()
                resident={'root':originals,'decoded':OrderedDict(),'decodeHits':0,'decodeMisses':0,'environment':None}
                request={'runId':'gray','artifactMode':'inspection','upstream':None,'images':[{'id':'actual','dataUrl':'data:image/png;base64,'+base64.b64encode(encoded).decode()}],
                         'code':"result={'raw':raw_images[0].tolist(),'bgr':image.tolist(),'gray':gray.tolist(),'dtype':str(image.dtype)}\nimage[:]=0\nassert np.array_equal(raw_images[0],gray)\ngray[:]=0\nassert np.any(raw_images[0])"}
                for index in range(2):
                    directory=base/str(index);directory.mkdir()
                    report=runtime.execute(None,directory,resident,request_data=request)['report']
                    self.assertEqual(report['status'],'SUCCEEDED',report.get('error'))
                    self.assertEqual(report['result'],{'raw':pixels.tolist(),'bgr':np.repeat(pixels[:,:,None],3,axis=2).tolist(),'gray':pixels.tolist(),'dtype':str(pixels.dtype)})

    def test_json_consumers_use_verified_resident_bytes_with_independent_mutable_values(self):
        from PIL import Image
        buffer=io.BytesIO();Image.new('RGB',(2,2)).save(buffer,'PNG')
        image={'id':'actual','dataUrl':'data:image/png;base64,'+base64.b64encode(buffer.getvalue()).decode()}
        with tempfile.TemporaryDirectory() as temporary:
            base=Path(temporary);originals=base/'originals';originals.mkdir()
            resident={'root':originals,'decoded':OrderedDict(),'decodeHits':0,'decodeMisses':0,'environment':None}
            request={'runId':'producer','artifactMode':'inspection','images':[image],'code':"save_json('value',{'nested':[3,4]})"}
            directory=base/'producer';directory.mkdir()
            producer=runtime.execute(None,directory,resident,request_data=request)['report']
            artifact=producer['artifacts'][0];self.assertTrue(artifact['residentJson']);self.assertNotIn('data',artifact)
            for index in range(2):
                directory=base/f'consumer-{index}';directory.mkdir()
                request.update(runId=f'consumer-{index}',code="result={'before':upstream['data']['artifact']['data']['nested'][0]}\nupstream['data']['artifact']['data']['nested'][0]=99",
                               upstream={'data':{'nodeId':'producer','runId':'producer','artifact':dict(artifact)}})
                report=runtime.execute(None,directory,resident,request_data=request)['report']
                self.assertEqual(report['status'],'SUCCEEDED',report.get('error'));self.assertEqual(report['result'],{'before':3})
            directory=base/'forged';directory.mkdir()
            request['upstream']['data']['artifact']['sha256']='0'*64
            self.assertEqual(runtime.execute(None,directory,resident,request_data=request)['report']['status'],'FAILED')

    def test_original_frames_are_verified_once_and_sdk_files_cannot_change_cached_originals(self):
        from PIL import Image
        buffer=io.BytesIO();Image.new('RGB',(5,3),(10,20,30)).save(buffer,'PNG');raw=buffer.getvalue()
        reference={'kind':'runtime-original','token':'a'*64,'imageId':'actual','width':5,'height':3,
                   'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}
        frames=[{'reference':reference,'bytes':len(raw)}]
        resident={'decoded':OrderedDict(),'decodeHits':0,'decodeMisses':0,'environment':None}
        runtime.receive_originals(io.BytesIO(raw),frames,resident)
        self.assertEqual(resident['originalMisses'],1)
        with tempfile.TemporaryDirectory() as temporary:
            base=Path(temporary);resident['root']=base/'originals';resident['root'].mkdir()
            request={'runId':'first','artifactMode':'inspection','images':[{'id':'actual','width':5,'height':3,'hostOriginal':reference}],
                     'code':"before=image[0,0].tolist()\nimage[:]=0\ninput_file().write_bytes(b'user writes input path')\nresult={'before':before,'raw':raw_images[0][0,0].tolist()}"}
            # Path is an ordinary user import, as in existing arbitrary programs.
            request['code']='from pathlib import Path\n'+request['code']
            first=base/'first';first.mkdir();report=runtime.execute(None,first,resident,request_data=request)['report']
            self.assertEqual(report['status'],'SUCCEEDED',report.get('error'))
            self.assertEqual(report['result'],{'before':[30,20,10],'raw':[30,20,10]})
            runtime.receive_originals(io.BytesIO(b''),[{'reference':reference,'bytes':0}],resident)
            second=base/'second';second.mkdir();request['runId']='second';request['code']="result={'pixel':image[0,0].tolist()}"
            report=runtime.execute(None,second,resident,request_data=request)['report']
            self.assertEqual(report['status'],'SUCCEEDED',report.get('error'))
            self.assertEqual(report['result']['pixel'],[30,20,10]);self.assertEqual(resident['originalHits'],1)
            self.assertIsNone(report['inputs'][0]['path'])
            self.assertEqual(report['inputs'][0]['fileStatus'],'NOT_MATERIALIZED')
            self.assertFalse((second/'inputs').exists())
            # An explicit copy remains private and retains its mutation;
            # neither cached originals nor the next invocation were affected.
            self.assertEqual((first/'inputs/image-000.original').read_bytes(),b'user writes input path')
        with self.assertRaisesRegex(ValueError,'hash mismatch'):
            runtime.receive_originals(io.BytesIO(b'x'*len(raw)),[{'reference':{**reference,'token':'b'*64},'bytes':len(raw)}],resident)
        with self.assertRaisesRegex(EOFError,'Truncated'):
            runtime.receive_originals(io.BytesIO(raw[:-1]),frames,resident)
        with self.assertRaisesRegex(ValueError,'expired or changed'):
            runtime.receive_originals(io.BytesIO(),[{'reference':{**reference,'token':'c'*64},'bytes':0}],resident)
        for i in range(17):
            ref={**reference,'token':f'{i+100:064x}'}
            runtime.receive_originals(io.BytesIO(raw),[{'reference':ref,'bytes':len(raw)}],resident)
        self.assertEqual(len(resident['originalInputs']),16)
        self.assertNotIn(reference['token'],resident['originalInputs'])

    def test_live_bmp_preserves_rgb_gray_and_native_depth_without_png(self):
        from PIL import Image
        buffer = io.BytesIO(); Image.new('RGB', (5, 3), (10, 20, 30)).save(buffer, 'PNG')
        image = {'id': 'actual', 'width': 5, 'height': 3,
                 'dataUrl': 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode()}
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary); originals = base/'originals'; originals.mkdir()
            resident = {'root': originals, 'decoded': OrderedDict(), 'decodeHits': 0, 'decodeMisses': 0, 'environment': None}
            request = {'runId': 'colors', 'artifactMode': 'inspection', 'images': [image],
                       'expectedOutputs': [{'id': name, 'type': 'image', 'role': 'result'} for name in ['bgr', 'rgb', 'gray', 'rgba16']],
                       'code': "save_image('bgr',image)\nsave_image('rgb',image[:,:,::-1],color_order='RGB')\nsave_image('gray',np.full((3,5),123,np.uint8))\nsave_image('rgba16',np.tile(np.array([2560,5120,7680,0],np.uint16),(3,5,1)),color_order='RGB')\n"}
            payload = runtime.execute(None, base, resident, request_data=request)
            self.assertEqual(payload['report']['status'], 'SUCCEEDED', payload['report'].get('error'))
            for name, rgb in [('bgr', (10,20,30)), ('rgb', (10,20,30)), ('gray', (123,123,123)), ('rgba16', (10,20,30))]:
                preview = resident['liveImages'][name]
                self.assertTrue(preview.startswith(b'BM'))
                with Image.open(io.BytesIO(preview)) as opened:
                    self.assertEqual(opened.size, (5,3))
                    self.assertEqual(opened.convert('RGB').getpixel((0,0)), rgb)
            self.assertFalse(list((base/'outputs').iterdir()))

    def test_json_normalization_keeps_numeric_and_key_semantics(self):
        import numpy as np
        value = {None: (1, -0.0, True, None, 'text', float('nan'), float('inf'),
                        np.float32(1.25), np.int64(7), np.array([[2., np.nan]])),
                 False: {4: np.array([1, 2], dtype=np.uint16)}}
        normalized = runtime.json_value(value)
        self.assertEqual(normalized, {'None': [1, -0.0, True, None, 'text', None, None,
                                             1.25, 7, [[2., None]]], 'False': {'4': [1, 2]}})
        encoded = json.dumps(normalized, ensure_ascii=False, allow_nan=False, separators=(',', ':'))
        self.assertIn('-0.0', encoded)
        with self.assertRaises(TypeError):
            runtime.json_value([object()])


    def test_program_cache_rebinds_nested_tracebacks_and_does_not_cache_state(self):
        resident = {}
        code = "state=[]\ndef nested():\n    state.append(1)\n    return len(state)\nresult=nested()\n"
        first = runtime.compiled_program(code, 'first/algorithm.py', resident)
        second = runtime.compiled_program(code, 'second/algorithm.py', resident)
        self.assertEqual(resident['compileHits'], 1)
        self.assertEqual(resident['compileMisses'], 1)
        for program, filename in [(first, 'first/algorithm.py'), (second, 'second/algorithm.py')]:
            namespace = {}
            exec(program, namespace)
            self.assertEqual(namespace['result'], 1)
            self.assertEqual(namespace['nested'].__code__.co_filename, filename)
        failure = "def outer():\n    def inner():\n        raise ValueError('actual')\n    inner()\nouter()\n"
        runtime.compiled_program(failure, 'old/algorithm.py', resident)
        try:
            exec(runtime.compiled_program(failure, 'current/algorithm.py', resident), {})
        except ValueError:
            trace = runtime.traceback.format_exc()
        else:
            self.fail('Expected actual nested exception')
        self.assertIn('current/algorithm.py', trace)
        self.assertNotIn('old/algorithm.py', trace)
        changed = runtime.compiled_program(code.replace('len(state)', 'len(state)+9'), 'third/algorithm.py', resident)
        namespace = {}; exec(changed, namespace)
        self.assertEqual(namespace['result'], 10)
        for i in range(runtime.MAX_PROGRAM_CACHE_ENTRIES + 1):
            runtime.compiled_program(f'result={i}', 'bounded/algorithm.py', resident)
        self.assertEqual(len(resident['programs']), runtime.MAX_PROGRAM_CACHE_ENTRIES)
        self.assertNotIn(code.encode(), resident['programs'])

    def test_memory_artifacts_and_immutable_upstream(self):
        from PIL import Image
        buffer=io.BytesIO(); Image.new('RGB',(16,12),(10,20,30)).save(buffer,'PNG')
        image={'id':'actual','width':16,'height':12,'dataUrl':'data:image/png;base64,'+base64.b64encode(buffer.getvalue()).decode()}
        with tempfile.TemporaryDirectory() as temporary:
            base=Path(temporary); originals=base/'originals';originals.mkdir()
            resident={'root':originals,'decoded':OrderedDict(),'decodeHits':0,'decodeMisses':0,'environment':None}
            request={'runId':'first','artifactMode':'inspection','images':[image],
                'expectedOutputs':[{'id':'pixels','type':'image','role':'result'}], 'inspectionRasterOutputs':['pixels'],
                'code':"with step('actual'):\n    save_image('pixels', image)\n    image[:]=0\n    save_json('facts',{'actual':42})\nresult={'sumAfter':int(image.sum())}\n"}
            first=base/'first';first.mkdir()
            payload=runtime.execute(None,first,resident,request_data=request)
            report=payload['report'];self.assertEqual(report['status'],'SUCCEEDED',report.get('error'))
            self.assertEqual(report['result'],{'sumAfter':0})
            self.assertEqual(json.loads(payload['artifacts']['facts']),{'actual':42})
            self.assertEqual(payload['artifacts']['pixels'][:3],bytes([30,20,10]))
            self.assertTrue(resident['liveImages']['pixels'].startswith(b'BM'))
            self.assertFalse((first/'result.json').exists())
            self.assertFalse((first/'stdout.log').exists())
            self.assertFalse(list((first/'outputs').iterdir()))
            artifact=next(a for a in report['artifacts'] if a['id']=='pixels')
            next_request={**request,'runId':'second','expectedOutputs':[],
                'upstream':{'previous':{'runId':'first','artifact':artifact}},
                'code':"result={'pixel':upstream['previous']['image'][0,0].tolist()}\nupstream['previous']['image'][:]=0\n"}
            second=base/'second';second.mkdir()
            again=runtime.execute(None,second,resident,request_data=next_request)['report']
            self.assertEqual(again['result'],{'pixel':[30,20,10]})
            self.assertEqual(resident['artifacts'][('first','pixels')][:3],bytes([30,20,10]))
            third=base/'third';third.mkdir()
            next_request['upstream']['previous']['runId']='unrelated-run'
            invalid=runtime.execute(None,third,resident,request_data=next_request)['report']
            self.assertEqual(invalid['status'],'FAILED')
            self.assertIn('workpiece session',invalid['error']['message'])

    def test_nested_sdk_clock_keeps_user_callbacks(self):
        clock=runtime.SDKClock()
        @clock.wrap
        def callback():
            time.sleep(.02)
            clock.user(lambda:time.sleep(.06))
            with clock.service():time.sleep(.02)
        start=time.perf_counter();callback();elapsed=time.perf_counter()-start
        self.assertGreaterEqual(clock.seconds,.035)
        self.assertGreaterEqual(elapsed-clock.seconds,.05)
        self.assertLess(clock.seconds,elapsed-.04)
        self.assertAlmostEqual(sum(clock.services.values()),clock.seconds*1000)
        self.assertEqual(set(clock.services),{'callback'})

    def test_service_breakdown_is_exclusive_across_user_callbacks(self):
        ticks=[0.0]
        clock=runtime.SDKClock()
        def user():
            ticks[0]+=5
            with clock.service('inner'):ticks[0]+=2
            ticks[0]+=3
        with patch.object(runtime.time,'perf_counter',side_effect=lambda:ticks[0]):
            with clock.service('outer'):
                ticks[0]+=1
                clock.user(user)
                ticks[0]+=4
        self.assertEqual(clock.seconds,7)
        self.assertEqual(clock.services,{'outer':5000,'inner':2000})

if __name__=='__main__':unittest.main()
