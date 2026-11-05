import type { AssignmentConstraints, AssignmentPair, Performer, Point, Project } from './types';
import type { FormationSession } from './formationPreview';
import { compileAssignmentEligibility, validateAssignmentConstraints } from './assignmentConstraints';
import { formationProject, previewFormationSession } from './editor/formationSession';
import { transitionInput } from './analysis/input';
import type { AnalysisInput, Track } from './analysis/input';
import { TransitionAnalyzer } from './analysis/engine';
import { compileTrack, peakStrideBounds } from './analysis/detailed';
import { movementLength, sampleMovement } from './movementPaths';
import { AssignmentInfeasible, solveAssignment } from './assignmentSolver';
export { AssignmentInfeasible, infeasibleMessage, solveAssignment } from './assignmentSolver';

export interface AssignmentProblem {
  performers:Performer[]; slots:{slot:number;point:Point;ownerId:string}[];
  slotCount:number; sectionIds:string[]; original:Record<string,Point>; forcedPins:AssignmentPair[];
  checks:{side:'incoming'|'outgoing';input:AnalysisInput}[];
}
export interface AssignmentMetrics {
  travel:number; longestTravel:number;
  demand:{lower:number;upper:number;converged:boolean}|null;
  flags:{spacing:number;stride:number;possible:number}|null;
}
export interface AssignmentAlternative {
  objective:'current'|'distance'|'balanced'; order:string[]; metrics:AssignmentMetrics; eligible:boolean;
}
export interface AssignmentComparison {constraints:AssignmentConstraints;current:AssignmentAlternative;proposals:AssignmentAlternative[];infeasible?:string}
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const yieldTask=()=>new Promise<void>(resolve=>setTimeout(resolve,0));

/** Freeze only the selected geometry and adjacent move inputs for the worker.
 * Vacant slots stay vacant; unrelated performers enter comparison checks only. */
export function assignmentProblem(project:Project,session:FormationSession,epoch:number):AssignmentProblem {
  if(session.ids.length<2||session.ids.length>500)throw Error('Select 2–500 performers and start a valid formation preview first.');
  const result=previewFormationSession(project,session);if(result.error)throw Error(result.error);
  const order=session.order??session.ids,index=project.sets.findIndex(s=>s.id===session.setId);
  if(index<0)throw Error('The reviewed set is missing.');
  const proposed=formationProject(project,session,result.positions);
  const slots=order.map((id,i)=>({slot:session.live?.slots[i]??i,point:{...result.positions[id]},ownerId:id}));
  const selected=new Set(session.ids),performers=project.performers.filter(p=>selected.has(p.id)).map(p=>({...p,name:''})).sort((a,b)=>compare(a.id,b.id));
  if(performers.length!==session.ids.length||new Set(order).size!==order.length)throw Error('The selection or assignment changed. Reopen the review.');
  return {performers,slots,slotCount:session.live?.slotCount??slots.length,sectionIds:project.sections.map(s=>s.id),original:Object.fromEntries(session.ids.map(id=>[id,{...project.sets[index].positions[id]}])),
    forcedPins:slots.filter(s=>session.scatter?.pinnedSlots.includes(s.slot)).map(s=>({performerId:s.ownerId,slot:s.slot})),
    checks:[{side:'incoming' as const,input:transitionInput(proposed,index,epoch)},{side:'outgoing' as const,input:transitionInput(proposed,index+1,epoch)}].filter((c):c is AssignmentProblem['checks'][number]=>!!c.input)};
}
export function assignedChecks(problem:AssignmentProblem,order:readonly string[]) {
  const points=new Map(order.map((id,i)=>[id,problem.slots[i].point]));
  return problem.checks.map(check=>({...check,input:{...check.input,tracks:check.input.tracks.map(t=>points.has(t.id)?{...t,...(check.side==='incoming'?{to:points.get(t.id)!}:{from:points.get(t.id)!})}:t)}}));
}
export function mappingEligible(problem:AssignmentProblem,c:AssignmentConstraints,order:readonly string[]):boolean {
  if(order.length!==problem.performers.length||new Set(order).size!==order.length)return false;
  const allowed=compileAssignmentEligibility({...c,pins:[...c.pins,...problem.forcedPins]});
  return order.every((id,i)=>{const person=problem.performers.find(p=>p.id===id);return !!person&&allowed(person,problem.slots[i].slot);});
}
function adjusted(track:Track,side:'incoming'|'outgoing',point:Point):Track {return {...track,...(side==='incoming'?{to:point}:{from:point})};}
function compatible(track:Track,input:AnalysisInput):boolean {
  return distance(sampleMovement(track.from,track.to,track.path,0,input.counts,input.transition),track.from)<=1e-6&&distance(sampleMovement(track.from,track.to,track.path,input.counts,input.counts,input.transition),track.to)<=1e-6;
}

