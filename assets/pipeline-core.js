/* Deterministic measurement and rule classification. No model inference. */
globalThis.AgentCVPipeline = (() => {
  'use strict';
  const C=globalThis.AgentCVCore, clone=C.clone;
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const center=g=>g.center||{x:(g.from.x+g.to.x)/2,y:(g.from.y+g.to.y)/2};
  const angleDiff=(a,b)=>{const d=Math.abs(a-b)%180;return Math.min(d,180-d);};
  const unknown=reason=>({status:'UNKNOWN',value:null,reason});
  function geometry(object){
    const r=object?.result;
    if(object?.kind!=='tool'||r?.status!=='SELECTED')return null;
    if(r.selected_ids.length!==1)return null;
    return r.candidates.find(c=>c.id===r.selected_ids[0])?.geometry||null;
  }
  const sourceIds=def=>['frame_width','frame_height'].includes(def.kind)?[def.a,def.b,def.c,def.d]:[def.a,...(def.b?[def.b]:[])];
  function frameGeometry(def,objects,frame){
    const ids=sourceIds(def);if(new Set(ids).size!==4)return unknown('外框需要上、下、左、右四個不同來源');
    const edges=ids.map(id=>geometry(objects.find(o=>o.id===id)));
    if(edges.some(g=>g?.type!=='line'))return unknown('外框四邊必須全部唯一採用有效直線');
    const [top,bottom,left,right]=edges,parallel=[angleDiff(top.angle_deg,bottom.angle_deg),angleDiff(left.angle_deg,right.angle_deg)];
    if(parallel.some(a=>a>5))return unknown('相對兩邊偏角超過 5°；不能當作矩形外框量測');
    if(Math.abs(angleDiff(top.angle_deg,left.angle_deg)-90)>5)return unknown('相鄰邊不近似垂直；請確認是否選到了同一圈外框');
    function intersection(a,b){const u={x:a.to.x-a.from.x,y:a.to.y-a.from.y},v={x:b.to.x-b.from.x,y:b.to.y-b.from.y},den=u.x*v.y-u.y*v.x;if(Math.abs(den)<.1*Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y))return null;const dx=b.from.x-a.from.x,dy=b.from.y-a.from.y,t=(dx*v.y-dy*v.x)/den;return {x:a.from.x+t*u.x,y:a.from.y+t*u.y};}
    const corners=[intersection(top,left),intersection(top,right),intersection(bottom,right),intersection(bottom,left)];
    if(corners.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))return unknown('外框交點退化');
    if(frame&&corners.some(p=>p.x<0||p.y<0||p.x>frame.width||p.y>frame.height))return unknown('延長線交點超出原圖，請檢查四邊來源');
    const [tl,tr,br,bl]=corners,crosses=corners.map((p,i)=>{const q=corners[(i+1)%4],r=corners[(i+2)%4];return (q.x-p.x)*(r.y-q.y)-(q.y-p.y)*(r.x-q.x);});
    if(crosses.some(c=>Math.abs(c)<1e-6)||!crosses.every(c=>Math.sign(c)===Math.sign(crosses[0])))return unknown('四邊次序交叉或面積退化');
    if((tl.y+tr.y)/2>=(bl.y+br.y)/2||(tl.x+bl.x)/2>=(tr.x+br.x)/2)return unknown('請按上、下、左、右的位置指定來源');
    const widths=[distance(tl,tr),distance(bl,br)],heights=[distance(tl,bl),distance(tr,br)];
    if([...widths,...heights].some(v=>v<1))return unknown('外框尺寸不足 1 px');
    const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
    return {status:'VALID',corners,width:(widths[0]+widths[1])/2,height:(heights[0]+heights[1])/2,
      width_overlay:{from:mid(tl,bl),to:mid(tr,br)},height_overlay:{from:mid(tl,tr),to:mid(bl,br)},
      details:{top_width_px:widths[0],bottom_width_px:widths[1],left_height_px:heights[0],right_height_px:heights[1],opposite_angle_difference_deg:parallel,corner_model:'intersections-of-extended-straight-edges'}};
  }
  function measure(def,objects,calibration,frame){
    const a=geometry(objects.find(o=>o.id===def.a)),b=geometry(objects.find(o=>o.id===def.b));
    if(!a)return {...unknown('來源 A 尚未取得唯一且有效的算法結果'),id:def.id,name:def.name};
    let value,unit='px',overlay,frameResult;
    if(['frame_width','frame_height'].includes(def.kind)){frameResult=frameGeometry(def,objects,frame);if(frameResult.status!=='VALID')return {...frameResult,id:def.id,name:def.name};value=def.kind==='frame_width'?frameResult.width:frameResult.height;overlay=def.kind==='frame_width'?frameResult.width_overlay:frameResult.height_overlay;}
    else if(def.kind==='diameter'&&a.type==='circle'){value=2*a.radius;overlay={from:{x:a.center.x-a.radius,y:a.center.y},to:{x:a.center.x+a.radius,y:a.center.y}};}
    else if(def.kind==='line_angle'&&a.type==='line'){value=a.angle_deg;unit='deg';overlay={from:a.from,to:a.to};}
    else if(def.kind==='line_length'&&a.type==='line'){value=distance(a.from,a.to);overlay={from:a.from,to:a.to};}
    else if(def.kind==='center_distance'&&a.type==='circle'&&b?.type==='circle'){value=distance(a.center,b.center);overlay={from:a.center,to:b.center};}
    else if(def.kind==='point_line'&&a.type==='circle'&&b?.type==='line'){
      const dx=b.to.x-b.from.x,dy=b.to.y-b.from.y,den=dx*dx+dy*dy;if(den<1e-8)return {...unknown('基準線退化'),id:def.id,name:def.name};const t=((a.center.x-b.from.x)*dx+(a.center.y-b.from.y)*dy)/den;const foot={x:b.from.x+t*dx,y:b.from.y+t*dy};value=distance(a.center,foot);overlay={from:a.center,to:foot};
    }else if(def.kind==='angle'&&a.type==='line'&&b?.type==='line'){value=angleDiff(a.angle_deg,b.angle_deg);unit='deg';}
    else return {...unknown('來源類型不符，或來源 B 尚未唯一採用'),id:def.id,name:def.name};
    const raw=value;
    if(def.unit==='mm'&&unit!=='deg'){
      if(frame&&calibration?.frame&&(calibration.frame.width!==frame.width||calibration.frame.height!==frame.height))return {...unknown('圖片尺寸與比例校正不一致'),id:def.id,name:def.name};
      if(!calibration||!(calibration.mm_per_px>0)||!Number.isFinite(calibration.mm_per_px)||!calibration.confirmed)return {...unknown('缺少已確認的平面比例校正'),id:def.id,name:def.name};
      value*=calibration.mm_per_px;unit='mm';
    }
    if(!Number.isFinite(value))return {...unknown('計算得到非有限數值'),id:def.id,name:def.name};
    return {id:def.id,name:def.name,status:'VALID',value,raw_px:unit==='deg'?null:raw,unit,overlay,source_ids:sourceIds(def),source_runs:sourceIds(def).map(id=>objects.find(o=>o.id===id)?.result.run_id),method:def.kind,...(frameResult?{frame_corners:frameResult.corners,frame_details:frameResult.details}:{})};
  }
  function classify(measurements,tolerances,classes=[]){
    const checks=tolerances.map(rule=>{const m=measurements.find(m=>m.id===rule.measurement_id);if(!m||m.status!=='VALID')return {...rule,status:'UNKNOWN',reason:m?.reason||'量測不存在'};
      if(!Number.isFinite(rule.min)||!Number.isFinite(rule.max)||rule.min>rule.max||rule.unit!==m.unit)return {...rule,status:'UNKNOWN',reason:'公差範圍或單位不一致'};
      return {...rule,value:m.value,status:m.value>=rule.min&&m.value<=rule.max?'OK':'NG'};});
    const uncovered=measurements.filter(m=>!tolerances.some(r=>r.measurement_id===m.id));
    let status=uncovered.length||!measurements.length||measurements.some(m=>m.status!=='VALID')||!checks.length||checks.some(c=>c.status==='UNKNOWN')?'UNKNOWN':checks.some(c=>c.status==='NG')?'NG':'OK';
    const matches=[],classUnknown=[];
    for(const rule of classes){const m=measurements.find(m=>m.id===rule.measurement_id);if(!m||m.status!=='VALID'||m.unit!==rule.unit||!Number.isFinite(rule.min)||!Number.isFinite(rule.max)||rule.min>rule.max){classUnknown.push(rule.id);continue;}if(m.value>=rule.min&&m.value<=rule.max)matches.push(rule.label);}
    let label=classes.length?(matches.length===1&&!classUnknown.length?matches[0]:matches.length>1?'分類歧義':classUnknown.length?'待分類':'未命中類別'):status;
    if(classes.length&&(classUnknown.length||matches.length!==1))status='UNKNOWN';
    return {status,label,checks,class_matches:matches,reason:!checks.length?'尚未設定量測公差':uncovered.length?'尚未設定全部量測的公差：'+uncovered.map(m=>m.name).join('、'):classUnknown.length?'分類依賴無效':matches.length>1?'多個類別區間重疊':checks.some(c=>c.status==='UNKNOWN')?'量測或公差無效':classes.length&&!matches.length?'量測判定完成，但未命中命名類別':''};
  }
  function referenceSignature(objects,ids){return JSON.stringify(objects.filter(o=>ids.includes(o.id)||o.role==='ignore').map(o=>({id:o.id,type:o.type,role:o.role,params:o.params,roi:o.center?{center:o.center,radius:o.radius}:o.from?{from:o.from,to:o.to}:{x:o.x,y:o.y,width:o.width,height:o.height},geometry:ids.includes(o.id)?geometry(o):null})));}
  function capture(objects,measurements,options,frame){
    if(!measurements.length)throw Error('請先建立至少一項量測。');
    const required=new Set(measurements.flatMap(sourceIds)),anchors={};
    for(const id of required){const o=objects.find(o=>o.id===id),g=geometry(o);if(!g)throw Error(`量測來源 ${o?.name||id} 必須先採用唯一候選。`);anchors[id]=clone(g);}
    const positionTolerance=Number(options.positionTolerance),angleTolerance=Number(options.angleTolerance),radiusTolerance=Number(options.radiusTolerance);
    if(!(positionTolerance>0&&positionTolerance<=500&&angleTolerance>=0&&angleTolerance<=30&&radiusTolerance>0&&radiusTolerance<=100))throw Error('重定位容許範圍不合法。');
    const definitions=objects.map(o=>{const v=clone(o);delete v.result;delete v.selection_reason;return v;});
    return {schema:'recipe-0.5',reference_image_id:frame.id||null,reference_signature:referenceSignature(objects,Object.keys(anchors)),frame:{width:frame.width,height:frame.height},objects:definitions,anchors,matching:{positionTolerance,angleTolerance,radiusTolerance},selection_policy:'exactly-one-within-confirmed-reference-window'};
  }
  function match(candidates,anchor,settings){
    const within=candidates.filter(c=>{const g=c.geometry;if(g.type!==anchor.type||distance(center(g),center(anchor))>settings.positionTolerance)return false;
      return g.type==='circle'?Math.abs(g.radius-anchor.radius)/anchor.radius*100<=settings.radiusTolerance:angleDiff(g.angle_deg,anchor.angle_deg)<=settings.angleTolerance;});
    return within.length===1?{id:within[0].id,status:'SELECTED'}:{id:null,status:'UNKNOWN',reason:within.length?'重定位窗口內有多個候選，禁止暗取第一條':'沒有候選符合已確認的幾何窗口'};
  }
  function runFrame(image,recipe,config,inputIdentity,runPrefix='batch'){
    if(image.width!==recipe.frame.width||image.height!==recipe.frame.height)return {status:'UNKNOWN',label:'UNKNOWN',reason:'圖片尺寸與配方不同；請重新建立 ROI／校正',measurements:[],objects:[]};
    const objects=clone(recipe.objects),excludes=objects.filter(o=>o.role==='ignore'&&['rect','circle'].includes(o.type));
    for(const o of objects.filter(o=>o.kind==='tool')){
      const b=C.bounds(o);let r;
      if(b.x<0||b.y<0||b.x+b.w>image.width||b.y+b.h>image.height)r={status:'UNKNOWN',reason:'搜尋 ROI 超出影像'};
      else r=C.detect(image,{...o,exclude_rois:excludes});
      r.run_id=`${runPrefix}:${o.id}`;r.input={image:inputIdentity,roi:o.center?{center:o.center,radius:o.radius}:{x:o.x,y:o.y,width:o.width,height:o.height},parameters:clone(o.params),tool_revision:o.revision,exclude_rois:clone(excludes)};
      if(r.candidates){r.candidates.forEach((c,i)=>c.id=`${r.run_id}:c${i+1}`);const anchor=recipe.anchors[o.id];if(anchor){const matched=r.truncated||r.diagnostics?.search_truncated?{id:null,status:'UNKNOWN',reason:'候選搜尋或顯示已截斷，無法證明唯一匹配；請提高上限或縮小 ROI'}:match(r.candidates,anchor,recipe.matching);if(matched.id)r=C.choose(r,[matched.id],r.run_id);else r={...r,status:'AWAITING_SELECTION',selection_policy_status:'UNKNOWN',reason:matched.reason,selected_ids:[]};}}
      o.result=r;
    }
    const measurements=config.measurements.map(m=>measure(m,objects,config.calibration,image)),decision=classify(measurements,config.tolerances,config.classes);
    return {...decision,measurements,objects};
  }
  function csv(rows){const cell=value=>{const text=typeof value==='string'&&/^[=+@\-\t\r]/.test(value)?"'"+value:String(value??'');return '"'+text.replaceAll('"','""')+'"';};return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');}
  return {geometry,sourceIds,frameGeometry,measure,classify,capture,match,runFrame,csv,angleDiff,referenceSignature};
})();
