import { promises as fs } from 'node:fs';
import { requireProcess } from './testing/process.mjs';
import path from 'node:path';
const root=path.resolve('release'); const candidates=[];
async function visit(folder,depth=0){if(depth>5)return;for(const entry of await fs.readdir(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())await visit(file,depth+1);else if(entry.name===(process.platform==='win32'?'Squidware.exe':process.platform==='darwin'?'Squidware':'squidware'))candidates.push(file);}}
await visit(root);if(candidates.length!==1)throw new Error('Expected exactly one packaged application: '+JSON.stringify(candidates));
await requireProcess(candidates[0], ['--smoke-test'], { timeoutMs: 45000, logFile: path.resolve('.qa/packaged-smoke.log') });
