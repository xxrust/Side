// ACP tool-call activity is rendered as a readable transcript instead of a
// wall of opaque system log lines.  The data comes from the open ACP event
// stream; this module only maps stable activity fields to native details UI.
const labels={
 get_context:'讀取目前專案上下文',get_visual_context:'讀取畫板與圖像關係',get_canvas_project_context:'讀取畫板結構',
 get_algorithm_context:'核對算法輸入',get_purpose_scheme:'讀取目前方案',compile_scheme:'編譯方案',
 set_purpose_scheme:'更新方案',set_node_documentation:'更新節點文檔',rename_flow_node:'更新流程節點名稱',run_algorithm:'執行算法',
 run_workpiece_scheme:'執行目前工件',run_dataset_scheme:'建立圖像源背景任務',get_agent_job:'讀取背景任務',get_dataset_execution:'讀取執行結果',
 get_algorithm_run:'讀取算法結果',show_algorithm_run:'展示算法結果',get_visual_image:'讀取指定圖像',
 show_visual_image:'展示指定圖像',add_visual_image:'加入畫板圖像',save_visual_asset:'保存討論資產',
 get_geometry_tools:'讀取幾何工具',tune_geometry_tool:'調整幾何工具',get_project_acceptance:'讀取驗收條件',
 run_acceptance_baseline:'執行驗收回歸',compare_acceptance_runs:'比較回歸結果',install_algorithm_packages:'安裝算法依賴'
};
const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const text=value=>typeof value==='string'?value:'';
const pretty=value=>{try{return JSON.stringify(value,null,2)}catch{return String(value)}};
export function agentActivityLabel(tool){return labels[tool]||tool||'Agent 操作';}
export function renderAgentActivity(message,{document:doc=globalThis.document,compact=false}={}){
 const activity=message?.agentActivity;if(!activity||!doc)return null;
 const details=doc.createElement('details');details.className='agent-activity-card';details.open=activity.status==='running'&&!compact;
 details.dataset.status=activity.status||'done';details.dataset.tool=activity.tool||'';
 const summary=doc.createElement('summary');summary.className='agent-activity-summary';
 const marker=doc.createElement('span');marker.className='agent-activity-marker';marker.setAttribute('aria-hidden','true');marker.textContent=activity.status==='running'?'⟳':activity.status==='error'?'!':'✓';
 const title=doc.createElement('strong');title.textContent=agentActivityLabel(activity.tool);
 const status=doc.createElement('span');status.className='agent-activity-status';status.textContent=activity.status==='running'?'進行中':activity.status==='error'?'失敗':'完成';
 const time=doc.createElement('span');time.className='agent-activity-time';time.textContent=Number.isFinite(activity.elapsedMs)?`${Math.round(activity.elapsedMs)} ms`:'';
 summary.append(marker,title,status,time);details.append(summary);
 const body=doc.createElement('div');body.className='agent-activity-body';
 if(text(activity.intent)){const p=doc.createElement('p');p.className='agent-activity-intent';p.textContent=activity.intent;body.append(p)}
 if(activity.args!==undefined){const section=doc.createElement('section');section.className='agent-activity-section';const h=doc.createElement('small');h.textContent='輸入摘要';const pre=doc.createElement('pre');pre.textContent=pretty(copy(activity.args));section.append(h,pre);body.append(section)}
 if(activity.result!==undefined){const section=doc.createElement('section');section.className='agent-activity-section';const h=doc.createElement('small');h.textContent=activity.status==='error'?'錯誤摘要':'結果摘要';const pre=doc.createElement('pre');pre.textContent=pretty(copy(activity.result));section.append(h,pre);body.append(section)}
 if(text(activity.next)){const p=doc.createElement('p');p.className='agent-activity-next';p.textContent=`下一步：${activity.next}`;body.append(p)}
 details.append(body);return details;
}