export async function optimizeAssignment(problem:AssignmentProblem,value:AssignmentConstraints,options:{canceled?:()=>boolean;budgetMs?:number;yieldTask?:()=>Promise<void>}={}):Promise<AssignmentComparison> {
  const {performers,slots}=problem,n=performers.length;
  if(n<2||n>500||slots.length!==n)throw Error('Choose 2–500 members and one occupied destination slot per member.');
  const constraints=validateAssignmentConstraints(value,performers.map(p=>p.id),problem.slotCount,problem.sectionIds);
  const start=performance.now(),canceled=options.canceled??(()=>false),pause=options.yieldTask??yieldTask;
  const check=()=>{if(canceled())throw Error('Assignment comparison canceled.');if(performance.now()-start>(options.budgetMs??20000))throw Error('Assignment comparison exceeded its work budget. Try a smaller selection or simpler movement paths. No proposal was applied.');};
  const allowed=compileAssignmentEligibility({...constraints,pins:[...constraints.pins,...problem.forcedPins]}),costs=new Float64Array(n*n).fill(Infinity),distances=new Float64Array(n*n).fill(Infinity);
  const tracks=problem.checks.map(c=>({...c,byId:new Map(c.input.tracks.map(t=>[t.id,t]))}));
  for(let i=0;i<n;i++) {
    const person=performers[i];
    for(let j=0;j<n;j++) {
      check();const eligible=allowed(person,slots[j].slot);if(!eligible&&slots[j].ownerId!==person.id)continue;
      let length=0,valid=true;
      if(!tracks.length)length=distance(problem.original[person.id],slots[j].point);
      for(const t of tracks){const original=t.byId.get(person.id);if(!original)throw Error('A reviewed performer is missing from movement checks.');const track=adjusted(original,t.side,slots[j].point);if(!compatible(track,t.input)){valid=false;break;}length+=movementLength(track.from,track.to,track.path);}
      if(valid){distances[i*n+j]=length;if(eligible)costs[i*n+j]=length;}
    }
    if(i%8===0){await pause();check();}
  }
  const row=new Map(performers.map((p,i)=>[p.id,i])),analyzer=new TransitionAnalyzer();
  const metrics=async(order:string[]):Promise<AssignmentMetrics>=>{
    const travel=order.map((id,j)=>distances[row.get(id)!*n+j]);if(travel.some(v=>!Number.isFinite(v)))throw Error('A fixed path endpoint is incompatible with this mapping.');
    let lower=0,upper=0,converged=true,spacing=0,stride=0,possible=0;
    for(const {input} of assignedChecks(problem,order)) {
      for(const [i,track] of input.tracks.entries())if(row.has(track.id)) {
        const generator=peakStrideBounds(compileTrack(track,input.counts,input.transition));let result=generator.next();while(!result.done){check();result=generator.next();}
        lower=Math.max(lower,result.value.lower);upper=Math.max(upper,result.value.upper);converged&&=result.value.converged;
        if(i%32===0){await pause();check();}
      }
      const result=await analyzer.analyze(input,()=>canceled()||performance.now()-start>(options.budgetMs??20000));check();if(!result)throw Error('Assignment movement checks canceled.');
      spacing+=result.issues.filter(i=>i.type==='collision').length;stride+=result.issues.filter(i=>i.type==='stride').length;possible+=result.issues.filter(i=>i.certainty==='possible').length;
    }
    return {travel:travel.reduce((a,b)=>a+b,0),longestTravel:Math.max(0,...travel),demand:problem.checks.length?{lower,upper,converged}:null,flags:problem.checks.length?{spacing,stride,possible}:null};
  };
  const currentOrder=slots.map(s=>s.ownerId),current:AssignmentAlternative={objective:'current',order:currentOrder,metrics:await metrics(currentOrder),eligible:mappingEligible(problem,constraints,currentOrder)};
  const proposals:AssignmentAlternative[]=[];
  try {
    for(const objective of ['distance','balanced'] as const){check();const order=solveAssignment(costs,n,objective,check).map(i=>performers[i].id);proposals.push({objective,order,metrics:await metrics(order),eligible:true});await pause();}
  }catch(error){if(error instanceof AssignmentInfeasible)return {constraints,current,proposals:[],infeasible:error.message};throw error;}
  return {constraints,current,proposals};
}
