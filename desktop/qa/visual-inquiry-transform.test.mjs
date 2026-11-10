import test from 'node:test';
import assert from 'node:assert/strict';
import {inquiryWorldAtScreen,inquiryScreenForWorld} from '../src/visual-inquiry-transform.js';

test('visual inquiry rotation keeps screen/world mapping reversible',()=>{
 const view={width:800,height:600,pan:{x:31,y:-17},zoom:1.75,rotation:90};
 const world={x:412,y:263};
 const screen=inquiryScreenForWorld(world,view);
 const restored=inquiryWorldAtScreen(screen,view);
 assert.ok(Math.abs(restored.x-world.x)<1e-9);
 assert.ok(Math.abs(restored.y-world.y)<1e-9);
});

test('visual inquiry rotation preserves nearest-neighbor rendering contract',()=>{
 const view={width:800,height:600,pan:{x:0,y:0},zoom:2,rotation:-90};
 const screen=inquiryScreenForWorld({x:400,y:300},view);
 assert.deepEqual(screen,{x:400,y:300});
});
