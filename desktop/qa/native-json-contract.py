"""Exact SDK JSON byte compatibility, including CPython float spelling."""
import copy, importlib.util, json, math, random, struct, unittest
from types import SimpleNamespace
from pathlib import Path
spec=importlib.util.spec_from_file_location('runtime',Path(__file__).resolve().parents[1]/'scripts/cv-runtime.py')
runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)

def decode_wire_independently(data):
    """Test oracle using Python struct/json, independent of production Rust."""
    assert data[:5] == b'ACVR\x01'
    position = 5
    def take(size):
        nonlocal position
        result = data[position:position+size]
        assert len(result) == size
        position += size
        return result
    def length():return struct.unpack('<I',take(4))[0]
    def text():return take(length()).decode('utf8')
    def value():
        tag=take(1)[0]
        if tag<3:return [None,False,True][tag]
        if tag in (3,4,5):return struct.unpack({3:'<q',4:'<Q',5:'<d'}[tag],take(8))[0]
        if tag==6:return text()
        if tag==7:return [value() for _ in range(length())]
        if tag==8:
            result={}
            for _ in range(length()):
                key=text();result[key]=value()
            return result
        if tag==9:return json.loads(text())
        raise AssertionError(tag)
    result=value()
    assert position==len(data)
    return result

class NativeJson(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(runtime.NATIVE_JSON,runtime.NATIVE_JSON_ERROR or 'Build native-json helper before testing')

    def equal_bytes(self,value):
        expected=(runtime.compact_json_fallback(value)+'\n').encode('utf-8')
        self.assertEqual(runtime.compact_json_bytes(value),expected)

    def test_scalar_leaf_dictionary_snapshots_preserve_types_order_and_alias_isolation(self):
        leaf = {"text":"检测", "none":None, "bool":True, "integer":2**100, "float":1.5, "negativeZero":-0.0}
        for normalize, fallback in [(runtime.NATIVE_JSON.normalize,runtime.json_value_python),
                                    (runtime.NATIVE_JSON.normalize_trace,runtime.trace_value_python)]:
            result=normalize([leaf,leaf],fallback)
            self.assertEqual(result,[leaf,leaf]);self.assertIsNot(result[0],leaf);self.assertIsNot(result[0],result[1])
            self.assertEqual(list(result[0]),list(leaf));self.assertEqual(math.copysign(1,result[0]['negativeZero']),-1)
            result[0]['integer']=3;self.assertEqual(result[1]['integer'],2**100)
            for sequence in [list(leaf.values()),tuple(leaf.values())]:
                copies=normalize([sequence,sequence],fallback)
                self.assertEqual(copies,[list(sequence),list(sequence)])
                self.assertIsNot(copies[0],sequence);self.assertIsNot(copies[0],copies[1])
                copies[0][0]='changed';self.assertEqual(copies[1][0],'检测')
            unusual={1:'first','1':'last','nonfinite':float('nan'),'nested':{'x':1}}
            self.assertEqual(normalize(unusual,fallback),fallback(unusual))

    def test_per_run_float_cache_keeps_exact_bytes_after_mutation_failure_and_reentry(self):
        native=runtime.NATIVE_JSON;cache=native.EncodingCache()
        rng=random.Random(20261113)
        values=[struct.unpack('d',rng.getrandbits(64).to_bytes(8,'little'))[0] for _ in range(20000)]
        for value in [values,list(reversed(values)),[0.0,-0.0,1e-7,1e20],{'mutable':[1.5,2.5]}]:
            expected=(runtime.compact_json_fallback(value)+'\n').encode()
            self.assertEqual(native.encode(value,runtime.compact_json_fallback,cache),expected)
        marker=object()
        def nested(value):
            self.assertIs(value,marker)
            self.assertEqual(native.encode([-0.0,7.5],runtime.compact_json_fallback,cache),b'[-0.0,7.5]\n')
            return '{"ok":true}'
        self.assertEqual(native.encode([1.5,marker,1.5],nested,cache),b'[1.5,{"ok":true},1.5]\n')
        def fail(value):raise ValueError('expected fallback failure')
        with self.assertRaisesRegex(ValueError,'expected fallback failure'):native.encode([1.5,marker],fail,cache)
        data={'mutable':[1.5,2.5]};before=native.encode(data,runtime.compact_json_fallback,cache);data['mutable'][0]=9.5
        self.assertNotEqual(native.encode(data,runtime.compact_json_fallback,cache),before)
        self.assertEqual(native.encode(data,runtime.compact_json_fallback,cache),(runtime.compact_json_fallback(data)+'\n').encode())

    def test_fixed_decimal_fast_path_matches_python_at_boundaries_and_dense_mantissas(self):
        rng=random.Random(20261114)
        values=[0.0,-0.0]
        for exponent in range(-14,54):
            for _ in range(1000):
                bits=((exponent+1023)<<52)|rng.getrandbits(52)
                value=struct.unpack('d',struct.pack('Q',bits))[0]
                values.extend([value,-value])
        for exponent in range(-4,17):
            value=10.0**exponent
            values.extend([value,-value,math.nextafter(value,0.0),math.nextafter(value,math.inf)])
        self.equal_bytes(values)
        self.equal_bytes(list(reversed(values)))

    def test_random_float_bits_and_extremes(self):
        rng=random.Random(20261112)
        values=[struct.unpack('d',rng.getrandbits(64).to_bytes(8,'little'))[0] for _ in range(20000)]
        values += [0.0,-0.0,1.0,1e-7,1e20,float('nan'),float('inf'),-float('inf'),math.nextafter(0.0,1.0)]
        self.equal_bytes(values)
        self.equal_bytes([value for value in values[:100] for _ in range(50)])

    def test_unicode_controls_containers_and_key_collisions(self):
        self.equal_bytes({'text':'检测🦀\\\"\n'+''.join(chr(c) for c in range(128))+'\u2028\u2029','items':(None,True,False,2**100,-2**100)})
        self.equal_bytes({1:'overwritten','1':'actual',None:[-0.0,True],False:{4:'value'}})
        value={'leaf':3}
        self.equal_bytes([value,value])
        deep=1
        for _ in range(80):deep=[deep]
        self.equal_bytes(deep)

    def test_integer_encoding_signed_unsigned_and_unbounded_boundaries(self):
        values = [sign * (2**bits + delta)
                  for bits in (0, 7, 31, 32, 53, 63, 64, 65, 127, 1024)
                  for delta in (-1, 0, 1) for sign in (-1, 1)]
        self.equal_bytes(values)
        self.assertEqual(runtime.NATIVE_JSON.encode_report(values, runtime.report_json_fallback),
                         runtime.report_json_fallback(values).encode('utf-8'))

    def test_numpy_and_custom_normalization(self):
        import numpy as np
        class Key(str):
            def __str__(self):return 'custom-key'
        class Mapping(dict):
            def items(self):return {'override':np.int64(7)}.items()
        class Converted:
            def tolist(self):return {'array':[np.float32(1.25),float('nan')]}
        self.equal_bytes({'array':np.array([[1.,np.nan]]),'scalar':np.uint16(3),'key':{Key('old'):3},'mapping':Mapping(ignored=4),'custom':Converted()})

    def test_unsupported_cycles_and_surrogates_keep_failures(self):
        for value in [{'unsupported':object()}, {'text':'\ud800'}]:
            with self.subTest(value=repr(value)):
                with self.assertRaises((TypeError,UnicodeEncodeError)):runtime.compact_json_bytes(value)
        cyclic=[];cyclic.append(cyclic)
        with self.assertRaises(RecursionError):runtime.compact_json_bytes(cyclic)

    def test_real_execution_facts_and_snapshot_isolation(self):
        fixture=Path(__file__).parent/'fixtures/execution-facts-record.json'
        value=json.loads(fixture.read_bytes());self.equal_bytes(value)
        data={'mutable':[1,2,3]};before=runtime.compact_json_bytes(data);data['mutable'][0]=99
        self.assertEqual(before,b'{"mutable":[1,2,3]}\n')
        self.assertNotEqual(runtime.compact_json_bytes(data),before)

    def test_report_encoding_preserves_strict_standard_json_semantics(self):
        rng=random.Random(2026111204)
        values=[struct.unpack('d',rng.getrandbits(64).to_bytes(8,'little'))[0] for _ in range(20000)]
        values=[value for value in values if math.isfinite(value)]
        fixture=json.loads((Path(__file__).parent/'fixtures/execution-facts-record.json').read_bytes())
        for value in [values,fixture,{'text':'检测🦀\n\u2028\u2029','shared':[fixture,fixture]},
                      {1:'first','1':'second',None:True,False:False},(None,True,False,2**100,-0.0)]:
            with self.subTest(kind=type(value).__name__):
                self.assertEqual(runtime.report_json_bytes(value),runtime.report_json_fallback(value).encode('utf-8'))
        class Converted:
            def tolist(self):return [1,2,3]
        for value in [float('nan'),float('inf'),-float('inf'),{'nested':[float('nan')]},
                      {'unsupported':Converted()},{'text':'\ud800'}]:
            with self.subTest(invalid=repr(value)):
                with self.assertRaises((ValueError,TypeError,UnicodeEncodeError)):runtime.report_json_bytes(value)
        cyclic=[];cyclic.append(cyclic)
        with self.assertRaises((ValueError,RecursionError)):runtime.report_json_bytes(cyclic)
        # Optional-helper fallback retains the same strict transport contract.
        helper=runtime.NATIVE_JSON
        try:
            runtime.NATIVE_JSON=None
            self.assertEqual(runtime.report_json_bytes(fixture),runtime.report_json_fallback(fixture).encode('utf-8'))
            with self.assertRaises(ValueError):runtime.report_json_bytes({'value':float('nan')})
        finally:runtime.NATIVE_JSON=helper

    def test_native_snapshots_match_python_with_detached_mutable_children(self):
        import numpy as np
        class Text(str):
            def __str__(self):return 'custom-key'
        class Mapping(dict):
            def items(self):return {'override':np.int64(7)}.items()
        class Sequence(list):
            def __iter__(self):return iter([np.float64(-0.0),float('nan')])
        class Converted:
            def tolist(self):return {'array':[np.float32(1.25),float('nan')]}
        shared={'coordinates':[1.,-0.0,2**100]}
        fixture=json.loads((Path(__file__).parent/'fixtures/execution-facts-record.json').read_bytes())
        values=[fixture,{'shared':[shared,shared],'array':np.arange(24,dtype=np.uint16).reshape(2,3,4),
                         'scalar':np.float64(-0.0),'tuple':(None,True,False),'text':'\ud800\n\u2028',
                         'keys':{Text('old'):3,1:'overwritten','1':'last'},
                         'mapping':Mapping(ignored=4),'list':Sequence([99]),'custom':Converted()},
                [float('nan'),float('inf'),-float('inf')]]
        for value in values:
            with self.subTest(kind=type(value).__name__):
                actual=runtime.json_value(value);expected=runtime.json_value_python(value)
                self.assertEqual(json.dumps(actual,ensure_ascii=True,allow_nan=False),json.dumps(expected,ensure_ascii=True,allow_nan=False))
        actual=runtime.json_value([shared,shared]);actual[0]['coordinates'][0]=99
        self.assertEqual(actual[1]['coordinates'][0],1.)
        self.assertEqual(shared['coordinates'][0],1.)
        deep={'value':1}
        for _ in range(80):deep=[deep]
        self.assertEqual(runtime.json_value(deep),runtime.json_value_python(deep))
        for value in [object(),{'unsupported':object()}]:
            with self.assertRaises(TypeError):runtime.json_value(value)
        cyclic=[];cyclic.append(cyclic)
        with self.assertRaises(RecursionError):runtime.json_value(cyclic)
        class Integer(int):pass
        integer=Integer(4)
        self.assertIs(runtime.json_value(integer),integer)
        helper=runtime.NATIVE_JSON
        try:
            runtime.NATIVE_JSON=None
            self.assertEqual(runtime.json_value(fixture),runtime.json_value_python(fixture))
        finally:runtime.NATIVE_JSON=helper

    def test_typed_report_complete_values_float_bits_and_fallback_semantics(self):
        rng=random.Random(2026111205)
        numbers=[struct.unpack('<d',rng.getrandbits(64).to_bytes(8,'little'))[0] for _ in range(20000)]
        numbers=[n for n in numbers if math.isfinite(n)]
        numbers += [0.0,-0.0,math.nextafter(0.0,1.0),float.fromhex('0x1.fffffffffffffp+1023')]
        class Integer(int):pass
        class Sequence(list):pass
        class Mapping(dict):pass
        deep=None
        for _ in range(80):deep=[deep]
        fixture=json.loads((Path(__file__).parent/'fixtures/execution-facts-record.json').read_bytes())
        values=[numbers,fixture,{'order':'first','unicode':'检测🦀\n\u2028'+''.join(chr(i) for i in range(128)),
                                'tuple':(None,True,False,-2**63,2**63-1,2**63,2**64-1,2**64,-2**100,2**100)},
                {1:'first','1':'last',None:True,False:False},deep,
                Mapping(sequence=Sequence([Integer(3),-0.0]))]
        for item in values:
            encoded,encoding=runtime.report_transport_bytes(item,'agentcv-typed-report-v1')
            self.assertEqual(encoding,'agentcv-typed-report-v1')
            actual=decode_wire_independently(encoded)
            expected=json.loads(runtime.report_json_fallback(item))
            # Python's serializer distinguishes int/float and preserves -0.0.
            self.assertEqual(json.dumps(actual,ensure_ascii=False,allow_nan=False),json.dumps(expected,ensure_ascii=False,allow_nan=False))
        actual=decode_wire_independently(runtime.report_transport_bytes(numbers,'agentcv-typed-report-v1')[0])
        self.assertEqual([struct.pack('<d',n) for n in actual],[struct.pack('<d',n) for n in numbers])

    def test_typed_report_negotiation_bounds_and_invalid_values(self):
        fixture={'value':[1,2.0,-0.0]}
        for negotiation in [None,'json-utf8','unknown']:
            payload,encoding=runtime.report_transport_bytes(fixture,negotiation)
            self.assertEqual((payload,encoding),(runtime.report_json_bytes(fixture),'json-utf8'))
        # The conservative typed allocation bound must fall back for legitimate
        # strict JSON that still fits the original 32MiB frame contract.
        large={'text':'a'*(6*1024*1024)}
        payload,encoding=runtime.report_transport_bytes(large,'agentcv-typed-report-v1')
        self.assertEqual(encoding,'json-utf8')
        self.assertEqual(payload,runtime.report_json_fallback(large).encode('utf8'))
        helper=runtime.NATIVE_JSON
        try:
            runtime.NATIVE_JSON=None
            self.assertEqual(runtime.report_transport_bytes(fixture,'agentcv-typed-report-v1'),
                             (runtime.report_json_fallback(fixture).encode('utf8'),'json-utf8'))
        finally:runtime.NATIVE_JSON=helper
        cyclic=[];cyclic.append(cyclic)
        for item in [float('nan'),float('inf'),-float('inf'),{'bad':[float('nan')]},object(),{'text':'\ud800'},cyclic]:
            with self.subTest(value=repr(item)):
                with self.assertRaises((ValueError,TypeError,UnicodeEncodeError,RecursionError)):
                    runtime.report_transport_bytes(item,'agentcv-typed-report-v1')

    def test_typed_report_propagates_user_value_error_without_retry(self):
        class ChangesAfterError(dict):
            calls=0
            def items(self):
                self.calls+=1
                if self.calls==1:raise ValueError('user mapping rejected')
                return {'unexpected':'second invocation must not happen'}.items()
        value=ChangesAfterError(value=3)
        with self.assertRaisesRegex(ValueError,'user mapping rejected'):
            runtime.report_transport_bytes(value,'agentcv-typed-report-v1')
        self.assertEqual(value.calls,1)

    def test_native_trace_snapshots_keep_array_and_long_sequence_contracts(self):
        import numpy as np
        fixture=json.loads((Path(__file__).parent/'fixtures/execution-facts-record.json').read_bytes())
        values=[fixture,{'nested':[[{'point':{'x':-0.0,'y':3.}}]]},
                {'pixels':np.arange(12,dtype=np.uint16).reshape(3,4),'scalar':np.float32(1.25)},
                [dict(x=i,y=-0.0) for i in range(1025)],tuple(range(1024))]
        for value in values:
            with self.subTest(kind=type(value).__name__):
                self.assertEqual(runtime.trace_value(value),runtime.trace_value_python(value))
        shared={'points':[[1,2],[3,4]]};actual=runtime.trace_value([shared,shared])
        actual[0]['points'][0][0]=99
        self.assertEqual(actual[1]['points'][0][0],1)
        self.assertEqual(shared['points'][0][0],1)
        cyclic={};cyclic['self']=cyclic
        with self.assertRaises(RecursionError):runtime.trace_value(cyclic)

    def test_native_preview_pixels_match_opencv_for_depth_channels_and_row_padding(self):
        import cv2, numpy as np, io
        from PIL import Image
        for width in [1,3,4,7]:
            for channels in [1,3,4]:
                for dtype in [np.uint8,np.uint16]:
                    with self.subTest(width=width,channels=channels,dtype=dtype):
                        shape=(5,width) if channels==1 else (5,width,channels)
                        pixels=np.arange(np.prod(shape),dtype=dtype).reshape(shape)*(1 if dtype==np.uint8 else 1025)
                        native=runtime.NATIVE_JSON.preview_bmp(pixels.tobytes(),width,5,channels,np.dtype(dtype).itemsize)
                        shown=pixels if dtype==np.uint8 else (pixels>>8).astype(np.uint8)
                        if channels==4:shown=cv2.cvtColor(shown,cv2.COLOR_BGRA2BGR)
                        ok,old=cv2.imencode('.bmp',shown);self.assertTrue(ok)
                        with Image.open(io.BytesIO(native)) as actual,Image.open(io.BytesIO(old.tobytes())) as expected:
                            self.assertEqual(actual.size,expected.size)
                            self.assertEqual(actual.convert('RGB').tobytes(),expected.convert('RGB').tobytes())
        for args in [(b'',0,1,1,1),(b'x',1,1,3,1),(b'x',1,1,1,4)]:
            with self.assertRaises(ValueError):runtime.NATIVE_JSON.preview_bmp(*args)

    def test_native_preview_owns_exact_initialized_bytes_after_source_changes(self):
        import numpy as np
        helper=runtime.NATIVE_JSON
        for channels in [1,3,4]:
            for depth in [1,2]:
                width,height=3,2
                dtype=np.uint8 if depth==1 else np.dtype('<u2')
                pixels=np.arange(width*height*channels,dtype=dtype).reshape(height,width,channels)
                if depth==2:pixels*=1025
                raw=pixels.tobytes()
                actual=helper.preview_bmp(raw,width,height,channels,depth)
                self.assertIs(type(actual),bytes)
                output_channels=1 if channels==1 else 3
                stride=(width*output_channels+3)&~3
                offset=1078 if channels==1 else 54
                size=offset+height*stride
                # Independent BMP packing checks every byte, including padding
                # and reserved fields that a pixel-only decode would overlook.
                expected=bytearray(size)
                struct.pack_into('<2sIHHI',expected,0,b'BM',size,0,0,offset)
                struct.pack_into('<IiiHHIIiiII',expected,14,40,width,height,1,output_channels*8,0,0,0,0,0,0)
                if channels==1:
                    for value in range(256):struct.pack_into('4B',expected,54+value*4,value,value,value,0)
                shown=(pixels if depth==1 else pixels>>8).astype(np.uint8)
                for y in range(height):
                    row=shown[y,:,:output_channels].tobytes()
                    start=offset+(height-1-y)*stride
                    expected[start:start+len(row)]=row
                self.assertEqual(actual,bytes(expected))
                pixels.fill(255)
                helper.preview_bmp(pixels.tobytes(),width,height,channels,depth)
                self.assertEqual(actual,bytes(expected))

    def test_native_point_fast_path_is_conservative(self):
        helper=runtime.NATIVE_JSON
        class Integer(int):pass
        class Number(float):pass
        class Mapping(dict):pass
        class Sequence(list):pass
        self.assertTrue(helper.layer_points_valid([dict(x=-2**63,y=2**64-1),dict(x=-0.0,y=1.25)]))
        for points in [None,(),Sequence([dict(x=1,y=2)]),[Mapping(x=1,y=2)],
                       [dict(x=True,y=2)],[dict(x=1)],[None],
                       [dict(x=2**64,y=0)],[dict(x=-2**63-1,y=0)],
                       [dict(x=Integer(1),y=0)],[dict(x=Number(1),y=0)],
                       [dict(x=float('nan'),y=0)],[dict(x=float('inf'),y=0)]]:
            with self.subTest(points=repr(points)):
                self.assertFalse(helper.layer_points_valid(points))

    def test_structured_layers_native_points_preserve_full_values_and_errors(self):
        helper=runtime.NATIVE_JSON
        class OriginalPointValidation:
            def __getattr__(self,name):return getattr(helper,name)
            def layer_points_valid(self,value):return False
        trace=SimpleNamespace(stack=[],data={'nodes':[{'id':'actual','instanceId':'actual#1','status':'COMPLETED'}]})
        images=[{'id':'camera'}]
        def outcome(layers,backend,existing=()):
            runtime.NATIVE_JSON=backend
            try:
                return ('value',json.dumps(runtime.validate_structured_layers(copy.deepcopy(layers),images,trace,existing),ensure_ascii=True,allow_nan=False))
            except Exception as error:
                return ('error',type(error),str(error),getattr(error,'details',None))
            finally:runtime.NATIVE_JSON=helper
        def layers(kind,points):
            geometry={'points':points}
            if kind=='measurement':geometry.update(value=1.25,unit='px')
            if kind=='note':geometry['text']='检测'
            return [dict(id='layer',imageId='camera',stepId='actual',objects=[dict(id='object',type=kind,geometry=geometry)])]
        cases=[]
        for kind,count in [('roi',3),('blob',3),('polyline',2),('line',2),('measurement',1),('note',1)]:
            valid=[dict(x=i,y=-0.0) for i in range(count)]
            cases += [layers(kind,valid),layers(kind,valid[:-1]),layers(kind,None),layers(kind,{})]
            for coordinate in [None,True,'1',float('nan'),float('inf'),-float('inf'),2**100,-2**100,2**2000,-2**2000]:
                points=copy.deepcopy(valid);points[-1]['y']=coordinate
                cases.append(layers(kind,points))
            points=copy.deepcopy(valid);del points[-1]['x'];cases.append(layers(kind,points))
            points=copy.deepcopy(valid);points[-1]=[];cases.append(layers(kind,points))
        cases += [layers('line',[dict(x=1,y=2)]*3),layers('roi',[dict(x=i,y=1.25) for i in range(100000)]),
                  layers('roi',[dict(x=0,y=0)]*100001)]
        class Integer(int):pass
        class Number(float):pass
        class Mapping(dict):pass
        class Sequence(list):pass
        class Converted:
            def tolist(self):return 1.25
        cases.append(layers('polyline',Sequence([Mapping(x=Integer(1),y=Number(-0.0)),dict(x=Converted(),y=2)])))
        wrong_source=layers('line',[dict(x=0,y=0)]*2);wrong_source[0]['sourceId']='invented';cases.append(wrong_source)
        wrong_step=copy.deepcopy(wrong_source);wrong_step[0].pop('sourceId');wrong_step[0]['stepId']='missing';cases.append(wrong_step)
        wrong_frame=layers('line',[dict(x=0,y=0)]*2);wrong_frame[0]['objects'][0]['coordinateSpace']={'imageId':'missing'};cases.append(wrong_frame)
        bad_transform=layers('line',[dict(x=0,y=0)]*2);bad_transform[0]['objects'][0]['coordinateSpace']={'imageId':'camera','transform':[0]*6};cases.append(bad_transform)
        # Compare the complete contract, with native normalization held constant,
        # and with the fully optional native helper absent.
        for index,case in enumerate(cases):
            with self.subTest(index=index):
                expected=outcome(case,OriginalPointValidation())
                self.assertEqual(outcome(case,helper),expected)
                self.assertEqual(outcome(case,None),expected)
        malformed=layers('line',[dict(x=0,y=0),dict(x=1,y=True)])
        error=outcome(malformed,helper)
        self.assertEqual(error[3]['path'],'structuredLayers[0].objects[0].geometry.points[1]')
        self.assertEqual(outcome(layers('line',[dict(x=0,y=0)]*2),helper,('layer',))[3]['path'],'structuredLayers[0].id')

if __name__=='__main__':unittest.main()
