// Execution, product judgement and measured elapsed time are separate facts.
export function flowExecutionState(node){
 if(['FAULT','FAILED','TIMEOUT','ERROR'].includes(node.status)||node.error)return {key:'fault',label:'執行故障（非產品分類）'};
 if(node.status==='RUNNING')return {key:'running',label:'執行中'};
 if(node.status==='NOT_FOUND')return {key:'not-found',label:'執行成功；目標未找到（非故障）'};
 if(node.status==='SUCCEEDED')return {key:'succeeded',label:node.kind==='decision'?'分類執行成功':'執行成功'};
 if(node.status==='AVAILABLE')return {key:'available',label:'原件可用（不代表已執行）'};
 if(node.status==='BRANCH_NOT_SELECTED')return {key:'not-selected',label:'本件未選中此分支'};
 if(node.status==='DECLARED')return {key:'declared',label:'已宣告，尚無本件執行紀錄'};
 if(node.status==='SKIPPED')return {key:'skipped',label:'已略過'};
 return {key:'unknown',label:'尚無執行狀態'};
}
export const recordedDuration=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
export function flowNodeTiming(node){
 const durationMs=recordedDuration(node.durationMs);if(durationMs===null)return null;
 const value=durationMs===0?'0':durationMs<.01?'<0.01':durationMs<1?durationMs.toFixed(2):durationMs.toFixed(1);
 const memory= node.artifactMode==='memory'||(node.artifacts||[]).some(a=>a.storage==='process-memory'||a.pixelRetention==='current-workpiece-memory');
 if(node.timingPrevious)return {durationMs,label:value+' ms',description:'上一件已完成工件的實測耗時；本件此節點尚未產生新計時，完成後更新'};
 return {durationMs,label:value+' ms',description:node.backend==='rust-native'?'Rust 原生算子耗時；主機派發、核驗與畫面更新另見實算統計時間分解':node.definition?(memory?'Python 程式耗時（含導入、解碼與內存圖像保留）；主機派發、核驗與畫面更新另見實算統計時間分解':'Python 程式耗時（含導入、解碼與產物寫入）；主機派發、核驗與畫面更新另見實算統計時間分解'):node.durationScope==='own-program'?'本節點程式的實測耗時；不含獨立執行的子目的，不作重疊時間相加':node.kind==='procedure'||node.kind==='run'?'本次程序的實測包圍耗時，含內部步驟；不將父子計時相加':'本次算子實測耗時'};
}
