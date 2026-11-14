import test from 'node:test';
import assert from 'node:assert/strict';
import {beginPendingInputPreparation,pendingInputAllows} from '../src/pending-input-preparation.js';
const hash='a'.repeat(64),pixels='b'.repeat(64);
function fixture(){const record={id:'one',width:2,height:3,sha256:pixels,contentSha256:hash,assetRef:{root:'/owned', $asset:`assets/${hash}.png`,mime:'image/png',sha256:hash,size:10}};const p={epoch:1,data:{},imageRecord:()=>record};return {p,record};}
test('only an unchanged project-owned file record can use a live metadata capability',()=>{
 const {p,record}=fixture(),lease=beginPendingInputPreparation(p,['one']);assert(lease);assert.equal(pendingInputAllows(p,{},record),false);assert(pendingInputAllows(p,lease.token,record));
 for(const key of ['width','sha256','contentSha256']){const old=record[key];record[key]=key==='width'?9:'c'.repeat(64);assert.equal(pendingInputAllows(p,lease.token,record),false);record[key]=old;}
 p.epoch++;assert.equal(pendingInputAllows(p,lease.token,record),false);p.epoch--;const old=p.data;p.data={};assert.equal(pendingInputAllows(p,lease.token,record),false);p.data=old;
 assert.equal(pendingInputAllows(p,lease.token,{...record}),false);lease.release();assert.equal(pendingInputAllows(p,lease.token,record),false);
});
test('inline, unknown pixel identity, invalid asset and excessive dimensions fall back',()=>{
 for(const change of [r=>r.dataURL='data:image/png;base64,AAA=',r=>delete r.sha256,r=>r.assetRef.size=-1,r=>r.width=100_000_000,r=>r.contentSha256='c'.repeat(64)]){const {p,record}=fixture();change(record);assert.equal(beginPendingInputPreparation(p,['one']),null);}
});
