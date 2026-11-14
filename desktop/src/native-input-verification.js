// The native session announces registration before an acknowledgement is sent.
// This helper owns no image decoding and never accepts declared metadata alone.
import {jsonDataEqual} from './json-data-equal.js';
export function createNativeInputVerification({verification,expected,isCurrent,signal,confirm,onFailure=()=>{}}){
 let disposed=false,started=false,task=null,failure=null;
 const snapshot=value=>JSON.parse(JSON.stringify(value));
 const binding=snapshot(expected);
 // Observe rejection immediately, even if native registration has not arrived.
 const outcome=Promise.resolve(verification).then(source=>{try{return {source:snapshot(source)};}catch(error){return {error};}},error=>({error}));
 const gate={
  start(){
   if(started||disposed)return;started=true;
   task=outcome.then(async({source,error})=>{
    if(disposed)return;
    const current=()=>{try{return isCurrent();}catch{return false;}};
    const accepted=!error&&!signal?.aborted&&current()&&jsonDataEqual(source,binding);
    if(!accepted)failure=error||Error('SESSION_INPUT_VERIFICATION_REJECTED');
    try{await confirm({accepted,sourceBinding:accepted?source:null});}
    catch(error){failure||=error;}
    if(failure&&!disposed)onFailure(failure);
   }).catch(error=>{failure=error;if(!disposed)onFailure(error);});
  },
  async complete(){
   if(!started)throw Error('SESSION_INPUT_VERIFICATION_NOT_REGISTERED');
   await task;if(disposed)throw Error('SESSION_INPUT_VERIFICATION_DISPOSED');if(failure)throw failure;
  },
  dispose(){disposed=true;},
 };
 return gate;
}
