// Integration coverage for the retained pipeline renderer and real raster API.
// This deliberately mounts the component; it is not proof of a removed wizard entrypoint.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs');
export async function createPipelineHarness(){
 const h=await createHarness();
 const host=h.w.document.createElement('section');host.setAttribute('aria-label','Pipeline component integration fixture');h.w.document.body.append(host);
 h.api.pipelineView.mount(host);h.api.project.on(()=>h.api.pipelineView.render());
 return h;
}
export async function importActualExamples(h){
 const root=new URL('../../research/opencv-traditional-10-2026-10-25/assets/',import.meta.url);
 const images=await Promise.all(['stuff.jpg','box_in_scene.png'].map(async name=>({name,dataUrl:`data:image/${name.endsWith('.jpg')?'jpeg':'png'};base64,${(await readFile(new URL(name,root))).toString('base64')}`})));
 await h.api.addImages(images);
}

export async function importNonCircularPixels(h){
 const {workflowFixtures}=require('./workflow-fixtures.cjs');const f=(await workflowFixtures())[0];
 await h.api.addImages([{name:f.name,dataUrl:f.dataURL}]);
}
