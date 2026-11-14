import test from 'node:test';
import assert from 'node:assert/strict';
import {installIpcFetchObserver} from './ipc-fetch-observer.mjs';
test('fetch probe preserves receiver, response, bytes and reads once without recording payloads',async()=>{
 const rows=[],api={qaIpcFetch:row=>rows.push(row)},bytes=new ArrayBuffer(10);let reads=0,time=0;
 const response={arrayBuffer(){assert.equal(this,response);reads++;return Promise.resolve(bytes);}};
 const options={headers:{secret:'private'},body:'private'};
 const target={fetch(url,arg){assert.equal(this,target);assert.equal(arg,options);return Promise.resolve(response);}};
 installIpcFetchObserver(api,target,()=>++time);
 assert.equal(await target.fetch('ipc://localhost/execute_inspection_session',options),response);
 assert.equal(await response.arrayBuffer(),bytes);assert.equal(reads,1);
 assert.equal(rows.length,1);assert.equal(rows[0].bytes,10);assert.equal(rows[0].bodyMethod,'arrayBuffer');
 assert.ok(rows[0].startMs<rows[0].headersMs&&rows[0].headersMs<rows[0].bodyStartMs&&rows[0].bodyStartMs<rows[0].bodyEndMs);
 assert.ok(!JSON.stringify(rows).includes('private'));
});
test('unobserved calls retain promise identity; errors are unchanged and stale sinks are ignored',async()=>{
 const failure=Error('failure'),rows=[],api={},promise=Promise.resolve('untouched');
 const target={fetch:()=>promise};installIpcFetchObserver(api,target);
 assert.equal(target.fetch('ipc://localhost/execute_inspection_session'),promise);
 api.qaIpcFetch=row=>rows.push(row);
 assert.equal(target.fetch('https://example.com/execute_inspection_session'),promise);
 assert.equal(target.fetch('ipc://localhost/other'),promise);
 const failing={fetch:()=>Promise.reject(failure)};installIpcFetchObserver(api,failing);
 await assert.rejects(failing.fetch('ipc://localhost/execute_inspection_session'),e=>e===failure);
 assert.equal(rows[0].failedAt,'fetch');
 const response={arrayBuffer:()=>Promise.reject(failure)},body={fetch:()=>Promise.resolve(response)};installIpcFetchObserver(api,body);
 await body.fetch('http://ipc.localhost/execute_inspection_session');api.qaIpcFetch=null;
 await assert.rejects(response.arrayBuffer(),e=>e===failure);assert.equal(rows.length,1);
});
