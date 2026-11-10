import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveWorkpieceExpected} from '../src/workpiece-expected-label.js';
import {sourceImageLabels} from '../src/source-image-labels.js';

function project(){
 const image={id:'img-1',name:'良品_01.bmp',sourceMeaning:{actor:'human',taskId:'import-1',relativePath:'良品/良品_01.bmp',fields:{category:'良品'}}};
 return {data:{images:[image],purposeScheme:{id:'scheme',classificationSpec:{id:'spec',categories:[{id:'GOOD',label:'良品',quality:'good'}]},execution:{referenceInputs:{}}},visualInquiry:{boards:[{projectSpaces:{sources:[{id:'source',imageIds:['img-1']}]}}]},datasetExecutions:[]},imageRecord(id){return this.data.images.find(image=>image.id===id);}};
}

test('human source category resolves as expected without applyLabels duplication',()=>{
 const p=project(),resolved=resolveWorkpieceExpected(p,{id:'unit-1',imageIds:['img-1']});
 assert.deepEqual(resolved.expected.categoryIds,['GOOD']);
 assert.equal(resolved.origin.kind,'image-source-meaning');
 const labels=sourceImageLabels(p,'img-1','source');
 assert.equal(labels.manual.status,'LABELLED');
 assert.deepEqual(labels.manual.categoryIds,['GOOD']);
});

test('human source category absent from the scheme is explicit mapping debt, not unlabelled data',()=>{
 const p=project();p.data.images[0].name='未焊_01.bmp';p.data.images[0].sourceMeaning.fields.category='未焊';
 const resolved=resolveWorkpieceExpected(p,{id:'unit-1',imageIds:['img-1']});
 assert.equal(resolved.expected,null);
 assert.equal(resolved.reason,'EXPECTED_SOURCE_LABEL_UNMAPPED');
 const labels=sourceImageLabels(p,'img-1','source');
 assert.equal(labels.manual.status,'NEEDS_MAPPING');
 assert.equal(labels.manual.text,'未焊');
});
