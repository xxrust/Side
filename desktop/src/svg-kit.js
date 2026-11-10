// Code-native diagrams. Text and metadata are escaped, including imported names.
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export const ink={bg:'#10212b',card:'#192f3b',line:'#456471',text:'#e4f1ec',muted:'#acc3ce',green:'#91edbd',orange:'#f4b362',blue:'#78bddd',red:'#ef9692'};
export const text=(x,y,s,size=16,color=ink.text,extra='')=>`<text x="${x}" y="${y}" fill="${color}" font-size="${size}" ${extra}>${esc(s)}</text>`;
export const rect=(x,y,w,h,fill=ink.card,stroke=ink.line,r=9)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}"/>`;
export const line=(x1,y1,x2,y2,color=ink.muted,width=2,extra='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${extra}/>`;
export const circle=(x,y,r,color=ink.green,extra='')=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" ${extra}/>`;
export const arrow=(x1,y1,x2,y2,color=ink.green)=>{const a=Math.atan2(y2-y1,x2-x1),n=9;return line(x1,y1,x2,y2,color,2)+`<path d="M ${x2-n*Math.cos(a-.45)} ${y2-n*Math.sin(a-.45)} L ${x2} ${y2} L ${x2-n*Math.cos(a+.45)} ${y2-n*Math.sin(a+.45)}" fill="none" stroke="${color}" stroke-width="2"/>`};
export const svg=(content,{width=960,height=420,label='圖解',kind='schematic'}={})=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}" data-diagram-kind="${kind}" style="font-family:'Heiti TC','PingFang TC',sans-serif"><title>${esc(label)}</title><rect width="${width}" height="${height}" fill="${ink.bg}"/>${content}</svg>`;
export const points=ps=>ps.map(p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
export function fitPoints(ps,box){const xs=ps.map(p=>p.x),ys=ps.map(p=>p.y),minx=Math.min(...xs),miny=Math.min(...ys),w=Math.max(1,Math.max(...xs)-minx),h=Math.max(1,Math.max(...ys)-miny),s=Math.min(box.width/w,box.height/h);return p=>({x:box.x+(box.width-w*s)/2+(p.x-minx)*s,y:box.y+(box.height-h*s)/2+(p.y-miny)*s})}
