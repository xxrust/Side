// Give a just-committed pair a presentation opportunity before speculative
// canvas readback/gray preparation. Hidden windows still make progress via
// the bounded timer. This only delays lookahead, never a required input read.
export function yieldForPresentation({signal,requestFrame=globalThis.requestAnimationFrame,cancelFrame=globalThis.cancelAnimationFrame,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 if(signal?.aborted||typeof requestFrame!=='function')return Promise.resolve();
 return new Promise(resolve=>{
  let frame,timer,done=false;
  const finish=()=>{if(done)return;done=true;if(frame!==undefined)cancelFrame?.(frame);if(timer!==undefined)clearTimer(timer);signal?.removeEventListener('abort',finish);resolve();};
  signal?.addEventListener('abort',finish,{once:true});
  timer=setTimer(finish,50);
  frame=requestFrame(()=>{if(!done)frame=requestFrame(finish);});
 });
}

// Display decoding is distinct from verified pixel preparation. It too can
// occupy WebKit's image/rendering resources while the prior pair is presenting.
export async function prepareInputDisplay(input,imageId,{hasFrame=false,isCurrent,signal,yieldPresentation=yieldForPresentation}={}){
 if(!input||!imageId||signal?.aborted||!isCurrent())return;
 if(hasFrame)await yieldPresentation({signal});
 if(signal?.aborted||!isCurrent())return;
 return input.prepare({imageId},{activeId:imageId,isCurrent});
}
