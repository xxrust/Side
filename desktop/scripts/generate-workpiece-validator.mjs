// Build-time compilation keeps the native WebView's no-eval CSP intact.
import fs from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import standalone from 'ajv/dist/standalone/index.js';
import {dataContractSchema} from '../src/data-contract-schema.js';
import {workpiecePlanSchema} from '../src/workpiece-plan-schema.js';
export async function generateWorkpieceValidator(){
 for(const [schema,name] of [[workpiecePlanSchema,'workpiece-schema'],[dataContractSchema,'data-contract-schema']]){
 const ajv=new Ajv2020({strict:false,allErrors:true,code:{source:true,esm:true,lines:true}});
 let code=standalone(ajv,ajv.compile(schema));
 const imports=new Map();code=code.replace(/require\("(ajv\/dist\/runtime\/[^"]+)"\)\.default/g,(_,name)=>{if(!imports.has(name))imports.set(name,`helper${imports.size}`);return imports.get(name);});
 if(/\brequire\(/.test(code))throw Error('Unsupported standalone validator dependency');
 const header='// Generated from '+name+'.js; do not edit. No runtime eval.\n'+[...imports].map(([name,id])=>`import ${id}Module from ${JSON.stringify(name+'.js')}; const ${id} = ${id}Module.default || ${id}Module;`).join('\n')+'\n';
 await fs.writeFile(new URL('../src/'+name+'.generated.js',import.meta.url),header+code+'\n');
 }
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1])await generateWorkpieceValidator();
