// Exercise the current source-card action: importing makes a collection, and
// placing its actual original on a board is a separate explicit user action.
export async function placeCurrentSourceOriginal(h){
 const view=h.api.inquiryView,p=h.api.project,spaces=p.canvasProjectContext(view.boardId),imageId=p.image?.id;
 const source=spaces.sources.find(s=>s.imageIds.includes(imageId));if(!source)throw Error('The imported image has no real source card');
 const image=source.images.find(i=>i.id===imageId);if(!image)throw Error('Source card does not contain the current original');
 return view.projectCards.addOriginal(source,image);
}
export async function confirmVisibleProjectSwitch(h){
 for(let i=0;i<80;i++){const button=h.w.document.querySelector('.confirm-action-dialog button.primary');if(button){button.click();await h.tick();return;}await h.tick();}
 throw Error('Expected a visible project-switch confirmation');
}
