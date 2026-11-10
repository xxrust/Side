import {defineConfig} from 'vite';
import {readFileSync} from 'node:fs';
const {version}=JSON.parse(readFileSync(new URL('./package.json',import.meta.url),'utf8'));
export default defineConfig({plugins:[{name:'agentcv-build-version',transformIndexHtml:html=>html.replaceAll('%AGENTCV_VERSION%',version)}],clearScreen:false, server:{port:1420,strictPort:true}, build:{target:'es2022'}});
