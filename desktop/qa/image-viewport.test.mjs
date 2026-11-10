import test from 'node:test';
import assert from 'node:assert/strict';
import {fitImageView,zoomImageView,rotateImageView,screenToImage,imageToScreen,panImageView} from '../src/image-viewport.js';
const dims={width:800,height:600,imageWidth:1600,imageHeight:1200};
test('zoom keeps the pixel under the mouse fixed',()=>{const v=fitImageView(dims),anchor={x:227,y:183},pixel=screenToImage(v,anchor,dims),z=zoomImageView(v,3,anchor,dims);const after=screenToImage(z,anchor,dims);assert.ok(Math.abs(after.x-pixel.x)<1e-9);assert.ok(Math.abs(after.y-pixel.y)<1e-9);});
test('rotation is reversible and preserves an anchored pixel',()=>{const v=fitImageView(dims),anchor={x:620,y:130},pixel=screenToImage(v,anchor,dims),r=rotateImageView(v,90,anchor,dims),after=screenToImage(r,anchor,dims);assert.equal(r.rotation,90);assert.ok(Math.abs(after.x-pixel.x)<1e-9);assert.ok(Math.abs(after.y-pixel.y)<1e-9);assert.deepEqual(screenToImage(r,imageToScreen(r,{x:400,y:300},dims),dims),{x:400,y:300});});
test('pan changes only view coordinates',()=>{const v=fitImageView(dims),p=panImageView(v,13,-7);assert.deepEqual(screenToImage(p,{x:400+13,y:300-7},dims),screenToImage(v,{x:400,y:300},dims));});
