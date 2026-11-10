import {generateWorkpieceValidator} from './generate-workpiece-validator.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {agentTools,systemPrompt} from '../src/agent-contract.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),sha=data=>createHash('sha256').update(data).digest('hex');
const tools=agentTools.map(t=>t.function.name);if(new Set(tools).size!==tools.length)throw Error('Duplicate host tools');
const contract=JSON.stringify({tools:agentTools,systemPrompt},null,2);await fs.writeFile(path.join(root,'scripts/agent-contract.json'),contract);
const skills=[];async function walk(dir){for(const e of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);else if(e.name.endsWith('.md'))skills.push({path:path.relative(root,p),sha256:sha(await fs.readFile(p))});}}await walk(path.join(root,'agent-packages/agentcv-cv/skills'));
await fs.writeFile(path.join(root,'scripts/runtime-contract-manifest.json'),JSON.stringify({schema:'agentcv-build-contract-1',version:JSON.parse(await fs.readFile(path.join(root,'package.json'))).version,contractSha256:sha(JSON.stringify({tools:agentTools,systemPrompt})),toolCount:tools.length,tools,systemPromptSha256:sha(systemPrompt),skills},null,2));console.log(`Generated ${tools.length} real host tools from source.`);

await generateWorkpieceValidator();
