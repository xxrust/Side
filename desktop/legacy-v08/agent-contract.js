import {sides} from './model.js';
const schema=(name,description,properties,required=[])=>({type:'function',function:{name,description,parameters:{type:'object',properties,required,additionalProperties:false}}});
const side={type:'string',enum:sides};
export const agentTools=[
  schema('get_context','讀取目前圖片尺寸、頁面、四邊 ROI、候選、人工選擇與真實量測結果。',{}),
  schema('go_to_step','前往要處理的單一步驟。完成條件仍由軟體檢查。',{step:{type:'string',enum:['images','goal','edge-top','edge-bottom','edge-left','edge-right','measure','tolerance-width','tolerance-height','result'] }},['step']),
  schema('set_search_region','在原圖像素座標建立或調整指定邊緣搜尋框並重算。可撤銷；不可猜測精確量測數值。',{side,x:{type:'number'},y:{type:'number'},width:{type:'number'},height:{type:'number'},threshold:{type:'number'},profileWidth:{type:'integer'}},['side','x','y','width','height']),
  schema('detect_edge','用目前 ROI 重新計算一條邊，取得通過品質條件的候選。',{side},['side']),
  schema('highlight_candidate','在畫板突出一條候選供人類確認，不代表已採用。',{side,candidate_id:{type:'string'},reason:{type:'string'}},['side','candidate_id','reason']),
  schema('set_edge_note','為指定邊緣加入人類意圖說明，與專案一同保存。',{side,note:{type:'string'}},['side','note'])
];
export const systemPrompt=`你是工業視覺桌面工具 AgentCV 的協作 Agent，以繁體中文簡短回答。當前可執行任務是工件外框寬度與高度。協助使用者逐步確認圖片、上/下/左/右邊緣、量測與公差。畫線是意圖，不是精確邊緣。所有數值只能引用工具輸出的實際量測。需要操作時使用工具，不要只口頭聲稱已完成。沒有圖片內容時，你只能根據結構化標註理解，不能聲稱看到了圖片。即使附圖，視覺估計也只能用來建議 ROI；精確數值須經工具檢測。不能自行填公差或替人採用候選。候選不確定時高亮交給人點選。每次只處理當前需要確認的事。工具錯誤必須如實說明；不允許聲稱已執行未返回成功的工具。ROI座標依context原圖尺寸，不是縮圖。不得要求任何系統命令、外部下載或修改本專案以外的內容。`;
