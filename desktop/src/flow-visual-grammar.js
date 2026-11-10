// Presentation comes from explicit graph roles, never guessed algorithm names.
export function flowVisual(node) {
 const kind=node.kind;
 if(kind==='source'||kind==='reference')return {shape:'image',label:kind==='source'?'待檢影像':'固定參考',width:210,height:124};
 if(kind==='decision')return {shape:'diamond',label:'分類判定',width:210,height:102};
 if(kind==='rule')return {shape:'diamond',label:'判定條件',width:220,height:100};
 if(kind==='category')return {shape:'terminal',label:'產品分類',width:200,height:64};
 if(kind==='system-exit')return {shape:'fault',label:'系統出口',width:200,height:74};
 if(kind==='procedure')return {shape:'subprocess',label:'目的節點',width:220,height:80};
 return {shape:'process',label:kind==='step'?'算子':'運算',width:150,height:62};
}
export function flowShapePath(shape,w,h) {
 if(shape==='diamond')return `M ${w/2} 0 L ${w} ${h/2} L ${w/2} ${h} L 0 ${h/2} Z`;
 if(shape==='terminal')return `M ${h/2} 0 H ${w-h/2} A ${h/2} ${h/2} 0 0 1 ${w-h/2} ${h} H ${h/2} A ${h/2} ${h/2} 0 0 1 ${h/2} 0 Z`;
 if(shape==='fault'){const c=16;return `M ${c} 0 H ${w-c} L ${w} ${c} V ${h-c} L ${w-c} ${h} H ${c} L 0 ${h-c} V ${c} Z`;}
 return `M 9 0 H ${w-9} Q ${w} 0 ${w} 9 V ${h-9} Q ${w} ${h} ${w-9} ${h} H 9 Q 0 ${h} 0 ${h-9} V 9 Q 0 0 9 0 Z`;
}
export function flowStatusMark(status) {
 if(status==='SUCCEEDED')return '✓';
 if(status==='AVAILABLE')return '◉';
 if(['FAULT','FAILED','ERROR','TIMEOUT'].includes(status))return '!';
 if(status==='NOT_FOUND')return '∅';
 if(status==='RUNNING')return '◷';
 if(['SKIPPED','BRANCH_NOT_SELECTED'].includes(status))return '–';
 return '○';
}
export function flowEdgeVisual(edge,from,to) {
 if(edge.provenance==='runtime-fault-exit'||to?.kind==='system-exit')return {kind:'fault',label:'故障轉交'};
 if(from?.kind==='rule'||to?.kind==='rule'||from?.kind==='decision')return {kind:'control',label:'條件／分類路徑'};
 if(edge.controlOnly)return {kind:'control',label:'執行條件'};
 return {kind:'data',label:'資料／前提傳遞'};
}
// ELK routes on rectangular bounds. Clip endpoints to the visible semantic
// silhouette without changing route direction or inventing graph edges.
export function flowAnchor(node,p,neighbor) {
 if(!node||!neighbor)return {...p};
 const {shape}=flowVisual(node),w=node.width,h=node.height,x=Math.max(0,Math.min(w,p.x-node.x)),y=Math.max(0,Math.min(h,p.y-node.y));
 if(shape!=='diamond'&&shape!=='fault'&&shape!=='terminal')return {...p};
 const vertical=Math.abs(p.x-neighbor.x)<.01;
 if(shape==='diamond')return vertical?{x:p.x,y:node.y+(neighbor.y<node.y+h/2?h*Math.abs(x-w/2)/w:h-h*Math.abs(x-w/2)/w)}:{x:node.x+(neighbor.x<node.x+w/2?w*Math.abs(y-h/2)/h:w-w*Math.abs(y-h/2)/h),y:p.y};
 if(shape==='fault'){const inset=vertical?Math.max(0,16-Math.min(x,w-x)):Math.max(0,16-Math.min(y,h-y));return vertical?{x:p.x,y:node.y+(neighbor.y<node.y+h/2?inset:h-inset)}:{x:node.x+(neighbor.x<node.x+w/2?inset:w-inset),y:p.y};}
 const r=h/2;
 if(vertical){const dx=Math.max(0,r-Math.min(x,w-x)),inset=r-Math.sqrt(Math.max(0,r*r-dx*dx));return {x:p.x,y:node.y+(neighbor.y<node.y+r?inset:h-inset)};}
 const inset=r-Math.sqrt(Math.max(0,r*r-(y-r)**2));return {x:node.x+(neighbor.x<node.x+w/2?inset:w-inset),y:p.y};
}
