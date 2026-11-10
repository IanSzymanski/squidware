import {createRequire} from 'node:module';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createQa,root} from './testing/launcher.mjs';
const require=createRequire(import.meta.url),qa=await createQa('formation-transitions',{timeoutMs:210000});
const bundle=path.join(qa.output,'fixtures.cjs');
const esbuild=require(require.resolve('esbuild',{paths:[path.dirname(require.resolve('vite/package.json'))]}));
await esbuild.build({stdin:{contents:`
 import {createDemoProject,serializeProject,validateProject} from './src/domain';
 import {liveFormationPoints} from './src/liveFormations';
 import {emptyAssignmentConstraints} from './src/assignmentConstraints';
 import {captureParametricFormation} from './src/templates/formations';
 export {parseProject,sampleProject} from './src/domain';
 export {formatYards} from './src/coordinates';
 export {beginFormationTransition,formationTransitionPlan,transitionMapping} from './src/editor/formationTransition';
 export function fixture(count=4,large=false){
  const p=createDemoProject(),n=large?count:6,sectionId=p.sections[0].id;
  p.title='Formation transitions';p.performers=Array.from({length:n},(_,i)=>({id:'p'+i,label:'P'+(i+1),name:'',sectionId}));
  p.sets=p.sets.slice(0,large?2:4).map(s=>({...s,positions:Object.fromEntries(p.performers.map((p,i)=>[p.id,{x:i%2?95:5,y:45}]))}));
  p.moves=p.moves.slice(0,p.sets.length-1).map(m=>({...m,counts:16,transition:'linear',paths:{}}));
  const ids=p.performers.slice(0,count).map(p=>p.id),index=large?0:1;
  for(const [i,id,x] of [[index,'Source',25],[index+1,'Destination',75]]){
   const order=!large&&i===index+1?[...ids].reverse():ids,slot=order.indexOf(ids[0]);
   const shape={id,name:id,kind:large?'block':i===index?'line':'arc',options:{center:{x,y:25},width:large?32:18,height:large?24:i===index?0:8,rotation:0,columns:Math.ceil(Math.sqrt(count)),assignment:'roster'},slotCount:count,members:order.map((performerId,slot)=>({performerId,slot})),assignmentConstraints:{...emptyAssignmentConstraints(),pins:[{performerId:ids[0],slot}],roles:{[ids[0]]:'Trumpet'},roleSlots:[{slot,role:'Trumpet'}]}};
   p.sets[i]={...p.sets[i],liveFormations:[shape],positions:{...p.sets[i].positions,...liveFormationPoints(shape,p.field)}};
  }
  if(!large){const a=p.sets[index].positions[ids[0]],b=p.sets[index+1].positions[ids[0]];p.moves[index].paths[ids[0]]={segments:[{id:'hold',kind:'hold',startCount:0,endCount:3},{id:'individual',kind:'cubic',startCount:3,endCount:14,control1:{x:a.x+15,y:a.y+4},control2:{x:b.x-15,y:b.y+4}}]};p.moves[index].paths[ids[1]]={segments:[{id:'late',kind:'line',startCount:8,endCount:16}]};}
  return validateProject(p);
 }
 export const content=serializeProject(fixture());
 export const library=JSON.stringify({format:'squidware-template-library',version:1,entries:[captureParametricFormation('Library block','block',{center:{x:50,y:25},width:12,height:6,rotation:0,columns:2},2)]});
`,resolveDir:root,loader:'ts'},bundle:true,outfile:bundle,platform:'node',format:'cjs',logLevel:'silent'});
const fixture=path.join(qa.output,'transition.squid'),largeFixtures=path.join(qa.output,'large-fixtures.json');
await fs.writeFile(fixture,require(bundle).content);await fs.writeFile(path.join(qa.profile,'template-library.json'),require(bundle).library);
await fs.writeFile(largeFixtures,JSON.stringify([2,64,500].map(n=>require(bundle).fixture(n,true))));
await qa.run('formation-transitions-qa-runner.cjs','transition-manifest',{fixture,largeFixtures,bundle});
