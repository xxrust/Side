// One-unit lookahead over the runner's actual iterator. Only ordinary image
// preparation is speculative; dispatch, validation and publication stay serial.
export function createWorkpieceInputPrefetch(project,iterable,{enabled=false,isCurrent=()=>true,signal,deferPreparation}={}){
 const iterator=iterable[Symbol.asyncIterator]();let pending=null,adopted=null,disposed=false;
 const valid=()=>!disposed&&!signal?.aborted&&isCurrent();
 const release=slot=>{slot?.release?.();if(slot){slot.release=null;slot.retired=true;}};
 const read=()=>{const slot={};slot.result=Promise.resolve().then(()=>iterator.next()).then(value=>({value}),error=>({error}));return slot;};
 const api={
  [Symbol.asyncIterator](){return this;},
  async next(){
   release(adopted);adopted=null;
   const slot=pending||read();pending=null;
   const result=await slot.result;
   if(result.error)throw result.error;
   adopted=slot;
   return result.value;
  },
  async prime(){
   // Wait only until the real first unit has been obtained and its ordinary
   // preparation started. The decode itself overlaps the caller's setup work.
   if(!enabled||!valid())return;
   api.start({immediate:true});await pending?.result;
  },
  start({immediate=false}={}){
   release(adopted);adopted=null;
   if(!enabled||pending||!valid())return;
   const slot=read();pending=slot;
   slot.ready=slot.result.then(async({value,error})=>{
    if(error||value.done||slot.retired||!valid())return;
    const ids=value.value?.imageIds||Object.values(value.value?.views||{});
    if(!Array.isArray(ids)||!ids.length||ids.length>16||ids.some(id=>typeof id!=='string'))return;
    try{
     if(!immediate&&deferPreparation)await deferPreparation();
     if(slot.retired||!valid())return;
     slot.release=project.pinImages?.([...new Set(ids)]);
     for(const id of new Set(ids)){if(slot.retired||!valid())break;await project.ensureImagePixels?.(id);}
    }catch{release(slot);} // The actual unit's normal input-read gate retries/reports failure.
    finally{if(!valid())release(slot);}
   });
  },
  dispose(){if(disposed)return;disposed=true;release(pending);release(adopted);signal?.removeEventListener('abort',abort);},
  async return(){api.dispose();return iterator.return?iterator.return():{done:true};}
 };
 const abort=()=>api.dispose();signal?.addEventListener('abort',abort,{once:true});
 return api;
}
