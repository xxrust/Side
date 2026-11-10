// Automatic project context is an index. Explicit user references are already
// validated/compacted by Agent.context and must not be discarded with that index.
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value?.[k]!==undefined).map(k=>[k,value[k]]));
const image=value=>pick(value,['id','name','width','height','profileId','contentSha256']);
export function agentPromptContext(c){
 const board=c.canvasProject;
 return {
  ...pick(c,['page','workflow','scale','workpiece','scope','acceptanceWorkflow','consultationWorkflow','structuredGeometry','reusableVisuals','referenceMatchesCurrentImage']),
  ...(c.reference?{reference:c.reference}:{}),
  image:c.image?image(c.image):null,
  dataset:c.dataset?{imageCount:c.dataset.imageCount,images:(c.dataset.images||[]).slice(0,8).map(image),read:'get_dataset_images',summaryOnly:true}:undefined,
  scheme:c.scheme?pick(c.scheme,['id','unit','nodeCount','read']):{read:'get_purpose_scheme'},
  references:(c.references||[]).slice(0,16).map(r=>pick(r,['id','name','status','availableTextChars','read'])),
  canvasProject:board?{boardId:board.boardId,sources:(board.sources||[]).slice(0,32).map(s=>({...pick(s,['id','title','name','role','imageCount','profileId']),read:'get_dataset_images'})),references:(board.references||[]).slice(0,16).map(r=>pick(r,['id','title','name'])),relations:(board.relations||[]).slice(0,32),items:(board.items||[]).slice(0,16).map(i=>pick(i,['id','assetId','imageId','annotationCount','geometryToolCount','coordinateBinding'])),itemCount:board.items?.length||0,cards:(board.cards||[]).slice(0,16).map(x=>pick(x,['id','kind','title','sourceId'])),read:'get_canvas_project_context',pixels:'get_visual_image',summaryOnly:true}:undefined,
  programmableAlgorithms:{read:'get_algorithm_capabilities',context:'get_algorithm_context',execute:'run_algorithm',runCount:c.programmableAlgorithms?.runs?.length||0,runs:(c.programmableAlgorithms?.runs||[]).slice(-5).map(r=>({...pick(r,['runId','title','status','mode','at','current']),artifacts:(r.artifacts||[]).slice(0,8).map(a=>pick(a,['id','name','type'])),read:'get_algorithm_run'}))},
  visual:c.visual?{board:c.visual.board?pick(c.visual.board,['id','title','revision','itemCount']):undefined,read:'get_visual_context',pixels:'get_visual_image'}:undefined,
  readMore:'get_context returns detailed context; use the specific read tools above first. This is an index, not complete image/measurement evidence.'
 };
}
