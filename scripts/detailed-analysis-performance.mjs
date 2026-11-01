import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hardware, option, root } from './performance-common.mjs';
import { sourceIdentity } from './testing/provenance.mjs';
const require=createRequire(import.meta.url),output=path.resolve(option('output',path.join(root,'.qa/detailed-analysis-performance.json')));
const esbuild=require(require.resolve('esbuild',{paths:[path.dirname(require.resolve('vite/package.json'))]}));
const result=await esbuild.build({stdin:{contents:`export {TransitionAnalyzer} from './src/analysis/engine';export {transitionInput} from './src/analysis/input';export {createPerformanceFixture} from './src/performanceFixtures';export {serializeProject} from './src/domain';`,resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false});
const module={exports:{}};new Function('module','exports',result.outputFiles[0].text)(module,module.exports);
const {TransitionAnalyzer,transitionInput,createPerformanceFixture,serializeProject}=module.exports;
const report={source:await sourceIdentity(root),hardware:hardware(),generatedAt:new Date().toISOString(),fixtures:[],interpretation:'One compute observation per phase on this host, not a statistical or hardware upper bound. 128 pictures; first move has 32 coincident cubic intervals per performer, so every broad-phase pair conflicts and zero-distance pruning applies. Cooperative callbacks are measured but timer delays are suppressed here; actual worker/renderer evidence is separate. Numeric adversaries can reach the refinement budget and remain explicitly uncertain.'};
for(const n of [2,64,500]){
 const p=createPerformanceFixture('maximum');p.performers=p.performers.slice(0,n);p.sets=p.sets.map(s=>({...s,positions:Object.fromEntries(p.performers.map(person=>[person.id,{x:20,y:20}]))}));p.moves[0].counts=32;p.moves[0].paths=Object.fromEntries(p.performers.map(person=>[person.id,{segments:Array.from({length:32},(_,i)=>({id:'c'+i,kind:'cubic',startCount:i,endCount:i+1,...(i<31?{to:{x:20,y:20}}:{}),control1:{x:25,y:30},control2:{x:15,y:30}}))}]));
 const engine=new TransitionAnalyzer(),metrics={};
 for(const phase of ['full','cached','localized']){
  const q=phase==='localized'?{...p,moves:p.moves.map((m,i)=>i?m:{...m,paths:{...m.paths,[p.performers[0].id]:{segments:m.paths[p.performers[0].id].segments.map((s,j)=>j?s:{...s,control1:{...s.control1,y:31}})}}})}:p;
  let yields=0,last=performance.now(),longestBlockMs=0;const value=await engine.analyze(transitionInput(q,1,0),()=>false,async()=>{longestBlockMs=Math.max(longestBlockMs,performance.now()-last);yields++;last=performance.now();});
  const completionTailMs=performance.now()-last;longestBlockMs=Math.max(longestBlockMs,completionTailMs);
  metrics[phase]={stats:value.stats,issues:value.issues.length,yields,longestBlockMs,completionTailMs,heapMB:process.memoryUsage().heapUsed/1024/1024};
 }
 const text=serializeProject(p);report.fixtures.push({performers:n,sets:p.sets.length,intervals:32,utf8Bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex'),metrics});
}
await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,fixtures:report.fixtures},null,2));
