// Visualise the actual arrays emitted by foregroundCandidates, never a second segmentation.
const inside=(x,y,points)=>{let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[j],b=points[i],cross=(x-a.x)*(b.y-a.y)-(y-a.y)*(b.x-a.x);if(Math.abs(cross)<1e-7&&x>=Math.min(a.x,b.x)&&x<=Math.max(a.x,b.x)&&y>=Math.min(a.y,b.y)&&y<=Math.max(a.y,b.y))return true;if((b.y>y)!==(a.y>y)&&x<(a.x-b.x)*(y-b.y)/(a.y-b.y)+b.x)hit=!hit}return hit};
const colour=id=>{let n=(id*2654435761)>>>0;n^=n>>>13;return [45+(n&63),45+((n>>>8)&63),70+((n>>>16)&63)]};
export function foregroundLayers(image,analysis,candidate,{createCanvas=()=>document.createElement('canvas')}={}){
 const trace=analysis?.trace,original={id:'original',title:'原圖',bitmap:image.image,step:1,width:image.width,height:image.height,metrics:[['原圖',`${image.width} × ${image.height} px`]],note:'未修改的原圖；滾輪縮放，拖曳平移。'};
 const layers=[original];if(!trace)return {layers,addedPixels:0};
 if(trace.sourceWidth!==image.width||trace.sourceHeight!==image.height)throw Error('中間圖與原圖尺寸不一致');
 const {width,height,sampleStep:step}=trace,n=width*height;
 if(trace.gray.length!==n)throw Error('中間灰階圖不完整');
 const bitmap=read=>{const canvas=createCanvas();canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d'),data=ctx.createImageData(width,height);for(let i=0;i<n;i++){const rgb=read(i),k=i*4;data.data[k]=rgb[0];data.data[k+1]=rgb[1];data.data[k+2]=rgb[2];data.data[k+3]=255}ctx.putImageData(data,0,0);return canvas};
 const base={step,width:image.width,height:image.height};
 layers.push({...base,id:'gray',title:'灰階／取樣',bitmap:bitmap(i=>[trace.gray[i],trace.gray[i],trace.gray[i]]),metrics:[['計算網格',`${width} × ${height}`],['採樣間隔',`${step} px`]],note:'實際計算的灰階採樣格；取樣點取整，不是縮圖平均。'});
 if(trace.threshold===null)return {layers,addedPixels:0};
 const polarity=candidate?.component?.polarity||candidate?.quality?.polarity||Object.keys(trace.masks)[0],label=candidate?(candidate.component?.label??Number(candidate.id.split('-').at(-1))+1):null,mask=trace.masks[polarity],labels=trace.labels[polarity];
 if(!mask||!labels||mask.length!==n||labels.length!==n)throw Error('連通區中間圖不完整');
 const counts=trace.counts[polarity];
 layers.push({...base,id:'binary',title:'閾值分割',bitmap:bitmap(i=>[mask[i],mask[i],mask[i]]),metrics:[[analysis.parameters?.thresholdMode==='manual'?'手動閾值':'Otsu 閾值',trace.threshold],['白色條件',`${polarity==='bright'?'>':'≤'} ${trace.threshold}`],['白色格數',counts.foregroundPixels]],note:'白色是本候選極性的前景，黑色是背景；尚未挑選工件。'});
 layers.push({...base,id:'components',title:'連通區',bitmap:bitmap(i=>labels[i]===label?[137,242,190]:labels[i]?colour(labels[i]):[13,21,27]),metrics:[['連通區',counts.components],['通過篩選',counts.retained],['本候選格數',candidate?.component?.pixelCount??labels.reduce((s,v)=>s+(v===label),0)]],note:'綠色為所選候選；其他顏色為其他四鄰接連通區（含被篩除區塊）。'});
 if(!candidate)return {layers,addedPixels:0,polarity,label:null};
 let addedPixels=0;const hullBitmap=bitmap(i=>{if(labels[i]===label)return [137,242,190];if(inside(i%width*step,Math.floor(i/width)*step,candidate.points)){addedPixels++;return [245,174,80]}return [13,21,27]});
 layers.push({...base,id:'hull',title:'凸包',bitmap:hullBitmap,outline:candidate.points,metrics:[['凸包頂點',candidate.points.length],['新增包絡格數',addedPixels],['原連通區格數',candidate.component?.pixelCount??'—']],note:'綠色保留連通區；橙色是凸包填入的凹陷或孔洞。包絡線不是精密物體輪廓。'});
 return {layers,addedPixels,polarity,label};
}
