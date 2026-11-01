import { createRequire } from 'node:module';
import path from 'node:path';
import { createQa, root } from './testing/launcher.mjs';
const qa=await createQa('detailed-analysis',{timeoutMs:240000}),require=createRequire(import.meta.url);
const esbuild=require(require.resolve('esbuild',{paths:[path.dirname(require.resolve('vite/package.json'))]})),bundle=path.join(qa.output,'fixtures.cjs');
await esbuild.build({stdin:{contents:`import {createBlankProject} from './src/domain';import {createPerformanceFixture} from './src/performanceFixtures';export {analyzeTransition,parseProject,sampleProject} from './src/domain';
export function fixture(kind='crossing') {
 if(kind==='maximum'){const p=createPerformanceFixture('maximum');p.title='Maximum detailed analysis';const m=p.moves[0];m.paths=Object.fromEntries(p.performers.map(person=>{const a=p.sets[0].positions[person.id],b=p.sets[1].positions[person.id];return[person.id,{segments:[{id:'curve',kind:'cubic',startCount:0,endCount:m.counts,control1:{x:a.x,y:Math.min(p.field.height,a.y+8)},control2:{x:b.x,y:Math.min(p.field.height,b.y+8)}}]}]}));return p;}
 const p=createBlankProject();p.title='Detailed movement checks';p.performers=['a','b'].map((id,i)=>({id,label:'A'+(i+1),name:'',sectionId:p.sections[0].id}));
 p.sets=[{id:'opening',name:'Opening',notes:'',positions:{a:{x:10,y:10},b:{x:20,y:25}}},{id:'arrival',name:'Arrival',notes:'',positions:{a:{x:30,y:10},b:{x:20,y:25}}}];
 p.moves=[{id:'curve-move',fromSetId:'opening',toSetId:'arrival',counts:8,tempo:120,transition:'linear',paths:{a:{segments:[{id:'curve',kind:'cubic',startCount:0,endCount:8,control1:{x:10,y:30},control2:{x:30,y:30}}]}}}];p.analysisRules={defaults:{minimumSpacing:1,maximumStride:2}};
 if(kind==='possible'){p.sets[0].positions={a:{x:0,y:0},b:{x:5,y:8.5}};p.sets[1].positions={a:{x:10,y:0},b:{x:5,y:8.5}};p.moves[0].paths.a.segments[0].control1={x:0,y:10};p.moves[0].paths.a.segments[0].control2={x:10,y:10};p.analysisRules.defaults.maximumStride=5;}
 if(kind==='unresolved'){p.moves[0].paths.a.segments=[{id:'fast',kind:'line',startCount:0,endCount:1e-8}];}
 if(kind==='fast'){p.moves[0].counts=16;p.moves[0].paths.a.segments=[{id:'fast',kind:'cubic',startCount:.11,endCount:.12,control1:{x:10,y:40},control2:{x:90,y:40}}];p.sets[1].positions.a={x:90,y:10};p.sets[0].positions.b=p.sets[1].positions.b={x:50,y:32.5};}
 return p;
}`,resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:bundle,logLevel:'silent'});
await qa.run('detailed-analysis-qa-runner.cjs','detailed-analysis-manifest',{bundle});
