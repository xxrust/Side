import test from 'node:test';import assert from 'node:assert/strict';
import {Project} from '../src/model.js';import {Workspace} from '../src/workspace.js';
import {projectSnapshot} from '../src/json-snapshot.js';
import {sealProjectExecutionFacts} from '../src/execution-facts.js';

test('event details are a detached observation and undo shares history without sharing mutable project fields',()=>{
 const p=new Project(),detail={parameters:{threshold:3},counts:[1,2]};p.event('observed',detail);const event=p.data.events[0];detail.parameters.threshold=9;detail.counts.push(3);
 assert.equal(event.parameters.threshold,3);assert.deepEqual(event.counts,[1,2]);p.checkpoint();assert.equal(p.undoStack[0].events[0],event);
 p.data.config.revision++;p.event('later');assert.equal(p.undoStack[0].events.length,1);assert.equal(p.undoStack[0].config.revision,1);assert.throws(()=>{event.parameters.threshold=4;},TypeError);
});
test('restored history retains all values and seals only detached events',()=>{
 const event={id:'old',detail:{values:[1,2]}},data={events:[event],images:[]};const before=JSON.stringify(data);sealProjectExecutionFacts(data);assert.equal(JSON.stringify(data),before);assert.notEqual(data.events[0],event);event.detail.values.push(3);assert.deepEqual(data.events[0].detail.values,[1,2]);assert.equal(projectSnapshot(data).events[0],data.events[0]);
});
test('base and workspace reopen retain event identity through subsequent undo snapshots',async()=>{
 for(const Type of [Project,Workspace]){const p=new Type();p.event('saved',{nested:{value:5}});const saved=JSON.parse(p.serialize());const next=new Type();await next.load(saved,()=>{throw Error('empty project must not decode');});next.checkpoint();assert.equal(next.undoStack[0].events[0],next.data.events[0]);assert.equal(next.data.events[0].nested.value,5);}
});
