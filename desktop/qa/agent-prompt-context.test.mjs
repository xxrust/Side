import test from 'node:test';import assert from 'node:assert/strict';import {agentPromptContext} from '../src/agent-prompt-context.js';
test('automatic context indexes datasets and histories instead of embedding their full records',()=>{
 const images=Array.from({length:1000},(_,i)=>({id:String(i),name:`source-${i}.bmp`,width:1280,height:1024,sourceMeaning:{notes:'long history'.repeat(100)},dataURL:'data:image/png;base64,hidden'}));
 const c={image:images[0],dataset:{imageCount:1000,images},canvasProject:{boardId:'board',sources:[{id:'source',imageCount:1000,images}],items:images.map(x=>({id:x.id,assetId:x.id,annotationCount:1,source:{extra:'x'.repeat(10000)}}))},programmableAlgorithms:{runs:images.map(x=>({runId:x.id,title:x.name,status:'SUCCEEDED',code:'x'.repeat(10000),artifacts:[]}))}};
 const summary=agentPromptContext(c);assert.equal(summary.dataset.images.length,8);assert.equal(summary.canvasProject.items.length,16);assert.equal(summary.programmableAlgorithms.runs.length,5);assert.equal(summary.dataset.imageCount,1000);assert.equal(summary.canvasProject.itemCount,1000);assert.equal(c.dataset.images.length,1000);assert.ok(JSON.stringify(summary).length<16000);
 assert.equal(summary.canvasProject.read,'get_canvas_project_context');assert.equal(summary.programmableAlgorithms.context,'get_algorithm_context');
});

test('explicit question references survive automatic project summarization in full',()=>{
 // Declared graph structure and user-selected table content, not computed CV results.
 const graph={selectedNodeId:'node-27',nodes:Array.from({length:40},(_,i)=>({id:'node-'+i,title:'步驟 '+i})),edges:Array.from({length:39},(_,i)=>({from:'node-'+i,to:'node-'+(i+1)}))};
 for(const reference of [
  {kind:'program_flow',scope:'node',title:'步驟 27',graph},
  {kind:'chat_sheet',headers:['量測名稱','公差'],rows:[['線距','由工程師確認']]},
  {kind:'visual_inquiry',snapshot:{id:'board',items:[{id:'selected-image',annotationCount:2}]}}
 ]){const c={reference},summary=agentPromptContext(c);assert.deepEqual(summary.reference,reference);assert.deepEqual(c.reference,reference);}
 assert.equal(agentPromptContext({reference:null}).reference,undefined);
});
