const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const {w,$,snapshot,errors,root}=require('./dom-harness.cjs');
(async()=>{
 const html=fs.readFileSync(path.join(root,'review-workpiece.html'),'utf8'),payload=html.match(/<script type="application\/json" id="preparedProject">([\s\S]*?)<\/script>/)[1];
 const data=JSON.parse(payload);assert.equal(data.images.length,1);assert.equal(data.config.tolerances.length,0);assert.equal(data.images[0].result.status,'UNKNOWN');
 for(const match of html.matchAll(/<script src="([^"]+)"/g))new vm.Script(fs.readFileSync(path.join(root,match[1]),'utf8'));
 const element=w.document.createElement('script');element.id='preparedProject';element.type='application/json';element.textContent=payload;w.document.body.append(element);
 await w.eval(fs.readFileSync(path.join(root,'assets/review-project.js'),'utf8'));
 const p=snapshot();assert.equal(p.images[0].sha256,data.images[0].sha256);assert.equal($('measureListPane').hidden,false);assert.equal($('measurementList').children.length,2);assert.match($('measurementList').textContent,/995\.713/);assert.match($('measurementList').textContent,/747\.440/);assert.equal($('measurementLayer').querySelectorAll('polygon').length,1);assert.match($('guidanceAction').textContent,/合格範圍/);assert.deepEqual(errors,[]);console.log('PASS prepared page loads exact user pixels, displays both dimensions, preserves no-production-tolerance UNKNOWN and guides to tolerance entry');w.close();
})().catch(e=>{console.error(e);w.close();process.exit(1)});
