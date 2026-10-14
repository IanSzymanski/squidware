import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatTools } from './format-contract.mjs';
import { hardware, fingerprint } from './performance-common.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'); const require=createRequire(import.meta.url);
const output=path.resolve(process.argv[2] || path.join(root,'.qa/print')); await fs.mkdir(output,{recursive:true});
const profile=await fs.mkdtemp(path.join(output,'profile-')); const tools=await formatTools();
const project=tools.createPerformanceFixture('maximum'); project.performers=project.performers.slice(0,2);
project.title='TITLE-BEGIN-'+ 'LongUnbrokenProductionTitle'.repeat(5) + '-TITLE-END';
project.sets.forEach((set,index)=>{set.positions=Object.fromEntries(project.performers.map(p=>[p.id,set.positions[p.id]]));set.name=`Picture ${String(index+1).padStart(3,'0')}`;set.notes=`CHART-${String(index+1).padStart(3,'0')}`;});
const longStart='CHART-064 NOTE-BEGIN\n'; const longEnd='\nNOTE-END-064';
project.sets[63].notes=longStart+('A'.repeat(300)+' Long rehearsal note.\n').repeat(40).slice(0,10000-longStart.length-longEnd.length)+longEnd;
const dense=tools.createPerformanceFixture('maximum'); dense.sets=dense.sets.slice(0,1);dense.moves=[];dense.title='DENSE-500-OPENING';dense.sets[0].notes='MONOCHROME-END';
const cases=[{name:'charts-letter',project,paper:'letter',mode:'charts',minimumPages:128,markers:[project.title,...project.sets.map(set=>set.name),...project.sets.map((_,i)=>`CHART-${String(i+1).padStart(3,'0')}`),'NOTE-BEGIN','NOTE-END-064']},
{name:'coordinates-a4',project,paper:'a4',mode:'coordinates',minimumPages:4,markers:['P1','P2',...project.sets.map(set=>set.name)],coordinateRows:256},
{name:'dense-a4',project:dense,paper:'a4',mode:'charts',minimumPages:1,markers:['DENSE-500-OPENING','MONOCHROME-END','P500']}];
for(const entry of cases) { entry.fixture=path.join(output,entry.name+'.squid');await fs.writeFile(entry.fixture,tools.serializeProject(entry.project));delete entry.project; }
const manifest=path.join(output,'manifest.json');await fs.writeFile(manifest,JSON.stringify({root,output,profile,cases,hardware:hardware(),sourceSha256:await fingerprint(path.join(root,'src')),buildSha256:await fingerprint(path.join(root,'dist'))},null,2));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL;
const child=spawn(require('electron'),[path.join(root,'scripts/print-qa-runner.cjs'),`--print-manifest=${manifest}`],{cwd:root,env,windowsHide:true,stdio:'inherit'});
const timeout=setTimeout(()=>child.kill(),240000);
try {await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`Print QA exited with ${code}`)));});}finally{clearTimeout(timeout);}
