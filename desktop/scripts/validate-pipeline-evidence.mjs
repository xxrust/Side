// Recompute the contract audit; never trust a saved delivered:true label.
import fs from 'node:fs/promises';
import {validatePipelineEvidenceProposal,auditPipelineEvidenceDelivery} from '../src/pipeline-evidence-contract.js';

const args=process.argv.slice(2);
if(!args.length||args.includes('--help')){
 console.log('Usage: node scripts/validate-pipeline-evidence.mjs PLAN.json [RESULT.json]\nOr supply one JSON envelope containing {plan,result}. Planning-only input never certifies delivery.');
 process.exit(args.length?0:64);
}
try{
 const input=JSON.parse(await fs.readFile(args[0],'utf8'));
 const plan=input.plan??input;
 const result=args[1]?JSON.parse(await fs.readFile(args[1],'utf8')):input.result;
 const audit=result===undefined?validatePipelineEvidenceProposal(plan):auditPipelineEvidenceDelivery(plan,result);
 console.log(JSON.stringify(audit,null,2));
 process.exitCode=result===undefined?(audit.valid?0:2):(audit.delivered?0:audit.status==='DIAGNOSTIC_ONLY'?3:2);
}catch(error){
 console.log(JSON.stringify({status:'REJECTED',delivered:false,errors:[{code:'AUDIT_INPUT_INVALID',nodeId:'$pipeline',path:'input',message:error.message,hint:'提供可讀的 PLAN.json，以及可選的真實 RESULT.json；不可只提供已保存的審核標籤。'}]},null,2));
 process.exitCode=64;
}
