import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '/Users/liangshiben/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const output=new URL('../../reviews/2026-10-28-visual-library/',import.meta.url);await fs.mkdir(output,{recursive:true});
const bytes=await fs.readFile(new URL('../../research/opencv-traditional-10-2026-10-25/assets/box.png',import.meta.url));
const browser=await chromium.launch({headless:true,executablePath:'/Users/liangshiben/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:1420');
 const first=await page.evaluate(async dataUrl=>{const {createVisualAssetLibrary}=await import('/src/visual-asset-library.js');const library=createVisualAssetLibrary();const a=await library.save({dataUrl,title:'真實OpenCV封面圖',role:'reference',tags:['封面'],provenance:{projectName:'瀏覽器專案A'}});const b=await library.save({dataUrl,title:'跨專案引用',role:'reference',tags:['定位'],provenance:{projectName:'瀏覽器專案B'}});return {id:a.entry.id,created:a.created,deduplicated:b.deduplicated,captures:b.entry.captures.length};},'data:image/png;base64,'+bytes.toString('base64'));
 assert.equal(first.created,true);assert.equal(first.deduplicated,true);assert.equal(first.captures,2);
 await page.reload();
 const result=await page.evaluate(async id=>{const {createVisualAssetLibrary}=await import('/src/visual-asset-library.js');const library=createVisualAssetLibrary(),search=await library.search({query:'瀏覽器專案B'}),asset=await library.get({id});const img=new Image();img.src=asset.dataUrl;await img.decode();return {searchCount:search.total,metadataOnly:!JSON.stringify(search).includes('base64'),loadedWidth:img.naturalWidth,loadedHeight:img.naturalHeight,persistedTitle:asset.entry.title,scope:asset.entry.scope};},first.id);
 const archive=await page.evaluate(async()=>{const {createVisualAssetLibrary}=await import('/src/visual-asset-library.js');const library=createVisualAssetLibrary(),content='<canvas id="reusableScene"></canvas><script>window.visualArchiveExecuted=true;</script><figure><img src="https://example.invalid/not-fetched.png"></figure>';const saved=await library.save({content,mimeType:'text/html',title:'互動canvas圖解原始碼',role:'schematic'}),loaded=await library.get({id:saved.entry.id});return {exactSource:loaded.content===content,executedDuringArchive:window.visualArchiveExecuted===true};});
 assert.equal(archive.exactSource,true);assert.equal(archive.executedDuringArchive,false);
 assert.equal(result.searchCount,1);assert.equal(result.metadataOnly,true);assert.equal(result.loadedWidth,324);assert.equal(result.loadedHeight,223);
 const receipt={status:'PASS',transport:'Real Chromium IndexedDB with actual OpenCV PNG; same-origin reload and decoded pixels, no native mocks.',...first,...result,archive};await fs.writeFile(new URL('indexeddb-verification.json',output),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{await browser.close()}
