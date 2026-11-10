const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const list=value=>Array.isArray(value)?value:[];
export function ontologyEvidence(project){
 const boards=list(project?.data?.visualInquiry?.boards),agentAnnotations=[],agentGeometry=[];
 for(const board of boards)for(const item of list(board.items)){
  for(const annotation of list(item.annotations))if(annotation.author==='agent')agentAnnotations.push(annotation);
  for(const tool of list(item.geometryTools))if(tool.author==='agent')agentGeometry.push(tool);
 }
 return {boards:boards.length,agentAnnotations,agentGeometry};
}
export function renderOntologyGuide({project,onAsk}={}){
 const evidence=ontologyEvidence(project),root=el('section',undefined,'ontology-guide');root.setAttribute('aria-label','本體論共同認知導引');
 const heading=el('header'),title=el('h3','本體論共同認知導引'),status=el('span',evidence.agentAnnotations.length||evidence.agentGeometry.length?'Agent 已留下圖形證據':'等待 Agent 用畫板工具證明共同認知','ontology-guide-status');heading.append(title,status);root.append(heading);
 root.append(el('p','先定義工件、部件、關係、缺陷與最終結果，再讓算法落到可驗證的節點。文字回答不能代替圖形證據。','ontology-guide-intro'));
 const grid=el('div',undefined,'ontology-guide-steps');for(const [id,h,c]of [['objects','1 · 對象本體','人類指出工件與部件；Agent 用矩形、鋼筆或文字標註對象。'],['relations','2 · 關係本體','人類說明包含、相鄰、偏移等關係；Agent 用線或箭頭表達關係。'],['defects','3 · 缺陷本體','把缺陷定義成可觀察的影像／量測條件，保留 UNKNOWN 邊界。'],['decision','4 · 判定出口','將證據映射到唯一產品分類或 FAULT，不能把中間輸出冒充最終判定。']]){const card=el('article',undefined,'ontology-guide-step');card.dataset.step=id;card.append(el('strong',h),el('p',c));grid.append(card);}root.append(grid);
 const actions=el('div',undefined,'ontology-guide-actions'),ask=el('button','要求 Agent 以畫板工具建立共同認知');ask.type='button';ask.onclick=()=>onAsk?.('請先以本體論建立共同認知：在目前工程畫板上使用實際畫板工具（矩形／鋼筆／線／箭頭）標出工件、部件與至少一條關係，並在標註文字中說明它們的本質。完成圖形證據後，再說明缺陷定義、可量測依據、UNKNOWN 邊界與唯一最終判定出口。不要只用文字回答。');actions.append(ask);if(evidence.agentAnnotations.length||evidence.agentGeometry.length)actions.append(el('small',`已記錄 ${evidence.agentAnnotations.length} 個 Agent 標註、${evidence.agentGeometry.length} 個 Agent 實算工具`));root.append(actions);return root;
}
