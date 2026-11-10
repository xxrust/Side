// One isotropic transform for camera pixels. The camera raster is never resized
// or cropped in storage; fitting the observed object is a reversible view.
export function fitPipelineViewport({width,height,imageWidth,imageHeight,bounds,extent='image',zoom=1,pan={x:0,y:0},padding=18}) {
  const full={x:0,y:0,width:imageWidth,height:imageHeight};
  const valid=bounds&&Number.isFinite(bounds.x)&&Number.isFinite(bounds.y)&&bounds.width>0&&bounds.height>0;
  const target=extent==='workpiece'&&valid?bounds:full;
  const availableWidth=Math.max(1,width-2*padding),availableHeight=Math.max(1,height-2*padding);
  const scale=Math.min(availableWidth/target.width,availableHeight/target.height)*zoom;
  return {scale,x:width/2-(target.x+target.width/2)*scale+(pan.x||0),y:height/2-(target.y+target.height/2)*scale+(pan.y||0),target:{...target},extent:target===full?'image':'workpiece',imageBounds:full};
}

export function observedPipelineBounds(result) {
  const components=result?.nodes?.find(n=>n.op==='regions.components'&&n.status==='OK');
  const candidates=components?.artifacts?.find(a=>a.id?.endsWith(':component-candidates'))?.data;
  const id=components?.outputSummary?.selectedComponentId;
  return candidates?.candidates?.find(c=>c.id===id)?.bounds||null;
}

// A locator is secondary to the workpiece. Find unused screen space, including
// its frame and caption; omit it when zoom/pan leaves no safe space.
export function fitPipelineLocator({width,height,imageWidth,imageHeight,transform,bounds}) {
  if(!bounds||!transform||!(imageWidth>0&&imageHeight>0))return null;
  const object={x:transform.x+bounds.x*transform.scale,y:transform.y+bounds.y*transform.scale,width:bounds.width*transform.scale,height:bounds.height*transform.scale};
  const overlaps=(a,b)=>a.x<b.x+b.width+5&&a.x+a.width+5>b.x&&a.y<b.y+b.height+5&&a.y+a.height+5>b.y;
  const initial=Math.min(110,width*.2,height*.3*imageWidth/imageHeight);
  for(let w=initial;w>=32;w-=8){
    const h=w*imageHeight/imageWidth,boxWidth=w+8,boxHeight=h+27;
    if(boxWidth>width-12||boxHeight>height-12)continue;
    for(const [x,y]of [[width-boxWidth-6,6],[6,6],[width-boxWidth-6,height-boxHeight-6],[6,height-boxHeight-6]]){
      const box={x,y,width:boxWidth,height:boxHeight};
      if(!overlaps(box,object))return {x:x+4,y:y+4,width:w,height:h,box};
    }
  }
  return null;
}
