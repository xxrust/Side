import {acceptanceQuestions,currentAgreement} from './project-acceptance.js';
import {iconButton} from './ui-icons.js';
import './project-rail-controls.css';
const el=(tag,cls)=>{const n=document.createElement(tag);if(cls)n.className=cls;return n;};
export function mountProjectRail({view,toolbar,commands}){
 document.body.classList.add('canvas-rail-workspace');
 const rail=document.querySelector('.app-rail>.app-header');const brand=toolbar.querySelector('.brand');if(brand)rail.prepend(brand);rail.append(toolbar);
 const files=commands;files.setAttribute('aria-label','專案檔案操作');
 for(const [id,icon,label] of [['newProject','new-project','新專案'],['openProject','folder','開啟專案'],['saveProject','save','保存'],['exportProject','export','匯出']]){const b=document.getElementById(id);if(b)iconButton(b,icon,label);}
 const about=iconButton(el('button'),'info','關於 SIDE');about.type='button';about.onclick=()=>{const d=el('dialog');const title=el('h2');title.textContent='SIDE';const brand=el('p');brand.textContent='橫著走 · Sideways AI';const version=el('p');version.textContent='Desktop · '+(document.querySelector('meta[name="agentcv-version"]')?.content||'版本資訊未提供');const close=el('button');close.textContent='關閉';close.onclick=()=>d.close();d.append(title,brand,version,close);document.body.append(d);d.addEventListener('close',()=>d.remove());d.showModal();};files.append(about);
 const dock=el('nav','project-inspection-controls');dock.setAttribute('aria-label','專案檢測操作');
 for(const [kind,icon,label] of [['statistics','chart','實算統計'],['classification','settings','分類與驗收規格'],['consultation','help','待諮詢']]){const b=iconButton(el('button'),icon,label);b.type='button';b.dataset.projectPanel=kind;b.onclick=()=>view.perform(()=>view.projectCards.openProjectPanel(kind));dock.append(b);}
 const stats=dock.querySelector('[data-project-panel="statistics"]');
 const ns='http://www.w3.org/2000/svg',ring=document.createElementNS(ns,'svg'),stroke=document.createElementNS(ns,'rect');ring.setAttribute('viewBox','0 0 30 28');ring.setAttribute('class','statistics-completion-ring');ring.setAttribute('aria-hidden','true');for(const [key,value] of Object.entries({x:1,y:1,width:28,height:26,rx:6}))stroke.setAttribute(key,value);ring.append(stroke);stats.append(ring);
 let pulseTimer,epoch=view.project.epoch,observed=view.project.data.events?.at(-1)?.id,executionId=null,processed=0;
 const clearPulse=()=>{clearTimeout(pulseTimer);stats.classList.remove('cycle-complete');stats.title='實算統計';};stats.addEventListener('click',clearPulse);
 const stopWatching=view.project.on(()=>{const event=view.project.data.events?.at(-1);if(epoch!==view.project.epoch){epoch=view.project.epoch;observed=event?.id;executionId=null;processed=0;clearPulse();return;}if(!event||event.id===observed)return;observed=event.id;if(event.action!=='dataset_execution_progress')return;if(executionId!==event.executionId){executionId=event.executionId;processed=0;}if(event.processed>processed){processed=event.processed;stats.classList.add('cycle-complete');stats.title='本件週期已完成，查看最新實算統計';clearTimeout(pulseTimer);pulseTimer=setTimeout(clearPulse,4200);}});
 const boardTools=el('div','project-board-controls');boardTools.setAttribute('aria-label','畫板操作');toolbar.append(dock,boardTools);
 const sync=()=>{const history=document.querySelector('.solution-version-entry');if(history&&history.parentElement!==dock)dock.append(history);const heading=view.panel.querySelector('.inquiry-heading');if(heading){heading.querySelector('h2')?.remove();boardTools.replaceChildren(heading);}
  const exec=document.querySelector('.flow-execution-controls');if(exec&&exec.parentElement!==toolbar)toolbar.insertBefore(exec,dock);
  const state=document.getElementById('openPurposeScheme');if(state&&state.parentElement!==toolbar)toolbar.insertBefore(state,dock);
  const count=view.projectCards.spaces().cards?.filter(c=>c.kind==='consultation').flatMap(c=>view.projectCards.consultations(c)).filter(q=>q.status!=='APPLIED').length||0;
  const ask=dock.querySelector('[data-project-panel="consultation"]');ask.dataset.count=count||'';ask.classList.toggle('needs-answer',count>0);ask.setAttribute('aria-label',count?`待諮詢：${count} 項需處理`:'待諮詢');
  const acceptance=dock.querySelector('[data-project-panel="classification"]'),missing=view.project.data.acceptanceWorkspace?acceptanceQuestions(view.project).length+(currentAgreement(view.project)?0:1):0;acceptance.dataset.count=missing||'';acceptance.classList.toggle('needs-answer',missing>0);acceptance.title=missing?'分類與驗收規格：有待確認事項':'分類與驗收規格';
  view.projectCards.refreshProjectPanel();
 };
 view.onChromeRendered=sync;return {sync,destroy(){stopWatching();clearPulse();}};
}
