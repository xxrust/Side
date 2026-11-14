// Shipping a faster renderer must never disable navigation during inspection.
import path from 'node:path';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const desktop=path.resolve(import.meta.dirname,'..');
const bundled=path.join(desktop,'runtime/python',process.platform==='win32'?'python.exe':'bin/python3');
const python=process.env.AGENTCV_QA_PYTHON||(fs.existsSync(bundled)?bundled:'python3');
const result=spawnSync(process.execPath,['--test','qa/node-output-memory.test.mjs','qa/source-next-image-preparation.test.mjs'],{
 cwd:desktop,stdio:'inherit',env:{...process.env,AGENTCV_QA_PYTHON:python}
});
if(result.error)throw result.error;
if(result.status!==0)throw Error('切圖回歸驗證失敗；未產生交付版本。請修復執行中切圖、自動切圖與延遲圖像測試。');
