import {P,C,sides,sideNames} from './model.js';
export class Board {
  constructor(canvas,project,notify){this.el=canvas;this.p=project;this.notify=notify;this.side=null;this.mode='inspect';this.page='images';this.scale=1;this.x=0;this.y=0;this.space=false;this.drag=null;this.imageId=null;this.highlight=null;this.resize=new ResizeObserver(()=>{if(!this.imageId)this.fit();else this.paint()});this.resize.observe(canvas);
    canvas.addEventListener('wheel',e=>{e.preventDefault();const b=canvas.getBoundingClientRect();this.zoom(Math.exp(-e.deltaY*.0015),{x:e.clientX-b.left,y:e.clientY-b.top})},{passive:false});
    canvas.addEventListener('pointerdown',e=>this.down(e));canvas.addEventListener('pointermove',e=>this.move(e));canvas.addEventListener('pointerup',e=>this.up(e));canvas.addEventListener('pointercancel',()=>this.cancel());
    window.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable)return;if(e.code==='Space'){this.space=true;e.preventDefault()}if(e.key==='Escape'){this.cancel();this.mode='inspect';this.paint();this.notify('已退出畫線')} });window.addEventListener('keyup',e=>{if(e.code==='Space')this.space=false});window.addEventListener('blur',()=>{this.space=false;this.cancel()});
  }
  bounds(){return this.el.getBoundingClientRect()}
  point(e){const b=this.bounds();return {x:(e.clientX-b.left-this.x)/this.scale,y:(e.clientY-b.top-this.y)/this.scale}}
  clamp(p){const img=this.p.image;return {x:C.clamp(p.x,0,img.width),y:C.clamp(p.y,0,img.height)}}
  setPage(page,side){const changed=this.page!==page||this.side!==side,empty=side&&!this.p.tool(side)&&!this.p.intent(side);this.page=page;this.side=side;if(changed||empty)this.mode=empty?'draw':'inspect';this.paint()}
  fit(){const img=this.p.image,b=this.bounds();if(img&&b.width&&b.height){this.scale=Math.min((b.width-72)/img.width,(b.height-64)/img.height);this.x=(b.width-img.width*this.scale)/2;this.y=(b.height-img.height*this.scale)/2;}this.paint()}
  zoom(factor,at){const b=this.bounds();at=at||{x:b.width/2,y:b.height/2};const old=this.scale;this.scale=C.clamp(old*factor,.05,40);this.x=at.x-(at.x-this.x)*this.scale/old;this.y=at.y-(at.y-this.y)*this.scale/old;this.paint()}
  lineDistance(pt,g){const dx=g.to.x-g.from.x,dy=g.to.y-g.from.y,t=C.clamp(((pt.x-g.from.x)*dx+(pt.y-g.from.y)*dy)/(dx*dx+dy*dy),0,1);return Math.hypot(pt.x-g.from.x-t*dx,pt.y-g.from.y-t*dy)}
  down(e){if(this.locked||!this.p.image||e.button===2)return;this.el.focus();this.el.setPointerCapture(e.pointerId);const pt=this.point(e);if(this.space||e.button===1){this.drag={type:'pan',client:{x:e.clientX,y:e.clientY},x:this.x,y:this.y};return}
    if(this.side&&this.mode==='draw'){this.drag={type:'draw',start:this.clamp(pt),end:this.clamp(pt)};return}
    const tool=this.side&&this.p.tool(this.side);if(tool){const handles=[{x:tool.x,y:tool.y},{x:tool.x+tool.width,y:tool.y+tool.height}];const handle=handles.findIndex(p=>Math.hypot(pt.x-p.x,pt.y-p.y)*this.scale<12);
      const onLabel=pt.x>=tool.x&&pt.x<=tool.x+Math.min(tool.width,150/this.scale)&&pt.y>=tool.y-26/this.scale&&pt.y<=tool.y;
      if(handle>=0||onLabel){this.drag={type:'roi',handle,start:pt,original:{x:tool.x,y:tool.y,width:tool.width,height:tool.height},changed:false};return}
      const candidates=tool.result?.candidates||[],nearest=candidates.map(c=>({c,d:this.lineDistance(pt,c.geometry)})).sort((a,b)=>a.d-b.d)[0];
      if(nearest&&nearest.d*this.scale<10){try{this.p.adopt(this.side,nearest.c.id);this.notify('已選擇'+sideNames[this.side])}catch(err){this.notify(err.message)}return}
      if(pt.x>=tool.x&&pt.x<=tool.x+tool.width&&pt.y>=tool.y&&pt.y<=tool.y+tool.height){this.drag={type:'roi',handle:-1,start:pt,original:{x:tool.x,y:tool.y,width:tool.width,height:tool.height},changed:false};return}
    }
    this.drag={type:'pan',client:{x:e.clientX,y:e.clientY},x:this.x,y:this.y};
  }
  move(e){const d=this.drag;if(!d)return;if(d.type==='pan'){this.x=d.x+e.clientX-d.client.x;this.y=d.y+e.clientY-d.client.y;this.paint();return}const pt=this.clamp(this.point(e));if(d.type==='draw'){d.end=pt;this.paint();return}
    const tool=this.p.tool(this.side),img=this.p.image;if(!tool)return;
    if(!d.changed){if(Math.hypot(pt.x-d.start.x,pt.y-d.start.y)*this.scale<3)return;this.p.checkpoint();this.p.startInvalidation(this.side);d.changed=true}
    const r=d.original,dx=pt.x-d.start.x,dy=pt.y-d.start.y;
    if(d.handle===-1){tool.x=C.clamp(r.x+dx,0,img.width-r.width);tool.y=C.clamp(r.y+dy,0,img.height-r.height)}
    else if(d.handle===0){tool.x=C.clamp(r.x+dx,0,r.x+r.width-10);tool.y=C.clamp(r.y+dy,0,r.y+r.height-10);tool.width=r.x+r.width-tool.x;tool.height=r.y+r.height-tool.y}
    else {tool.width=C.clamp(r.width+dx,10,img.width-r.x);tool.height=C.clamp(r.height+dy,10,img.height-r.y)}this.paint();
  }
  async up(){const d=this.drag;this.drag=null;if(!d)return;try{if(d.type==='draw'){this.p.drawIntent(this.side,d.start,d.end);this.mode='inspect';this.notify('標註已記錄，接著搜尋真實邊緣')}else if(d.type==='roi'&&d.changed){const t=this.p.tool(this.side);await this.p.updateROI(this.side,{x:t.x,y:t.y,width:t.width,height:t.height},{},false);this.notify('搜尋框已更新，請重新選擇邊緣')}}catch(e){this.notify(e.message)}this.paint()}
  cancel(){if(this.drag?.type==='roi'&&this.drag.changed)this.p.undo();this.drag=null;this.paint()}
  label(ctx,text,x,y,color='#d5edf2'){ctx.font=`${12/this.scale}px -apple-system, sans-serif`;const w=ctx.measureText(text).width;ctx.fillStyle='#11191fe8';ctx.fillRect(x-4/this.scale,y-15/this.scale,w+8/this.scale,21/this.scale);ctx.fillStyle=color;ctx.fillText(text,x,y)}
  paint(){const b=this.bounds(),dpr=window.devicePixelRatio||1;this.el.width=Math.max(1,Math.round(b.width*dpr));this.el.height=Math.max(1,Math.round(b.height*dpr));const ctx=this.el.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#0c1218';ctx.fillRect(0,0,b.width,b.height);const img=this.p.image,raster=img&&this.p.pixels.get(img.id);if(!raster)return;
    if(img.id!==this.imageId){this.imageId=img.id;this.fit();return}ctx.translate(this.x,this.y);ctx.scale(this.scale,this.scale);ctx.imageSmoothingEnabled=false;ctx.drawImage(raster.image,0,0,img.width,img.height);
    const line=(a,b,color,width=2,dash=[])=>{ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=width/this.scale;ctx.setLineDash(dash.map(v=>v/this.scale));ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([])};
    if(this.side){for(const s of sides.filter(s=>s!==this.side)){const g=P.geometry(this.p.tool(s));if(g)line(g.from,g.to,'#77d0b580',1)}
      const tool=this.p.tool(this.side),intent=this.p.intent(this.side);if(!tool&&intent){line(intent.from,intent.to,'#80d7b8',3,[5,4]);this.label(ctx,'手繪位置',intent.from.x,intent.from.y-10/this.scale)}
      if(tool){ctx.strokeStyle='#ffc885';ctx.lineWidth=1.5/this.scale;ctx.setLineDash([5/this.scale,4/this.scale]);ctx.strokeRect(tool.x,tool.y,tool.width,tool.height);ctx.setLineDash([]);this.label(ctx,'↔ 拖動搜尋框',tool.x,tool.y-8/this.scale,'#ffc885');for(const pt of [{x:tool.x,y:tool.y},{x:tool.x+tool.width,y:tool.y+tool.height}]){ctx.fillStyle='#ffc885';ctx.fillRect(pt.x-5/this.scale,pt.y-5/this.scale,10/this.scale,10/this.scale)}
        for(const [i,c] of (tool.result?.candidates||[]).entries()){const chosen=tool.result.selected_ids?.includes(c.id);line(c.geometry.from,c.geometry.to,chosen?'#a3f1bf':c.id===this.highlight?'#f5d88d':'#46cbff',chosen?3:2);this.label(ctx,`${i+1}${chosen?' ✓':''}`,c.geometry.from.x+8/this.scale,c.geometry.from.y-7/this.scale,chosen?'#a3f1bf':'#46cbff')}
        if(tool.note)this.label(ctx,tool.note,tool.x,tool.y+tool.height+22/this.scale,'#e4dda5');
      }
    }
    if(['measure','tolerance-width','tolerance-height','result','batch'].includes(this.page)){const ms=this.p.measurements();if(ms[0]?.frame_corners){const cs=ms[0].frame_corners;for(let i=0;i<4;i++)line(cs[i],cs[(i+1)%4],'#adcefe',2,[6,5]);for(const m of ms){line(m.overlay.from,m.overlay.to,'#b6f3cf',2);const mid={x:(m.overlay.from.x+m.overlay.to.x)/2,y:(m.overlay.from.y+m.overlay.to.y)/2};this.label(ctx,`${m.name} ${m.value.toFixed(3)} ${m.unit}`,mid.x+8/this.scale,mid.y-10/this.scale,'#c2ffd3')}}}
    if(this.drag?.type==='draw')line(this.drag.start,this.drag.end,'#80d7b8',3,[5,4]);this.el.style.cursor=this.mode==='draw'?'crosshair':this.drag?.type==='pan'?'grabbing':'default';document.getElementById('zoomLabel').textContent=Math.round(this.scale*100)+'%';
  }
}
