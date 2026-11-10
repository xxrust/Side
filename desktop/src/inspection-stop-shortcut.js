// Capture Escape before dialogs, canvas tools and text editors consume it.
// No active inspection: leave their normal Escape behavior intact.
export function installInspectionStopShortcut(cancel,target=window){
 const keydown=event=>{
  if(event.key!=='Escape'||event.isComposing||event.keyCode===229||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
  if(!cancel())return;
  event.preventDefault();event.stopImmediatePropagation();
 };
 target.addEventListener('keydown',keydown,true);
 return ()=>target.removeEventListener('keydown',keydown,true);
}
