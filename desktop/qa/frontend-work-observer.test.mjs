import test from 'node:test';import assert from 'node:assert/strict';
import {installFrontendWorkObserver} from './frontend-work-observer.mjs';
test('QA wrappers preserve receiver, returned promise and exceptions, and are inert without a sink',()=>{
 const promise=Promise.resolve('actual'),failure=Error('actual failure'),events=[];
 const view={value:42,render(){assert.equal(this,view);return this.value;},programFlow:{sync(){throw failure;}},outputView:{refresh(){return promise;}}};
 const api={inquiryView:view,project:{imageStore:{}}};installFrontendWorkObserver(api);
 assert.equal(view.render(),42);assert.equal(view.outputView.refresh(),promise);assert.throws(()=>view.programFlow.sync(),e=>e===failure);assert.equal(events.length,0);
 api.qaFrontendSpan=(name,ms)=>events.push({name,ms});assert.equal(view.render(),42);assert.equal(view.outputView.refresh(),promise);assert.throws(()=>view.programFlow.sync(),e=>e===failure);
 assert.deepEqual(events.map(e=>e.name),['view.render','output.refresh','flow.sync']);assert.ok(events.every(e=>Number.isFinite(e.ms)&&e.ms>=0));
});
test('QA follows replaced output surfaces and does not double-wrap renderer prototypes',()=>{
 const events=[];
 class Renderer{readySource(){return this;}commitSource(){return this;}}
 const surface=()=>({renderer:new Renderer(),input:{prepareReady(){return this;},update(){return this;}}});
 const outputView={surface:surface(),resolveModel(){return this;},frameKey(){return 'key';},target(){return 'node';},refresh(){this.resolveModel();this.frameKey();this.surface.input.prepareReady();this.surface.renderer.readySource();return this.surface;}};
 const api={inquiryView:{programFlow:{},outputView},project:{imageStore:{}},qaFrontendSpan:(name)=>events.push(name)};
 installFrontendWorkObserver(api);
 for(let i=0;i<2;i++){
  outputView.surface=surface();events.length=0;
  assert.equal(outputView.refresh(),outputView.surface);
  assert.deepEqual(events,['output.resolveModel','output.frameKey','input.prepareReady','imageRenderer.readySource','output.refresh']);
 }
});
test('QA observes asynchronous map renders after sync creates or replaces a map',async()=>{
 const events=[];
 const makeMap=()=>({_render(){assert.equal(this,map);return 17;}});
 let map;
 const programFlow={sync(){this.map=map=makeMap();return Promise.resolve().then(()=>this.map._render());}};
 const api={inquiryView:{programFlow,outputView:{}},project:{imageStore:{}},qaFrontendSpan:name=>events.push(name)};
 installFrontendWorkObserver(api);
 for(let i=0;i<2;i++){
  events.length=0;assert.equal(await programFlow.sync(),17);
  assert.deepEqual(events,['flow.sync','flowMap._render']);
 }
});
