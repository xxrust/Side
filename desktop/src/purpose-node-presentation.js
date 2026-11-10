/** Names are presentation metadata: stable IDs remain the executable binding.
 * Keeping overrides outside operatorGraph also preserves old scheme fingerprints.
 */
export function purposeNodeTitle(scheme,node){
 const id=typeof node==='string'?node:node?.id;
 const definition=typeof node==='string'?scheme?.operatorGraph?.nodes?.find(n=>n.id===id):node;
 return scheme?.presentation?.nodeTitles?.[id]||definition?.title||id||'';
}
export function renameFlowNode(project,nodeId,title,{schemeId}={}){
 const scheme=project.purposeScheme;
 if(!scheme||schemeId&&schemeId!==scheme.id)throw Error('方案已切換，請重新選擇節點');
 const id=typeof nodeId==='string'?nodeId.replace(/^scheme::/,''):null;
 const node=scheme.operatorGraph?.nodes?.find(n=>n.id===id);
 if(!node)throw Error('找不到可重新命名的方案節點；歷史執行紀錄與分類規則不可在此改寫');
 if(typeof title!=='string'||!title.trim()||title.trim().length>80||/[\u0000-\u001f\u007f]/.test(title))throw Error('名稱請填寫 1–80 字，且不可包含換行或控制字元');
 const next=title.trim(),previous=purposeNodeTitle(scheme,node);
 if(previous===next)return {nodeId:id,title:next,changed:false,executionChanged:false};
 project.mutate('flow_node_renamed',()=>{
  scheme.presentation||={};scheme.presentation.nodeTitles||={};
  Object.defineProperty(scheme.presentation.nodeTitles,id,{value:next,writable:true,enumerable:true,configurable:true});
 },{schemeId:scheme.id,nodeId:id,previous,title:next,executionChanged:false});
 return {nodeId:id,title:next,changed:true,executionChanged:false};
}
