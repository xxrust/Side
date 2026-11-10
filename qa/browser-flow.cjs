// Optional native-browser acceptance. Requires Playwright and its Chromium binary.
const path=require('node:path'),assert=require('node:assert/strict');
let playwright;try{playwright=require('playwright')}catch{playwright=require(path.join(process.env.HOME,'.npm/_npx/e41f203b7505f1fb/node_modules/playwright'));}
(async()=>{
 const browser=await playwright.chromium.launch({headless:true,timeout:20000});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('file://'+path.resolve(__dirname,'../workbench.html'));await page.waitForFunction(()=>!!globalThis.AgentCVFlow);
  assert.equal(await page.locator('#emptyImportFiles').isVisible(),true);assert.equal(await page.locator('#emptyImportFolder').isVisible(),true);
  await page.screenshot({path:path.join(__dirname,'workbench-v0.6-empty.png')});
  await page.click('#emptyDemo');await page.waitForFunction(()=>AgentCVFlow.projectData().images.length===3);
  await page.click('#runBatch');await page.waitForFunction(()=>AgentCVFlow.projectData().runs.length===1,{},{timeout:20000});
  const p=await page.evaluate(()=>AgentCVFlow.projectData());assert.deepEqual(p.images.map(i=>i.result.status),['OK','NG','UNKNOWN']);
  const box=await page.locator('#intentCanvas').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  const before=await page.evaluate(({x,y})=>({point:AgentCVViewport.screenPoint(x,y),scale:AgentCVViewport.state().scale}),{x,y});
  await page.mouse.move(x,y);await page.mouse.wheel(0,-200);await page.waitForFunction(s=>AgentCVViewport.state().scale>s,before.scale);
  const after=await page.evaluate(({x,y})=>AgentCVViewport.screenPoint(x,y),{x,y});assert.ok(Math.abs(after.x-before.point.x)<1e-6&&Math.abs(after.y-before.point.y)<1e-6);
  await page.click('[data-step="images"]');await page.locator('.image-edit-button').first().click();await page.fill('#imageDisplayName','現場已知合格');await page.selectOption('#expectedStatus','OK');await page.click('#imageMetadataForm button[type="submit"]');
  assert.equal(await page.locator('.image-select strong').first().textContent(),'現場已知合格');
  await page.click('#skipGuidance');assert.equal(await page.locator('#guidanceBar').isVisible(),false);await page.click('#toggleGuidance');assert.equal(await page.locator('#guidanceBar').isVisible(),true);
  for(const [width,height] of [[1440,900],[1024,640]]){
   await page.setViewportSize({width,height});await page.screenshot({path:path.join(__dirname,`workbench-v0.6-${width}.png`)});
   const bounds=await page.evaluate(()=>{const pane=document.querySelector('#imagesFlow'),p=pane.getBoundingClientRect();return [...pane.children].filter(e=>!e.hidden).map(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,paneTop:p.top,paneBottom:p.bottom};});});
   assert.ok(bounds.every(b=>b.top>=b.paneTop-1&&b.bottom<=b.paneBottom+1),'image controls fit without scrolling');
  }
  assert.deepEqual(errors,[]);console.log('BROWSER FLOW PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
