const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
import {ImageRenderer} from './image-renderer.js';
export class SourceDecisionView{
 constructor(){this.element=el('section',undefined,'source-decision');this.element.setAttribute('aria-label','本件判定依據');this.generation=0;this.heading=el('div',undefined,'source-decision-heading');this.heading.append(el('h3','判定依據圖'));this.body=el('div',undefined,'source-decision-body');this.figure=el('figure');this.renderer=new ImageRenderer({label:'本件判定依據圖'});this.image=this.renderer.image;this.empty=el('p',undefined,'source-decision-empty');this.figure.append(this.renderer.root);this.body.append(this.figure,this.empty);this.element.append(this.heading,this.body);}
 clear(message){this.generation++;this.heading.querySelectorAll(':scope > :not(h3)').forEach(n=>n.remove());this.renderer.clear();this.figure.hidden=true;this.empty.hidden=false;this.empty.textContent=message;}
 async show(model,isCurrent){
  const generation=++this.generation,current=()=>generation===this.generation&&isCurrent();
  const header=this.heading,body=this.body,last=model.labels?.last;header.querySelectorAll(':scope > :not(h3)').forEach(n=>n.remove());
  if(last){const status=el('strong',last.text==='UNKNOWN'?'未確定':last.text,'source-decision-status');status.dataset.quality=last.quality||last.status;if(last.historical)status.append(el('small',' · 歷史'));header.append(status);}

  if(!model.reasons?.length){this.renderer.clear();this.figure.hidden=true;this.empty.hidden=false;this.empty.textContent=model.message||'尚無判定圖';return;}
  let selectedReason=0,page=0,frame=0;
  const controls=el('div',undefined,'source-decision-controls');header.append(controls);
  const draw=()=>{
   const ticket=++frame,valid=()=>current()&&ticket===frame;controls.replaceChildren();
   if(model.reasons.length>1)model.reasons.forEach((reason,i)=>{const b=el('button',reason.title);b.type='button';b.setAttribute('aria-pressed',String(i===selectedReason));b.onclick=()=>{selectedReason=i;page=0;draw();};controls.append(b);});
   const reason=model.reasons[selectedReason],image=reason.images[page];
   if(!image){this.renderer.clear();this.figure.hidden=true;this.empty.hidden=false;this.empty.textContent=model.state==='FAULT'?'沒有故障前圖像':'此判定尚無依據圖';return;}
   const figure=this.figure,img=this.image;this.empty.hidden=true;figure.hidden=false;img.alt=reason.title;img.dataset.runId=image.runId;img.dataset.artifactId=image.artifactId;
   if(reason.images.length>1){const previous=el('button','‹'),next=el('button','›');previous.setAttribute('aria-label','上一張依據圖');next.setAttribute('aria-label','下一張依據圖');previous.disabled=page===0;next.disabled=page===reason.images.length-1;previous.onclick=()=>{page--;draw();};next.onclick=()=>{page++;draw();};controls.append(previous,el('span',`${page+1} / ${reason.images.length}`),next);}
   model.loadImage(image).then(url=>{if(valid()){this.renderer.setSource({src:url,width:image.width,height:image.height,alt:reason.title});this.renderer.source.imageId=image.artifactId||url;}}).catch(()=>{if(valid()){figure.hidden=true;this.empty.hidden=false;this.empty.textContent='判定圖讀取失敗，請重試';}});
  };draw();
 }
}
