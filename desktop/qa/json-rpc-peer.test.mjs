import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {JsonRpcPeer} from '../scripts/json-rpc-peer.mjs';

test('RPC routes simultaneous responses by id and rejects calls after disconnect',async()=>{
 const a=new PassThrough(),b=new PassThrough();
 const client=new JsonRpcPeer(b,a);
 const server=new JsonRpcPeer(a,b,{request:async(method,params)=>({method,value:params.value})});
 const replies=await Promise.all([client.call('one',{value:1}),client.call('two',{value:2})]);
 assert.deepEqual(replies,[{method:'one',value:1},{method:'two',value:2}]);
 client.close();server.close();a.end();b.end();
 await assert.rejects(client.call('late',{}),/closed/);
});
test('RPC errors and timeouts reject the caller and release pending entries',async()=>{
 const a=new PassThrough(),b=new PassThrough();
 const client=new JsonRpcPeer(b,a);
 const server=new JsonRpcPeer(a,b,{request:async()=>{throw Object.assign(Error('unsupported'),{code:-32601});}});
 await assert.rejects(client.call('unsupported',{}),/unsupported/);
 assert.equal(client.pending.size,0);
 server.reader.close();
 await assert.rejects(client.call('no-listener',{},10),/timeout/);
 assert.equal(client.pending.size,0);
 client.close();a.end();b.end();
});
