const finite=Number.isFinite;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export const overlayBoxesOverlap=(a,b,gap=0)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;
const centerOf=box=>({x:box.x+box.width/2,y:box.y+box.height/2});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function outsideWorkpiece(box,radial,gap){
 if(!radial)return true;
 const x=clamp(radial.center.x,box.x,box.x+box.width),y=clamp(radial.center.y,box.y,box.y+box.height);
 return Math.hypot(x-radial.center.x,y-radial.center.y)>=radial.radius+gap;
}
function markerBox(marker){return marker.width!==undefined?marker:{x:marker.x-marker.radius,y:marker.y-marker.radius,width:marker.radius*2,height:marker.radius*2}}

/** Screen-space annotation layout. Anchors and marker coordinates are immutable inputs. */
export function layoutOverlayLabels(labels,{markers=[],viewport={x:0,y:0,width:640,height:360},gap=3,margin=4}={}){
 const placed=[],unplaced=[],obstacles=markers.map(markerBox),left=viewport.x+margin,top=viewport.y+margin,right=viewport.x+viewport.width-margin,bottom=viewport.y+viewport.height-margin;
 for(const label of labels){
  const anchor=label.anchor,width=label.width,height=label.height;
  if(!anchor||![anchor.x,anchor.y,width,height].every(finite)||width<=0||height<=0){unplaced.push({...label,reason:'INVALID_LABEL'});continue}
  if(width>right-left||height>bottom-top){unplaced.push({...label,reason:'VIEWPORT_TOO_SMALL'});continue}
  const radial=label.radial,base=radial?Math.atan2(anchor.y-radial.center.y,anchor.x-radial.center.x):0,candidates=[];
  const add=(cx,cy,penalty=0)=>{const box={x:cx-width/2,y:cy-height/2,width,height};if(box.x<left||box.y<top||box.x+width>right||box.y+height>bottom||!outsideWorkpiece(box,radial,gap))return;if(obstacles.some(obstacle=>overlayBoxesOverlap(box,obstacle,gap))||placed.some(other=>overlayBoxesOverlap(box,other.box,gap)))return;const cost=distance(centerOf(box),anchor)+penalty;candidates.push({box,cost})};
  // Search outward from the preferred radial direction, or in concentric local rings.
  for(let ring=0;ring<10;ring++)for(let offset=0;offset<32;offset++){
   const signed=offset===0?0:(offset%2?1:-1)*Math.ceil(offset/2),angle=base+signed*Math.PI/16,dx=Math.cos(angle),dy=Math.sin(angle),extent=Math.abs(dx)*width/2+Math.abs(dy)*height/2;
   if(radial){const radius=radial.radius+gap+7+extent+ring*(height+gap);add(radial.center.x+dx*radius,radial.center.y+dy*radius,Math.abs(signed)*.8)}
   else{const radius=extent+gap+7+ring*(height+gap);add(anchor.x+dx*radius,anchor.y+dy*radius)}
  }
  // A viewport-wide fallback handles dense clusters and shapes close to an edge.
  if(!candidates.length){const step=Math.max(4,Math.min(height/2,8));for(let y=top;y+height<=bottom;y+=step)for(let x=left;x+width<=right;x+=step)add(x+width/2,y+height/2)}
  if(!candidates.length){unplaced.push({...label,reason:'NO_COLLISION_FREE_SPACE'});continue}
  candidates.sort((a,b)=>a.cost-b.cost||a.box.y-b.box.y||a.box.x-b.box.x);const box=candidates[0].box;
  const target={x:clamp(anchor.x,box.x,box.x+width),y:clamp(anchor.y,box.y,box.y+height)};
  placed.push({...label,anchor:{...anchor},box,leader:{from:{...anchor},to:target}});
 }
 return {placed,unplaced};
}
