import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceExecutionNavigationMethods as methods} from '../src/source-execution-navigation.js';
import {setSourceFilter} from '../src/source-classification-filter.js';

function setup(){
 const source={id:'source',imageIds:['first','reference','next'],autoAdvance:true};
 const p={epoch:1,imageSelection:2,image:{id:'first'},data:{activeId:'first',images:['first','reference','next'].map(id=>({id})),purposeScheme:{execution:{referenceInputs:{template:'reference'}}},visualInquiry:{boards:[{projectSpaces:{sources:[source]}}]}}},loads=[],pins=new Set();
 p.pinImages=ids=>{ids.forEach(id=>pins.add(id));return()=>ids.forEach(id=>pins.delete(id));};
 p.ensureImagePixels=async id=>{loads.push(id);return {image:{}};};
 return {p,source,loads,pins,options:{imageId:'first',sourceId:'source',epoch:1,selectionRevision:2}};
}
test('prepares one non-reference image without selecting it and releases its lease',async()=>{
 const {p,loads,pins,options}=setup(),release=methods.prepareSourceNextImage.call(p,options);
 await Promise.resolve();assert.deepEqual(loads,['next']);assert.deepEqual([...pins],['next']);assert.equal(p.data.activeId,'first');assert.equal(p.imageSelection,2);
 release();release();assert.equal(pins.size,0);
});
test('manual selection, disabled advance, batches, stale selection and filtered scopes do not read',async()=>{
 for(const change of [{autoAdvance:false},{batch:true},{epoch:0},{selectionRevision:1}]){const {p,loads,options}=setup();const release=methods.prepareSourceNextImage.call(p,{...options,...change});await Promise.resolve();assert.deepEqual(loads,[]);release();}
 for(const disabled of ['source','filter','ambiguous']){const {p,source,loads,options}=setup();if(disabled==='source')source.autoAdvance=false;if(disabled==='filter')setSourceFilter(p,'source',{dimension:'labels',value:'missing'});if(disabled==='ambiguous')p.data.visualInquiry.boards.push(p.data.visualInquiry.boards[0]);methods.prepareSourceNextImage.call(p,options);await Promise.resolve();assert.deepEqual(loads,[]);}
});
test('cancellation/project change before dispatch avoids stale reads; a failed read releases the lease',async()=>{
 for(const mode of ['cancel','project']){const {p,loads,pins,options}=setup(),release=methods.prepareSourceNextImage.call(p,options);if(mode==='cancel')release();else p.data={...p.data};await Promise.resolve();assert.deepEqual(loads,[]);assert.equal(pins.size,0);}
 const {p,pins,options}=setup();p.ensureImagePixels=async()=>{throw Error('unreadable image');};const release=methods.prepareSourceNextImage.call(p,options);await new Promise(resolve=>setImmediate(resolve));assert.equal(pins.size,0);assert.equal(p.data.activeId,'first');release();
});
