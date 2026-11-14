import {schemeFingerprint} from './purpose-compiler.js';
// Preparing libraries must never execute a program, read originals or publish
// a run. The normal dispatch still validates the complete current definition.
async function prepare(project,invoke,command){
 const scheme=project.data.purposeScheme;
 if(scheme?.execution?.unit!=='workpiece')return null;
 const node=scheme.operatorGraph?.nodes?.find(node=>!node.nativePlan&&typeof node.code==='string'&&node.code.trim());
 if(!node)return null;
 const payload={request:{mode:'scheme',code:node.code,parameters:node.parameters,expectedOutputs:node.expected_outputs,
  runtimePlan:{fingerprint:schemeFingerprint(scheme),nodeId:node.id,definition:scheme}}};
 if(command!=='prepare_inspection_programs')return invoke(command,payload);
 const started=performance.now(),result=await invoke(command,payload),invokeMs=performance.now()-started;
 const nativeMs=result?.commandTiming?.totalMs;
 return {...result,clientTiming:{invokeMs,...(Number.isFinite(nativeMs)&&nativeMs>=0?{unattributedMs:invokeMs-nativeMs}:{}),scope:'invoke call to resolved reply; unattributed includes IPC parsing, scheduling and delivery, not a pure transport measurement; no cycle time subtracted'}};
}

export const prepareInspectionRuntime=(project,invoke)=>prepare(project,invoke,'prepare_inspection_runtime');
// Called only after the user starts a validated batch, not during app startup.
export const prepareInspectionPrograms=(scheme,invoke)=>prepare({data:{purposeScheme:scheme}},invoke,'prepare_inspection_programs');
