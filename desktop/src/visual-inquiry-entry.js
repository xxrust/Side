// All visual surfaces share this entry; the image is captured when the menu opens.
export function installVisualInquiryEntry({sources,view,onError,roiAvailable=()=>false}){
 const menu=document.getElementById('contextMenu'),legacy=[...menu.children],button=document.createElement('button');
 button.id='contextVisualInquiry';button.textContent='▧ 引用與問詢';menu.prepend(button);let pending=null;
 const add=document.createElement('button');add.id='contextAddVisualImage';add.textContent='＋ 加入目前問詢畫板';button.after(add);
 const hide=()=>{menu.hidden=true};
 const open=async()=>{try{const reference=await pending;if(!reference)throw Error('這裡尚無可引用的圖像');hide();for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();await view.open({reference})}catch(e){onError?.(e.message)}};
 button.onclick=add.onclick=open;
 document.addEventListener('contextmenu',event=>{
  if(event.target.closest?.('.visual-inquiry-panel,.program-flow-map,.program-flow-map-dialog'))return;
  const surface=event.target.closest?.('canvas,img,svg');if(!surface)return;
  event.preventDefault();event.stopImmediatePropagation();
  pending=Promise.resolve(sources.fromElement(surface));pending.catch(()=>{});
  const dialog=surface.closest('dialog[open]');(dialog||document.body).append(menu);
  const roi=surface.id==='board'&&roiAvailable();legacy.forEach(node=>node.hidden=!roi);
  add.hidden=!view.project.ensureInquiry().activeBoardId;
  menu.hidden=false;menu.style.left=Math.max(4,Math.min(event.clientX,innerWidth-240))+'px';menu.style.top=Math.max(4,Math.min(event.clientY,innerHeight-(roi?245:110)))+'px';
 },true);
 document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target))hide()});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')hide()});
 // Images in strips, figures, and chat can be dragged into the shared board.
 document.addEventListener('dragstart',event=>{
  if(event.target.closest?.('.visual-inquiry-panel'))return;const surface=event.target.closest?.('img');if(!surface)return;
  const reference=surface.dataset.inquiryAssetId;if(reference){event.dataTransfer.setData('application/x-agentcv-image-id','asset:'+reference);return}
  const source=sources.catalog().find(item=>item.source?.imageId===surface.closest('[data-image-id]')?.dataset.imageId&&item.kind==='original');
  if(source)event.dataTransfer.setData('application/x-agentcv-image-id',source.source_id||source.id);
 });
 return {close:hide};
}
