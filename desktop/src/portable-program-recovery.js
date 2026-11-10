// Narrow recovery of the historical dynamic wrapper. This does not execute code,
// read files, mutate runs, or claim to prove which bytes were read historically.
const OLD="'verification':{'kind':'artifact','id':artifact}";
const NEW="'verification':{'kind':'artifact','type':'evidence' if artifact.endswith('stats') else 'image','id':artifact}";
const fail=(code,message)=>{const error=new Error(message);error.code=code;throw error};
const stable=value=>JSON.stringify(value===null||typeof value!=='object'?value:Array.isArray(value)?value.map(v=>JSON.parse(stable(v))):Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(stable(value[k]))])));
const sha256=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(n=>n.toString(16).padStart(2,'0')).join('');
function expectedWrapper(root){return `from pathlib import Path
root=Path('${root}')
files=list(root.glob('*.py'))
candidates=[f for f in files if "with procedure('analysis'" in f.read_text()]
assert candidates, '找不到前次留存算法，停止而不使用推測結果'
original=candidates[0].read_text()
original=original.replace("${OLD}","${NEW}")
exec(compile(original,str(candidates[0]),'exec'))`;}
/**
 * Reconstruct only a completely matched legacy wrapper from an independently
 * obtained, complete current listing of its original directory. The host must
 * supply sourceFiles from a trusted real file read, never from guessed paths.
 * `listingComplete` attests every top-level *.py file was listed and read.
 * The resulting code is a new candidate; host must run and validate it.
 */
export async function recoverPortableProgram({sourceRun,wrapperRun,sourceFiles,listingComplete=false}={}){
 if(!sourceRun||!wrapperRun||typeof sourceRun.runId!=='string'||typeof wrapperRun.runId!=='string'||sourceRun.runId===wrapperRun.runId||typeof sourceRun.code!=='string'||typeof wrapperRun.code!=='string')fail('RECOVERY_INVALID_RUNS','需提供不同且完整保存的原程式與 wrapper 執行紀錄');
 const root=sourceRun.runDirectory;
 if(typeof root!=='string'||!/^\/(?:[^'\\\r\n]+)$/.test(root)||root.endsWith('/')||root.split('/').some(part=>part==='..'||part==='.')||wrapperRun.code.trimEnd()!==expectedWrapper(root))fail('RECOVERY_UNSUPPORTED_WRAPPER','此 wrapper 不是已核對的精確形式，或來源目錄不符；停止重建');
 if(!/^[a-f0-9]{64}$/.test(sourceRun.codeSha256||'')||await sha256(sourceRun.code)!==sourceRun.codeSha256)fail('RECOVERY_SOURCE_HASH_MISMATCH','原程式內容與已記錄 SHA-256 不符');
 if(!/^[a-f0-9]{64}$/.test(wrapperRun.codeSha256||'')||await sha256(wrapperRun.code)!==wrapperRun.codeSha256)fail('RECOVERY_WRAPPER_HASH_MISMATCH','wrapper 內容與已記錄 SHA-256 不符');
 const first=sourceRun.sourceBinding?.images,second=wrapperRun.sourceBinding?.images;
 if(!Array.isArray(first)||!first.length||!Array.isArray(second)||stable(first)!==stable(second)||stable(sourceRun.parameters??{})!==stable(wrapperRun.parameters??{}))fail('RECOVERY_INPUT_MISMATCH','兩次紀錄的圖片綁定或參數不同，不能視為此重建情況');
 if(!listingComplete||!Array.isArray(sourceFiles)||!sourceFiles.length||sourceFiles.some(f=>!f||typeof f.name!=='string'||!/^([^/\\]+)\.py$/.test(f.name)||typeof f.text!=='string')||new Set(sourceFiles.map(f=>f.name)).size!==sourceFiles.length)fail('RECOVERY_SOURCE_LIST_INCOMPLETE','需要實際讀取來源目錄完整的 Python 檔案清單，不能猜測原檔');
 const matching=sourceFiles.filter(f=>f.text.includes("with procedure('analysis'"));
 if(matching.length!==1||matching[0].name!=='algorithm.py')fail('RECOVERY_SOURCE_AMBIGUOUS','wrapper 的來源候選缺失或不唯一，停止重建');
 if(matching[0].text!==sourceRun.code||await sha256(matching[0].text)!==sourceRun.codeSha256)fail('RECOVERY_SOURCE_FILE_MISMATCH','目前實際原檔與保存的原程式不一致，停止重建');
 if(sourceRun.code.split(OLD).length-1!==1)fail('RECOVERY_TRANSFORM_MISMATCH','原始替換位置不是唯一一處，停止重建');
 const code=sourceRun.code.replace(OLD,NEW),codeSha256=await sha256(code);
 return {schema:'agentcv-portable-program-candidate-1',code,codeSha256,source:{sourceRunId:sourceRun.runId,sourceCodeSha256:sourceRun.codeSha256,wrapperRunId:wrapperRun.runId,wrapperCodeSha256:wrapperRun.codeSha256,observedSourcePath:root+'/algorithm.py',observedSourceSha256:sourceRun.codeSha256,transformCount:1},status:'CANDIDATE_UNVERIFIED',scope:'目前原檔與保存程式一致；歷史 wrapper 未保存動態檔案 hash，無法嚴格證明當時讀取的位元組。此候選需以真實輸入重跑驗證，不能改寫舊執行紀錄。'};
}
