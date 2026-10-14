import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
const require=createRequire(import.meta.url);const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL;
const checks=[['sandboxed renderer',[require('electron'),'.','--smoke-test']],...['editor','accessibility','tooltip','preferences','thumbnail','playback','recovery','print'].map(name=>[name,[process.execPath,`scripts/${name==='print'?'print-regression':name}-qa.mjs`]]),['3D unavailable tooltip',[process.execPath,'scripts/tooltip-qa.mjs','.qa/tooltips-fallback','--force-3d-fallback']]];
const results=[];await fs.mkdir('.qa/desktop-matrix',{recursive:true});
for(const [name,[executable,...args]] of checks){const started=Date.now();const child=spawn(executable,args,{env,windowsHide:true,stdio:'inherit'});const timeout=setTimeout(()=>child.kill(),260000);
  let code;try{code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});}finally{clearTimeout(timeout);}
  results.push({name,code,elapsedMs:Date.now()-started});await fs.writeFile('.qa/desktop-matrix/results.json',JSON.stringify({platform:process.platform,node:process.versions.node,checks:results},null,2));if(code!==0)throw new Error(`${name} failed (${code}).`);
}
