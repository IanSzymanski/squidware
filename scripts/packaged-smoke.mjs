import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
const root=path.resolve('release'); const candidates=[];
async function visit(folder,depth=0){if(depth>5)return;for(const entry of await fs.readdir(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())await visit(file,depth+1);else if(entry.name===(process.platform==='win32'?'Squidware.exe':process.platform==='darwin'?'Squidware':'squidware'))candidates.push(file);}}
await visit(root);if(candidates.length!==1)throw new Error('Expected exactly one packaged application: '+JSON.stringify(candidates));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL;
const child=spawn(candidates[0],['--smoke-test'],{env,windowsHide:true,stdio:'inherit'});const timeout=setTimeout(()=>child.kill(),45000);
try{await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`Packaged smoke exited with ${code}`)));});}finally{clearTimeout(timeout);}
