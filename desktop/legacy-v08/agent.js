import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {sides} from './model.js';
export {agentTools,systemPrompt} from './agent-contract.js';
export class Agent {
  constructor(project,ui){this.p=project;this.ui=ui;this.connected=false;this.busy=false;this.model='';this.models=[];this.instance=null;this.turn=null;this.turnEpoch=null;this.activeMessage=null;this.pendingModel=new Map();this.generation=0;}
  async wire(command){return invoke('pi_send',{command})}
  async connect(){
    if(this.connecting)return this.connecting;
    this.connected=false;this.ui.activity('正在啟動 Pi…');this.ui.update();
    if(!this.unlisten)this.unlisten=await listen('pi-event',({payload})=>{if(this.instance&&payload.instance!==this.instance)return;this.event(payload.event).catch(e=>{this.record('system',e.message);this.ui.activity('')})});
    this.connecting=new Promise((resolve,reject)=>{this.readyResolve=resolve;this.readyReject=reject;this.readyTimer=setTimeout(()=>{this.readyReject=null;this.readyResolve=null;this.connected=false;this.ui.activity('Pi 啟動逾時，請重新連接');reject(Error('Pi 啟動逾時'))},30000)});
    try{await Promise.all([invoke('pi_start').then(instance=>{this.instance=instance}),this.connecting]);}catch(e){clearTimeout(this.readyTimer);this.readyReject?.(e);this.readyReject=null;this.readyResolve=null;this.ui.activity('Pi 啟動失敗，可重新連接');throw e}finally{this.connecting=null}
  }
  stamp(){return `${this.p.epoch}:${this.p.data.activeId}:${this.p.image?.revision}:${this.p.config.revision}:${this.p.data.events.length}`}
  async setModel(provider,modelId){if(this.busy)throw Error('請先等目前對話完成');const id=crypto.randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pendingModel.delete(id);reject(Error('切換模型逾時'))},15000);this.pendingModel.set(id,{resolve:()=>{clearTimeout(timer);resolve()},reject:e=>{clearTimeout(timer);reject(e)}});this.wire({type:'set_model',provider,modelId,id}).catch(e=>{clearTimeout(timer);this.pendingModel.delete(id);reject(e)})})}
  reset(){this.stop();this.generation++;if(this.connected)this.wire({type:'reset',id:crypto.randomUUID()}).catch(e=>this.record('system',e.message));this.activeMessage=null;}
  stop(){const current=this.turn;this.turn=null;this.busy=false;this.activeMessage=null;if(this.connected&&current)this.wire({type:'abort'}).catch(()=>{});this.ui.activity('');this.ui.update()}
  record(role,text){this.p.data.chat.push({role,text,at:new Date().toISOString()});this.p.dirty=true;this.ui.update()}
  async event(e){
    if(e.type==='ready'){clearTimeout(this.readyTimer);this.models=e.models;this.model=e.model.id;this.provider=e.model.provider;this.connected=true;this.ui.activity('');this.readyResolve?.();this.readyResolve=null;this.readyReject=null;this.ui.update();return}
    if(e.type==='fatal'||e.type==='disconnected'){clearTimeout(this.readyTimer);this.connected=false;this.busy=false;this.turn=null;this.readyReject?.(Error(e.error||'Pi 程序已結束'));this.readyResolve=null;this.readyReject=null;this.ui.activity(e.error||'Pi 已斷線，可重新連接');this.ui.update();return}
    if(e.type==='model_changed'){this.model=e.model.id;this.provider=e.model.provider;this.pendingModel.get(e.id)?.resolve();this.pendingModel.delete(e.id);this.ui.update();return}
    if(e.type==='error'){this.pendingModel.get(e.id)?.reject(Error(e.error));this.pendingModel.delete(e.id);if(e.id===this.turn){this.busy=false;this.turn=null}this.record('system','Pi：'+e.error);this.ui.activity('');return}
    if(e.turn!==this.turn||this.turnEpoch!==this.p.epoch){if(e.type==='tool_request')await this.wire({type:'tool_response',id:e.id,result:{error:'舊對話或專案已變更，操作未執行'}});return}
    if(e.type==='text_delta'){if(!this.activeMessage){this.activeMessage={role:'assistant',text:'',at:new Date().toISOString()};this.p.data.chat.push(this.activeMessage)}this.activeMessage.text+=e.delta;this.p.dirty=true;this.ui.update()}
    if(e.type==='agent_error')this.record('system','模型回覆失敗：'+e.error);
    if(e.type==='tool_start'){this.activeMessage=null;this.ui.activity('Pi 正在操作畫板…')}
    if(e.type==='tool_request'){let result;try{
      if(e.name==='get_context')this.expectedStamp=this.stamp();
      else if(['set_search_region','detect_edge','highlight_candidate','set_edge_note'].includes(e.name)&&this.expectedStamp!==this.stamp())throw Error('畫板已被使用者修改，請先 get_context 讀取最新狀態');
      result=await this.execute(e.name,e.args);this.expectedStamp=this.stamp();this.record('system','工具完成：'+({get_context:'讀取目前畫板',go_to_step:'切換步驟',set_search_region:'更新搜尋框',detect_edge:'重新搜尋邊緣',highlight_candidate:'指出候選，等待你確認',set_edge_note:'保存邊緣說明'}[e.name]||e.name));
    }catch(err){result={error:err.message};this.record('system','工具未完成：'+err.message)}await this.wire({type:'tool_response',id:e.id,result})}
    if(e.type==='turn_end'){this.busy=false;this.turn=null;this.activeMessage=null;this.ui.activity('');this.ui.update()}
  }
  async execute(name,args){if(name!=='get_context'&&this.ui.locked?.())throw Error('畫板正在拖曳或處理圖片集，請稍後重試');const requestTurn=this.turn;if(args.side&&!sides.includes(args.side))throw Error('不支援的邊緣');const p=this.p;
    if(name==='get_context')return p.context(this.ui.side(),this.ui.page());
    if(name==='go_to_step'){await this.ui.go(args.step);return {page:this.ui.page()}}
    if(name==='set_search_region'){const {side,x,y,width,height,threshold,profileWidth}=args,img=p.image;if(!img)throw Error('請先導入圖片');if(![x,y,width,height].every(Number.isFinite)||x<0||y<0||width<10||height<10||x+width>img.width||y+height>img.height)throw Error('ROI 超出原圖或太小');if(threshold!==undefined&&(!Number.isFinite(threshold)||threshold<1||threshold>255))throw Error('灰階差需為 1–255');if(profileWidth!==undefined&&(!Number.isInteger(profileWidth)||profileWidth<1||profileWidth>15||profileWidth%2!==1))throw Error('平均寬度必須是 1–15 奇數');
      if(!p.tool(side)){const h=['top','bottom'].includes(side);if((h?width:height)<14)throw Error('搜尋區域太短');p.drawIntent(side,h?{x:x+1,y:y+height/2}:{x:x+width/2,y:y+1},h?{x:x+width-1,y:y+height/2}:{x:x+width/2,y:y+height-1});p.makeTool(side)}
      const params={};if(threshold!==undefined)params.threshold=threshold;if(profileWidth!==undefined)params.profileWidth=profileWidth;await p.updateROI(side,{x,y,width,height},params);if(requestTurn!==this.turn)throw Error('操作已取消，不再切換畫板');await this.ui.go('edge-'+side);return p.context(side,this.ui.page()).edges.find(e=>e.side===side);
    }
    if(name==='detect_edge'){await p.detect(args.side);return p.context(args.side,this.ui.page()).edges.find(e=>e.side===args.side)}
    if(name==='highlight_candidate'){const t=p.tool(args.side);if(!t?.result?.candidates?.some(c=>c.id===args.candidate_id))throw Error('候選已失效，請重新讀取');await this.ui.go('edge-'+args.side);this.ui.highlight(args.candidate_id);p.event('agent_candidate_suggested',{side:args.side,candidate_id:args.candidate_id,reason:args.reason});return {highlighted:args.candidate_id,human_confirmation_required:true}}
    if(name==='set_edge_note'){if(typeof args.note!=='string'||args.note.length>240)throw Error('說明最多 240 字');if(!p.tool(args.side)&&!p.intent(args.side))throw Error('請先建立此邊緣');p.setNote(args.side,args.note);return {saved:true}}
    throw Error('未授權的工具：'+name);
  }
  async send(text,image){if(!this.connected)throw Error('請先啟動 Pi');if(this.busy)return;this.busy=true;this.turn=crypto.randomUUID();this.turnEpoch=this.p.epoch;this.expectedStamp=this.stamp();this.activeMessage=null;this.record('user',text);this.ui.activity('Pi 正在理解目前畫板…');
    const context=JSON.stringify(this.p.context(this.ui.side(),this.ui.page()));
    const history=this.p.data.chat.filter(m=>['user','assistant'].includes(m.role)).slice(-12,-1).map(m=>({role:m.role,text:m.text}));
    const message=text+'\n目前畫板狀態（原圖座標）：'+context+'\n專案最近對話摘要：'+JSON.stringify(history);
    const images=image?[{type:'image',data:image.split(',')[1],mimeType:'image/png'}]:[];
    try{await this.wire({type:'prompt',id:this.turn,message,images})}catch(e){this.busy=false;this.turn=null;this.ui.activity('');this.record('system','Pi 傳送失敗：'+e.message);throw e}
  }
}
