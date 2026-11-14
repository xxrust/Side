import test from 'node:test';import assert from 'node:assert/strict';
import {Workspace} from '../src/workspace.js';
function project(){const p=new Workspace();p.data.images=[{id:'actual-image',width:1,height:1,objects:[]}];p.data.activeId='actual-image';p.data.purposeScheme={id:'scheme',execution:{unit:'workpiece',referenceInputs:{}},classificationSpec:null};return p;}
test('consultation sync adds missing cards once and undo/redo preserves placement and answers',()=>{
 const p=project(),board=p.ensureProjectCanvas();p.addCanvasSource(board.id,{id:'other',imageIds:['actual-image'],x:40,y:40});
 const before=JSON.stringify(p.data.visualInquiry),undo=p.undoStack.length;
 const created=p.syncCanvasConsultations();assert.equal(created.length,2);assert.equal(p.undoStack.length,undo+1);
 const after=JSON.stringify(p.data.visualInquiry),cards=p.data.visualInquiry.boards.find(b=>b.id===board.id).projectSpaces.cards;
 assert.notEqual(cards[0].y,cards[1].y);assert.deepEqual(cards.map(c=>c.answerHistory),[[],[]]);
 assert.deepEqual(p.syncCanvasConsultations(),[]);assert.equal(JSON.stringify(p.data.visualInquiry),after);assert.equal(p.undoStack.length,undo+1);
 p.undo();assert.equal(JSON.stringify(p.data.visualInquiry),before);p.redo();assert.equal(JSON.stringify(p.data.visualInquiry),after);
});
test('existing cards need no execution-history traversal, but malformed board references still reject',()=>{
 const p=project();p.syncCanvasConsultations();const before=JSON.stringify(p.data.visualInquiry),undo=p.undoStack.length;
 Object.defineProperty(p.data,'datasetExecutions',{configurable:true,get(){throw Error('must not scan execution history');}});
 assert.deepEqual(p.syncCanvasConsultations(),[]);assert.equal(JSON.stringify(p.data.visualInquiry),before);assert.equal(p.undoStack.length,undo);
 p.data.visualInquiry.boards.find(b=>b.projectSpaces).projectSpaces.sources[0].imageIds.push('missing');
 assert.throws(()=>p.syncCanvasConsultations(),/不存在的原件/);
});
