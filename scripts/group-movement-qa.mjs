import {createRequire} from 'node:module';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createQa,root} from './testing/launcher.mjs';
const require=createRequire(import.meta.url),qa=await createQa('group-movement',{timeoutMs:330000});
const bundle=path.join(qa.output,'fixtures.cjs');
const esbuild=require(require.resolve('esbuild',{paths:[path.dirname(require.resolve('vite/package.json'))]}));
await esbuild.build({stdin:{contents:`
 import {createDemoProject,serializeProject,validateProject} from './src/domain';
 import {compileRoute} from './src/sharedRoutes';
 import {liveFormationPoints} from './src/liveFormations';
 import {emptyAssignmentConstraints} from './src/assignmentConstraints';
 export {parseProject,sampleProject} from './src/domain';
 export {beginGroupMotion,groupMotionPlan} from './src/editor/groupMotionReview';
 export {effectiveMove} from './src/groupMotion';
 export function fixture(count=4,large=false){
  const p=createDemoProject(),total=Math.min(500,count+2);p.title='Shared group movement';p.performers=Array.from({length:total},(_,i)=>({id:'p'+i,label:'P'+(i+1),name:'',sectionId:p.sections[0].id}));const ids=p.performers.slice(0,count).map(p=>p.id);
  p.sets=p.sets.slice(0,3).map(s=>({...s,positions:Object.fromEntries(p.performers.map((p,i)=>[p.id,{x:5+i%40*2,y:45-Math.floor(i/40)*2}]))}));p.moves=p.moves.slice(0,2).map((m,i)=>({...m,counts:i?32:16,transition:'ease',paths:{}}));
  p.sharedRoutes=[{id:'straight',name:'Straight flow',closed:false,start:{x:10,y:15},segments:[{id:'line',kind:'line',to:{x:90,y:15}}]},
   {id:'river',name:'S-curve river',closed:false,start:{x:10,y:25},segments:[{id:'curve',kind:'cubic',control1:{x:25,y:5},control2:{x:75,y:45},to:{x:90,y:25}}]},
   {id:'loop',name:'Closed loop',closed:true,start:{x:30,y:10},segments:[{id:'east',kind:'line',to:{x:70,y:10}},{id:'south',kind:'line',to:{x:70,y:40}},{id:'west',kind:'line',to:{x:30,y:40}},{id:'north',kind:'line',to:{x:30,y:10}}]}];
  if(!large){for(const [i,x] of [[0,30],[1,70]]){const shape={id:'live-'+i,name:'Endpoint '+i,kind:'line',options:{center:{x,y:40},width:12,height:0,columns:1,rotation:0,assignment:'roster'},slotCount:count,members:ids.map((performerId,slot)=>({performerId,slot})),assignmentConstraints:{...emptyAssignmentConstraints(),pins:[{performerId:ids[0],slot:0}]}};p.sets[i]={...p.sets[i],liveFormations:[shape],positions:{...p.sets[i].positions,...liveFormationPoints(shape,p.field)}};}p.moves[0].paths[ids[0]]={segments:[{id:'wait',kind:'hold',startCount:0,endCount:2},{id:'old',kind:'line',startCount:2,endCount:16}]};}
  else if(count===500){for(let i=0;i<count;i++){p.sets[0].positions[ids[i]]={x:30-i*.01,y:15};p.sets[1].positions[ids[i]]={x:46-i*.01,y:15};}}
  return validateProject(p);
 }
 export const content=serializeProject(fixture());
`,resolveDir:root,loader:'ts'},bundle:true,outfile:bundle,platform:'node',format:'cjs',logLevel:'silent'});
const fixture=path.join(qa.output,'group.squid'),largeFixtures=path.join(qa.output,'large-fixtures.json');
await fs.writeFile(fixture,require(bundle).content);await fs.writeFile(largeFixtures,JSON.stringify([2,64,500].map(n=>require(bundle).fixture(n,true))));
await qa.run('group-movement-qa-runner.cjs','group-manifest',{fixture,largeFixtures,bundle});
