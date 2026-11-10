
// Small, dependency-free demonstration algorithms. No physical calibration or precision claim.
globalThis.AgentCVCore = (() => {
  const clone = value => JSON.parse(JSON.stringify(value));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function fitLine(points) {
    if (points.length < 2) return null;
    const n=points.length, cx=points.reduce((s,p)=>s+p.x,0)/n, cy=points.reduce((s,p)=>s+p.y,0)/n;
    let xx=0,yy=0,xy=0;
    for(const p of points){const x=p.x-cx,y=p.y-cy;xx+=x*x;yy+=y*y;xy+=x*y;}
    if(xx+yy<1e-8)return null;
    const angle=.5*Math.atan2(2*xy,xx-yy),ux=Math.cos(angle),uy=Math.sin(angle);
    const project=p=>(p.x-cx)*ux+(p.y-cy)*uy;
    const ts=points.map(project),low=Math.min(...ts),high=Math.max(...ts);
    const residual=p=>Math.abs(-(p.x-cx)*uy+(p.y-cy)*ux);
    return {from:{x:cx+low*ux,y:cy+low*uy},to:{x:cx+high*ux,y:cy+high*uy},angle_deg:angle*180/Math.PI,rms_px:Math.sqrt(points.reduce((s,p)=>s+residual(p)**2,0)/n),residual};
  }
  function solve3(matrix,vector){
    const a=matrix.map((row,i)=>[...row,vector[i]]);
    for(let c=0;c<3;c++){let pivot=c;for(let r=c+1;r<3;r++)if(Math.abs(a[r][c])>Math.abs(a[pivot][c]))pivot=r;
      if(Math.abs(a[pivot][c])<1e-9)return null;[a[c],a[pivot]]=[a[pivot],a[c]];
      const d=a[c][c];for(let j=c;j<4;j++)a[c][j]/=d;
      for(let r=0;r<3;r++)if(r!==c){const f=a[r][c];for(let j=c;j<4;j++)a[r][j]-=f*a[c][j];}
    }return a.map(row=>row[3]);
  }
  function fitCircle(points){
    if(points.length<3)return null;
    const ox=points.reduce((s,p)=>s+p.x,0)/points.length,oy=points.reduce((s,p)=>s+p.y,0)/points.length;
    const m=Array.from({length:3},()=>[0,0,0]),b=[0,0,0];
    for(const p of points){const x=p.x-ox,y=p.y-oy,v=[x,y,1],q=-(x*x+y*y);for(let i=0;i<3;i++){b[i]+=v[i]*q;for(let j=0;j<3;j++)m[i][j]+=v[i]*v[j];}}
    const s=solve3(m,b);if(!s)return null;const cx=-s[0]/2,cy=-s[1]/2,r2=cx*cx+cy*cy-s[2];if(r2<=0)return null;
    const center={x:cx+ox,y:cy+oy},radius=Math.sqrt(r2),residual=p=>Math.abs(Math.hypot(p.x-center.x,p.y-center.y)-radius);
    return {center,radius,rms_px:Math.sqrt(points.reduce((s,p)=>s+residual(p)**2,0)/points.length),residual};
  }
  function detect(image,a){
    const fail=reason=>({status:'UNKNOWN',reason,algorithm_version:'demo-0.7',unit:'px'});
    if(!image)return fail('影像像素尚未準備完成');
    const {width,height,gray}=image;
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<3||height<3||!gray||gray.length!==width*height)return fail('影像尺寸與灰階像素不一致');
    const params={threshold:18,polarity:'any',...(a.params||{})};
    if(!Number.isFinite(params.threshold)||params.threshold<1||params.threshold>255||!['any','rising','falling'].includes(params.polarity))return fail('邊緣強度或極性參數無效');
    const sample=(x,y)=>{x=Math.round(x);y=Math.round(y);return x<0||y<0||x>=width||y>=height?null:gray[y*width+x];};
    const strength=d=>params.polarity==='rising'?d:params.polarity==='falling'?-d:Math.abs(d);
    const threshold=params.threshold,points=[];let total=0,fit;
    // Exclusions express human intent; gradients alone cannot distinguish a background edge.
      // Each mask is an image-coordinate rect, circle, or polygon. No rescaling is implicit.
      const exclusions=a.exclude_rois||[];
      const validMask=m=>m&&((m.center&&Number.isFinite(m.center.x)&&Number.isFinite(m.center.y)&&(Number.isFinite(m.radius)&&m.radius>=0&&m.radius<=Math.max(width,height)*2))||(Array.isArray(m.points)&&m.points.length>=3&&m.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))||([m.x,m.y,m.width,m.height].every(Number.isFinite)&&m.width>=0&&m.height>=0));
      if(!Array.isArray(exclusions)||!exclusions.every(validMask))return fail('排除區域格式無效');
      const masked=(x,y)=>exclusions.some(m=>{
        if(m.center)return Math.hypot(x-m.center.x,y-m.center.y)<=m.radius;
        if(m.points){let inside=false;for(let i=0,j=m.points.length-1;i<m.points.length;j=i++){const p=m.points[i],q=m.points[j];if((p.y>y)!==(q.y>y)&&x<(q.x-p.x)*(y-p.y)/(q.y-p.y)+p.x)inside=!inside;}return inside;}
        return x>=m.x&&x<=m.x+m.width&&y>=m.y&&y<=m.y+m.height;
      });
    if(a.type==='find_line'){
      if(![a.x,a.y,a.width,a.height].every(Number.isFinite)||a.width<10||a.height<10)return fail('搜尋框至少需要 10 × 10 px');
      if(a.x<0||a.y<0||a.x+a.width>width||a.y+a.height>height)return fail('搜尋框超出影像邊界，請調整 ROI');
      const cfg={orientation:'auto',sampleStep:4,profileWidth:1,maxCandidates:8,minCoverage:.65,maxRms:1.5,maxAngle:12,minGap:4,minContinuity:.55,maxGapRatio:.15,minLocalCoverage:.35,...params};
      const valid=(v,lo,hi)=>Number.isFinite(v)&&v>=lo&&v<=hi;
      if(!Number.isInteger(cfg.profileWidth)||cfg.profileWidth<1||cfg.profileWidth>15||cfg.profileWidth%2!==1||!['auto','horizontal','vertical'].includes(cfg.orientation)||!valid(cfg.sampleStep,2,12)||!Number.isInteger(cfg.maxCandidates)||!valid(cfg.maxCandidates,1,12)||!valid(cfg.maxAngle,0,20)||!valid(cfg.minCoverage,.2,1)||!valid(cfg.maxRms,.2,5)||!valid(cfg.minGap,2,20)||!valid(cfg.minContinuity,.2,1)||!valid(cfg.maxGapRatio,0,.5)||!valid(cfg.minLocalCoverage,0,1))return fail('搜尋參數超出支援範圍');
      const horizontal=cfg.orientation==='horizontal'||(cfg.orientation==='auto'&&a.width>=a.height);
      const begin=horizontal?a.x:a.y,end=begin+(horizontal?a.width:a.height),lo=horizontal?a.y:a.x,hi=lo+(horizontal?a.height:a.width),mid=(begin+end)/2;
      const profileHalf=(cfg.profileWidth-1)/2,tangentMargin=Math.max(2,profileHalf+1);
      // Average only along the prospective edge, never across its normal. This
      // explicit caliper width reduces tangential texture noise without hiding
      // missing/ambiguous supports or changing the quality thresholds.
      const profileSample=(x,y)=>{let sum=0;for(let k=-profileHalf;k<=profileHalf;k++){const value=horizontal?sample(x+k,y):sample(x,y+k);if(value===null)return null;sum+=value;}return sum/cfg.profileWidth;};
      const scans=[];
      for(let t=begin+tangentMargin;t<end-tangentMargin;t+=cfg.sampleStep){
        const peaks=[];
        const g=v=>{const before=horizontal?profileSample(t,v-1):profileSample(v-1,t),after=horizontal?profileSample(t,v+1):profileSample(v+1,t);return before===null||after===null?0:strength(after-before);};
        for(let v=lo+2;v<hi-2;v++){
          const score=g(v);if(score<=threshold||score<=g(v-1)||score<g(v+1))continue;
          const x=horizontal?t:v,y=horizontal?v:t;
          // Every gradient stencil stays inside both the search ROI and unmasked pixels.
          let footprintMasked=false;
          for(let tangent=-profileHalf-1;tangent<=profileHalf+1&&!footprintMasked;tangent++)for(let normal=-2;normal<=2;normal++){
            const sx=Math.round(x+(horizontal?tangent:normal)),sy=Math.round(y+(horizontal?normal:tangent));
            if(sx<a.x||sx>a.x+a.width||sy<a.y||sy>a.y+a.height||masked(sx,sy)){footprintMasked=true;break;}
          }
          if(footprintMasked)continue;
          // A Sobel normal tolerates raster stair steps; a two-pixel normal rejects
          // correct oblique edges at every step corner.
          let gx=0,gy=0;for(let k=-1;k<=1;k++){const weight=k===0?2:1;gx+=weight*(profileSample(x+1,y+k)-profileSample(x-1,y+k));gy+=weight*(profileSample(x+k,y+1)-profileSample(x+k,y-1));}
          if(!Number.isFinite(gx)||!Number.isFinite(gy))continue;
          const sign=Math.sign(horizontal?gy:gx);
          peaks.push({t,v,score,x,y,gx,gy,sign,scan:scans.length});
        }
        scans.push(peaks);
      }
      total=scans.length;if(total<8)return fail('有效掃描位置少於 8 個，請加大 ROI 或縮小採樣間隔');
      const hypotheses=[];
      // Hough votes are split by polarity: opposite sides of marks must never be stitched.
      for(let angle=-cfg.maxAngle;angle<=cfg.maxAngle+.001;angle+=.5){const slope=Math.tan(angle*Math.PI/180),bins=new Map();
        for(const row of scans){const seen=new Set();for(const p of row){const key=p.sign+':'+Math.round((p.v-slope*(p.t-mid))/2);if(seen.has(key))continue;seen.add(key);bins.set(key,(bins.get(key)||0)+1);}}
        for(const [key,count] of bins)if(count>=Math.max(8,total*cfg.minCoverage*.65)){const [sign,bin]=key.split(':').map(Number);hypotheses.push({slope,q:bin*2,count,sign});}
      }
      hypotheses.sort((a,b)=>b.count-a.count);
      const candidates=[],collect=(slope,q,sign,radius)=>{
        const pts=[];for(const row of scans){let best=null,distance=radius;for(const p of row){
          if(p.sign!==sign)continue;
          const normal=horizontal?(-slope*p.gx+p.gy):(p.gx-slope*p.gy);
          const alignment=Math.abs(normal)/(Math.hypot(p.gx,p.gy)*Math.hypot(1,slope));
          if(alignment<Math.cos(30*Math.PI/180))continue;
          const d=Math.abs(p.v-slope*(p.t-mid)-q)/Math.hypot(1,slope);
          if(d<distance){best=p;distance=d;}
        }if(best)pts.push(best);}return pts;
      };
      const lineModel=f=>{
        const dt=horizontal?f.to.x-f.from.x:f.to.y-f.from.y,dv=horizontal?f.to.y-f.from.y:f.to.x-f.from.x;
        if(Math.abs(dt)<1e-6)return null;const slope=dv/dt,q=(horizontal?f.from.y:f.from.x)+slope*(mid-(horizontal?f.from.x:f.from.y));return {slope,q};
      };
      const maxResidual=Math.max(1,cfg.maxRms*1.5);
      // Bounded candidate generation is reported; it is never claimed to enumerate all lines.
      const hypothesisLimit=400;
      for(const h of hypotheses.slice(0,hypothesisLimit)){
        let pts=collect(h.slope,h.q,h.sign,Math.max(2.1,maxResidual)),f=fitLine(pts);if(!f)continue;
        const initialCount=pts.length;
        for(let pass=0;pass<2;pass++){const m=lineModel(f);if(!m)break;pts=collect(m.slope,m.q,h.sign,maxResidual);f=fitLine(pts);if(!f)break;}
        if(!f||pts.length<8||pts.length/initialCount<.85)continue;
        let inliers=pts.filter(p=>f.residual(p)<=maxResidual);if(inliers.length/pts.length<.9)continue;
        f=fitLine(inliers);if(!f)continue;
        // A single noisy scan can leave and immediately return to the same edge.
        // Remove it only when two consecutive supports on EACH side agree with
        // the fitted direction. Sustained steps and alternating edges lack that
        // five-scan evidence and remain subject to the original jump rejection.
        const preliminary=lineModel(f);if(!preliminary)continue;
        const jumpLimit=Math.max(1.25,cfg.maxRms),isolated=new Set();
        for(let i=2;i<inliers.length-2;i++){
          const five=inliers.slice(i-2,i+3);
          if(five.some((p,j)=>j&&p.scan!==five[j-1].scan+1))continue;
          const [l2,l,c,r,r2]=five.map(p=>p.v-preliminary.slope*(p.t-mid));
          if((c-l)*(c-r)>0&&Math.abs(c-l)>jumpLimit&&Math.abs(c-r)>jumpLimit&&
             Math.abs(r-l)<=1&&Math.abs(l-l2)<=jumpLimit&&Math.abs(r2-r)<=jumpLimit)isolated.add(inliers[i].scan);
        }
        if(isolated.size){
          inliers=inliers.filter(p=>!isolated.has(p.scan));
          // Keep the existing inlier budget; removed scans also remain missing
          // in every coverage, continuity, local-window and gap calculation.
          if(inliers.length<8||inliers.length/pts.length<.9)continue;
          f=fitLine(inliers);if(!f)continue;
        }
        const model=lineModel(f);if(!model)continue;
        const coverage=inliers.length/total,span=Math.hypot(f.to.x-f.from.x,f.to.y-f.from.y);
        const deviation=Math.abs(Math.atan(model.slope)*180/Math.PI);
        if(coverage<cfg.minCoverage||f.rms_px>cfg.maxRms||span<.6*(end-begin)||deviation>cfg.maxAngle+.25)continue;
        // Global RMS alone accepts scattered, unrelated edge fragments. Require continuity
        // and coverage in five local windows as separate acceptance conditions.
        const indices=new Set(inliers.map(p=>p.scan));let longest=0,run=0,gap=0,maxGap=0;
        const gaps=[];for(let i=0;i<total;i++){if(indices.has(i)){run++;longest=Math.max(longest,run);gap=0;}else{if(!gap)gaps.push({start:i,length:0});gaps.at(-1).length++;gap++;if(gap>1)run=0;maxGap=Math.max(maxGap,gap);}}
        const rawContinuity=longest/total,missingRatio=(total-inliers.length)/total;
        // Sparse two-scan dropouts may split an otherwise well-supported edge.
        // This is a bounded heuristic, not proof of physical edge continuity:
        // <=8% total missing, at most one pair per 80 scans (cap two), eight
        // genuine supports on BOTH sides, and >=10% scan-span between pairs.
        // Missing scans never become inliers or improve coverage/gap metrics.
        const pairs=gaps.filter(g=>g.length===2),bridgeLimit=Math.min(2,Math.max(1,Math.floor(total/80))),spacing=Math.max(16,Math.ceil(total*.1));
        const bridged=missingRatio<=.08&&pairs.length<=bridgeLimit&&pairs.every((g,i)=>!i||g.start-(pairs[i-1].start+pairs[i-1].length)>=spacing)
          ?pairs.filter(g=>Array.from({length:8},(_,i)=>i+1).every(n=>indices.has(g.start-n)&&indices.has(g.start+g.length-1+n))):[];
        if(bridged.length){const starts=new Set(bridged.map(g=>g.start));longest=0;run=0;gap=0;let allowance=1;
          for(let i=0;i<total;i++){if(indices.has(i)){run++;longest=Math.max(longest,run);gap=0;}else{if(!gap)allowance=starts.has(i)?2:1;gap++;if(gap>allowance)run=0;}}
        }
        const local=[];for(let window=0;window<5;window++){const start=Math.floor(window*total/5),stop=Math.floor((window+1)*total/5);let count=0;for(let i=start;i<stop;i++)if(indices.has(i))count++;local.push(count/Math.max(1,stop-start));}
        const continuity=longest/total,gapRatio=maxGap/total;
        if(continuity<cfg.minContinuity||gapRatio>cfg.maxGapRatio||Math.min(...local)<cfg.minLocalCoverage)continue;
        // Adjacent supports cannot jump between distinct parallel edges and then be hidden
        // by a single least-squares summary. Raster stair steps of 1 px remain acceptable.
        let jump=false;for(let i=1;i<inliers.length;i++){const p=inliers[i-1],q=inliers[i];if(q.scan-p.scan===1&&Math.abs((q.v-p.v)-model.slope*(q.t-p.t))>Math.max(1.25,cfg.maxRms)){jump=true;break;}}
        if(jump)continue;
        const residuals=inliers.map(p=>f.residual(p)).sort((a,b)=>a-b),p95=residuals[Math.floor((residuals.length-1)*.95)];
        if(p95>Math.max(.8,cfg.maxRms*1.35))continue;
        const {residual,...geometry}=f;
        const contrasts=inliers.map(p=>p.score).sort((a,b)=>a-b);
        candidates.push({position:model.q,model,geometry:{type:'line',...geometry},points:inliers.map(p=>({x:p.x,y:p.y})),sample_count:total,inlier_count:inliers.length,coverage,quality:{profile_width:cfg.profileWidth,isolated_outliers_removed:isolated.size,continuity,raw_continuity:rawContinuity,continuity_gap_tolerance_scans:bridged.length?2:1,bridged_short_gaps:bridged.map(g=>({start_scan:g.start,end_scan:g.start+g.length-1})),largest_gap_ratio:gapRatio,local_coverage:local,residual_p95_px:p95,inlier_ratio:inliers.length/pts.length,edge_polarity:h.sign>0?'rising':'falling',median_contrast:contrasts[Math.floor(contrasts.length/2)],exclusion_count:exclusions.length}});
      }
      candidates.sort((a,b)=>b.coverage-a.coverage||b.quality.continuity-a.quality.continuity||a.geometry.rms_px-b.geometry.rms_px);
      const unique=[];
      for(const c of candidates){
        // Compare both ends of the fitted models, not only midpoint/absolute angle.
        if(unique.some(d=>[-.4,.4].every(r=>Math.abs(c.model.q-d.model.q+(c.model.slope-d.model.slope)*r*(end-begin))<cfg.minGap)))continue;
        unique.push(c);
      }
      const count=unique.length,shown=unique.slice(0,cfg.maxCandidates).sort((a,b)=>a.position-b.position).map(({model,...c},i)=>({...c,id:`c${i+1}`}));
      if(!shown.length)return {...fail('沒有通過局部覆蓋、連續性、方向及殘差條件的候選線'),diagnostics:{scan_count:total,hypothesis_count:hypotheses.length,hypothesis_limit: hypothesisLimit,search_truncated:hypotheses.length>hypothesisLimit,exclusion_count:exclusions.length}};
      return {status:'AWAITING_SELECTION',candidates:shown,selected_ids:[],rejected_ids:[],candidate_count:count,truncated:count>shown.length,diagnostics:{scan_count:total,hypothesis_count:hypotheses.length,hypothesis_limit:hypothesisLimit,search_truncated:hypotheses.length>hypothesisLimit,exclusion_count:exclusions.length},algorithm_version:'demo-0.7',unit:'px'};
    }
    if(a.type==='find_circle'){
      if(!a.center||![a.center.x,a.center.y,a.radius].every(Number.isFinite)||a.radius<12)return fail('搜尋半徑至少需要 12 px');
      if(a.center.x-a.radius<0||a.center.y-a.radius<0||a.center.x+a.radius>width||a.center.y+a.radius>height)return fail('搜尋圓超出影像邊界，請調整 ROI');
      total=96;
      for(let i=0;i<total;i++){const theta=i*2*Math.PI/total,ux=Math.cos(theta),uy=Math.sin(theta);let best=null,score=threshold;
        for(let r=Math.max(3,a.radius*.5);r<a.radius-1;r+=.7){
          if([r-1,r,r+1].some(s=>masked(a.center.x+s*ux,a.center.y+s*uy)))continue;
          const before=sample(a.center.x+(r-1)*ux,a.center.y+(r-1)*uy),after=sample(a.center.x+(r+1)*ux,a.center.y+(r+1)*uy);if(before===null||after===null)continue;
          const g=strength(after-before);if(g>score){score=g;best={x:a.center.x+r*ux,y:a.center.y+r*uy};}}
        if(best)points.push(best);
      }
      fit=fitCircle(points);if(!fit)return fail('有效邊緣不足，無法擬合圓');
      const inliers=points.filter(p=>fit.residual(p)<=2);fit=fitCircle(inliers);
      if(!fit||inliers.length/total<.7||fit.rms_px>1.5)return fail('圓周覆蓋不足或擬合殘差過大');
      if(Math.hypot(fit.center.x-a.center.x,fit.center.y-a.center.y)>.3*a.radius||fit.radius<.45*a.radius||fit.radius>a.radius)return fail('圓參數超出搜尋範圍');
      const {residual,...geometry}=fit;
      return {status:'AWAITING_SELECTION',candidates:[{id:'c1',geometry:{type:'circle',...geometry},sample_count:total,inlier_count:inliers.length,points:inliers,coverage:inliers.length/total}],selected_ids:[],rejected_ids:[],candidate_count:1,truncated:false,algorithm_version:'demo-0.7',unit:'px'};
    }
    return fail('不是功能控件');
  }
  function choose(result,ids,runId,rejected=result.rejected_ids||[]){
    if(typeof runId!=='string'||!runId||!['AWAITING_SELECTION','SELECTED'].includes(result.status)||result.run_id!==runId)throw Error('結果已失效或執行批次不一致');
    const available=new Set(result.candidates.map(c=>c.id)),selected=[...new Set(ids)],excluded=[...new Set(rejected)];
    if([...selected,...excluded].some(id=>!available.has(id)))throw Error('候選不屬於本次計算');
    if(selected.some(id=>excluded.includes(id)))throw Error('同一候選不能同時採用與排除');
    return {...clone(result),status:selected.length?'SELECTED':'AWAITING_SELECTION',selected_ids:selected,rejected_ids:excluded,output:{type:'GeometrySet',items:selected.map(id=>({candidate_id:id,geometry:clone(result.candidates.find(c=>c.id===id).geometry)}))}};
  }
  function bounds(a){if(a.center)return {x:a.center.x-a.radius,y:a.center.y-a.radius,w:a.radius*2,h:a.radius*2};if(a.from)return {x:Math.min(a.from.x,a.to.x),y:Math.min(a.from.y,a.to.y),w:Math.abs(a.from.x-a.to.x),h:Math.abs(a.from.y-a.to.y)};if(a.points){const xs=a.points.map(p=>p.x),ys=a.points.map(p=>p.y);return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};}if(a.at)return {x:a.at.x,y:a.at.y,w:0,h:0};return {x:a.x,y:a.y,w:a.width,h:a.height};}
  function translate(a,dx,dy,width=800,height=440){const b=bounds(a);dx=clamp(dx,-b.x,width-b.x-b.w);dy=clamp(dy,-b.y,height-b.y-b.h);const copy=clone(a),shift=p=>({x:p.x+dx,y:p.y+dy});if(copy.center)copy.center=shift(copy.center);else if(copy.from){copy.from=shift(copy.from);copy.to=shift(copy.to);}else if(copy.points)copy.points=copy.points.map(shift);else if(copy.at)copy.at=shift(copy.at);else{copy.x+=dx;copy.y+=dy;}if(copy.kind==='tool')copy.result={status:'STALE',reason:'控件已移動，等待重算'};return copy;}
  function shortcut(e,editing=false){
    if(editing||e.isComposing||e.keyCode===229||e.altKey)return null;
    const key=e.key.toLowerCase(),mod=e.ctrlKey||e.metaKey;
    if(mod){if(key==='z')return {action:e.shiftKey?'redo':'undo'};if(key==='y')return {action:'redo'};if(!e.shiftKey&&['d','c','v'].includes(key))return {action:{d:'duplicate',c:'copy',v:'paste'}[key]};return null;}
    if(e.key==='ContextMenu'||(e.key==='F10'&&e.shiftKey))return {action:'menu'};
    if(e.key==='Escape')return {action:'escape'};
    if(e.key==='Enter'||e.key==='F2')return {action:e.key==='F2'?'rename':'edit'};
    if(e.key==='Delete'||e.key==='Backspace')return {action:'delete'};
    const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    if(directions[e.key])return {action:'move',dx:directions[e.key][0]*(e.shiftKey?10:1),dy:directions[e.key][1]*(e.shiftKey?10:1)};
    if(e.key==='?')return {action:'help'};
    const tools={v:'select',l:'line',c:'circle',r:'rect',b:'pen',t:'note',f:'find_line',o:'find_circle'};
    return !e.shiftKey&&tools[key]?{action:'tool',tool:tools[key]}:null;
  }
  return {clone,clamp,fitLine,fitCircle,detect,choose,bounds,translate,shortcut};
})();
