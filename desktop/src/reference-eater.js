import {referenceEaterSVG} from './reference-eater-art.js';
import {sideCrabSVG} from './side-crab-art.js';
import './reference-eater.css';

// One passive listener for all cards, one frame per pointer event burst. No
// polling, project mutation, camera movement, or work while cards are hidden.
const visibleEaters=new Set();
let tracking=false,frame=0,lastPointer=null;
const clamp=(n,limit)=>Math.max(-limit,Math.min(limit,n));
function resetGaze(){lastPointer=null;for(const eater of visibleEaters)eater.look(null);}
function track(event){
 if(event.pointerType==='touch'||document.hidden||!visibleEaters.size)return;
 lastPointer={x:event.clientX,y:event.clientY};
 if(frame)return;
 frame=requestAnimationFrame(()=>{frame=0;for(const eater of visibleEaters)eater.look(lastPointer);});
}
function startTracking(){if(tracking)return;tracking=true;document.addEventListener('pointermove',track,{passive:true});window.addEventListener('blur',resetGaze);document.addEventListener('pointerout',event=>{if(!event.relatedTarget)resetGaze()});document.addEventListener('visibilitychange',()=>{if(document.hidden)resetGaze()});}
const copy={
 hungry:['可以分我一口資料嗎？','把圖紙、規格或工件介紹拖到這裡。'],
 ready:['啊——是給我的嗎？','放開檔案，加入這個參考資料空間。'],
 choosing:['我在這裡等你。','選好資料，我就準備開動。'],
 eating:['啊嗚！','正在讀取並保存資料……'],
 happy:['收好了，謝謝你的投餵！','原件已加入專案；解析狀態請看資料內容。'],
 full:['資料已收好','可以繼續拖入，或加入更多資料。'],
 error:['這一口還沒收好。','請再試一次。'],
};
export class ReferenceEater{
 constructor(){
  this.node=document.createElement('div');this.node.className='reference-eater';
  this.creature=document.createElement('div');this.creature.className='creature';
  const prefix='reference-eater-'+crypto.randomUUID()+'-';
  const art=document.body.classList.contains('side-workbench')?sideCrabSVG:referenceEaterSVG;
  this.creature.innerHTML=art.replace(/id="(skin|leaf|blush|inside)"/g,(_,id)=>`id="${prefix}${id}"`).replace(/url\(#(skin|leaf|blush|inside)\)/g,(_,id)=>`url(#${prefix}${id})`);
  this.creature.setAttribute('aria-hidden','true');
  const caption=document.createElement('div');this.heading=document.createElement('strong');this.note=document.createElement('p');caption.append(this.heading,this.note);caption.setAttribute('role','status');caption.setAttribute('aria-live','polite');
  this.node.append(this.creature,caption);this.reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  this.observer=typeof IntersectionObserver!=='undefined'?new IntersectionObserver(entries=>{for(const entry of entries){this.node.dataset.offscreen=String(!entry.isIntersecting);if(entry.isIntersecting)visibleEaters.add(this);else visibleEaters.delete(this);}}):null;
  this.observer?.observe(this.node);if(!this.observer)visibleEaters.add(this);
  this.resizeObserver=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>{if(this.node.isConnected)this.onResize?.();}):null;this.resizeObserver?.observe(this.node);
  startTracking();this.set('hungry');
 }
 set(state,message){if(this.disposed)return;this.state=state;this.node.dataset.state=state;this.heading.textContent=copy[state][0];this.note.textContent=message||copy[state][1];this.node.setAttribute('aria-busy',String(state==='eating'));this.card?.setAttribute('data-eater-ready',String(state==='ready'));if(!['hungry','error'].includes(state))this.look(null);}
 attach(card,body,{hasData,button,importFiles,onResize}){
  this.onResize=onResize;
  this.card=card;this.hasData=!!hasData;this.button=button;this.node.dataset.compact=String(!!hasData&&!this.busy&&this.state!=='happy');body.append(this.node);button.disabled=!!this.busy;
  if(!this.busy&&this.state!=='happy'&&this.state!=='error')this.set(hasData?'full':'hungry');
  button.onclick=event=>{event.stopPropagation();void this.feed(()=>importFiles(),false)};
  let depth=0;
  const isFiles=event=>Array.from(event.dataTransfer?.types||[]).includes('Files');
  card.addEventListener('dragenter',event=>{if(!isFiles(event))return;event.preventDefault();event.stopPropagation();depth++;if(!this.busy)this.set('ready');});
  card.addEventListener('dragover',event=>{if(!isFiles(event))return;event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect=this.busy?'none':'copy';});
  card.addEventListener('dragleave',event=>{if(!depth)return;event.preventDefault();event.stopPropagation();depth=Math.max(0,depth-1);if(!depth&&!this.busy)this.set(this.hasData?'full':'hungry');});
  card.addEventListener('drop',event=>{const files=Array.from(event.dataTransfer?.files||[]);if(!isFiles(event)&&!files.length)return;event.preventDefault();event.stopPropagation();depth=0;if(this.busy)return;void this.feed(()=>importFiles(files),true);});
 }
 async feed(importFiles,dropped){
  if(this.busy||this.disposed)return;
  clearTimeout(this.timer);this.eatingAt=null;this.busy=true;this.button.disabled=true;this.set(dropped?'eating':'choosing');
  try{
   const result=await importFiles();
   if(this.disposed)return;
   if(result?.count>0){
    this.hasData=true;
    // The real commit has completed. Finish the short swallowing motion without
    // delaying persistence or suggesting that an unparsed document was understood.
    const remaining=Math.max(0,850-(performance.now()-(this.eatingAt||performance.now())));
    await new Promise(resolve=>{this.finishMotion=resolve;this.timer=setTimeout(resolve,this.reduced?.matches?0:remaining);});this.finishMotion=null;
    if(this.disposed)return;
    this.set('happy');this.timer=setTimeout(()=>{this.node.dataset.compact=String(this.hasData);this.set(this.hasData?'full':'hungry');},1300);
   }
   else this.set(this.hasData?'full':'hungry');
  }catch(error){this.set('error',error?.message||'讀取失敗，請重新加入資料。');}
  finally{this.busy=false;if(this.button)this.button.disabled=false;}
 }
 importing(){if(this.busy){this.eatingAt=performance.now();this.set('eating');let snack=this.creature.querySelector('.snack');if(!snack){snack=document.createElement('span');snack.className='snack';snack.textContent='≋';snack.setAttribute('aria-hidden','true');this.creature.append(snack);}snack.style.animation='none';void snack.offsetWidth;snack.style.animation='';}}
 look(point){
  const reset=()=>{for(const name of ['--look-x','--look-y','--look-tilt','--look-lift'])this.node.style.removeProperty(name);};
  if(!point||this.disposed||this.reduced?.matches||!this.node.isConnected||this.hasData||!['hungry','error'].includes(this.state)){reset();return;}
  const r=this.creature.getBoundingClientRect();if(!r.width||!r.height)return;
  // Screen-space bounds automatically account for the board's pan and zoom.
  const x=(point.x-r.left-r.width/2)/r.width,y=(point.y-r.top-r.height*.55)/r.height;
  this.node.style.setProperty('--look-x',clamp(x*5,5)+'px');this.node.style.setProperty('--look-y',clamp(y*4,4)+'px');this.node.style.setProperty('--look-tilt',clamp(x*2,2)+'deg');this.node.style.setProperty('--look-lift',(-Math.max(0,1-Math.hypot(x,y))*2)+'px');
 }
 dispose(){this.disposed=true;clearTimeout(this.timer);this.finishMotion?.();this.observer?.disconnect();this.resizeObserver?.disconnect();visibleEaters.delete(this);this.node.remove();this.card=null;this.button=null;}
}
