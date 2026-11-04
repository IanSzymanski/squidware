import { describe, expect, it } from 'vitest';
import { assignmentAllowed, assignmentRole, compileAssignmentEligibility, emptyAssignmentConstraints, validateAssignmentConstraints } from '../assignmentConstraints';
import { assignmentProblem, mappingEligible, optimizeAssignment, solveAssignment } from '../assignmentOptimization';
import { createDemoProject, parseProject, serializeProject } from '../domain';
import { compileTrack, peakStrideBounds } from '../analysis/detailed';
import type { Track } from '../analysis/input';
import { createEditorStore } from './store';
import { assignmentReviewCurrent, defaultAssignmentConstraints } from './assignmentReview';
import { currentFormationResult } from './formationSession';
import type { AssignmentProblem } from '../assignmentOptimization';

function exhaustive(costs:Float64Array,n:number,squared:boolean) {
  let best=Infinity;
  const visit=(column:number,used:Set<number>,sum:number)=>{if(column===n){best=Math.min(best,sum);return;}for(let row=0;row<n;row++)if(!used.has(row)&&Number.isFinite(costs[row*n+column])){used.add(row);const c=costs[row*n+column];visit(column+1,used,sum+(squared?c*c:c));used.delete(row);}};
  visit(0,new Set(),0);return best;
}
describe('exact constrained assignment',()=>{
  it('matches independent exhaustive enumeration for both objectives, forbidden edges and ties',()=>{
    let seed=51;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let n=1;n<=7;n++)for(let fixture=0;fixture<6;fixture++){
      const costs=Float64Array.from({length:n*n},()=>random()<.25?Infinity:Math.floor(random()*12));
      for(const objective of ['distance','balanced'] as const){const expected=exhaustive(costs,n,objective==='balanced');if(!Number.isFinite(expected)){expect(()=>solveAssignment(costs,n,objective)).toThrow(/No complete assignment/);continue;}
        const result=solveAssignment(costs,n,objective);expect(new Set(result).size).toBe(n);expect(result.reduce((sum,row,column)=>sum+(objective==='balanced'?costs[row*n+column]**2:costs[row*n+column]),0)).toBeCloseTo(expected,8);expect(solveAssignment(costs,n,objective)).toEqual(result);
      }
    }
    expect(solveAssignment(new Float64Array(16),4)).toEqual([0,1,2,3]);
    expect(()=>solveAssignment(new Float64Array([NaN]),1)).toThrow(/costs/);
  });
  it('never substitutes a prohibited edge when no perfect matching exists',()=>{
    expect(()=>solveAssignment(new Float64Array([0,Infinity,0,Infinity]),2)).toThrow(/No complete assignment/);
    expect(solveAssignment(new Float64Array([Infinity,2,3,Infinity]),2)).toEqual([1,0]);
  });
  it('documents the distance versus balanced-travel tradeoff without claiming a minimax solution',()=>{
    const costs=new Float64Array([0,6,6,10]);
    expect(solveAssignment(costs,2,'distance')).toEqual([0,1]); // total 10, longest 10
    expect(solveAssignment(costs,2,'balanced')).toEqual([1,0]); // total 12, longest 6
  });
  it('completes deterministic 2, 64 and 500-member selections with exact geometry and fixed identity',async()=>{
    for(const n of [2,64,500]) {
      const performers=Array.from({length:n},(_,i)=>({id:'p'+String(i).padStart(3,'0'),label:'P'+i,name:'',sectionId:'section'}));
      const original=Object.fromEntries(performers.map((p,i)=>[p.id,{x:2+(i%25)*3.8,y:2+Math.floor(i/25)*2.5}]));
      const problem:AssignmentProblem={performers,original,slots:performers.map((p,i)=>({slot:i,point:original[performers[n-1-i].id],ownerId:p.id})),slotCount:n,sectionIds:['section'],checks:[],forcedPins:[{performerId:performers[0].id,slot:n-1}]};
      const before=structuredClone(problem),result=await optimizeAssignment(problem,emptyAssignmentConstraints());expect(problem).toEqual(before);
      for(const p of result.proposals){expect(p.metrics.travel).toBe(0);expect(p.metrics.flags).toBeNull();expect(p.metrics.demand).toBeNull();expect(p.order).toEqual(performers.map(p=>p.id).reverse());}
    }
    expect(solveAssignment(new Float64Array(500*500).fill(1),500)).toEqual(Array.from({length:500},(_,i)=>i));
  },15000);
  it('compiles pins, sections, roles, unknown policy, forbidden pairs and explicit ordered groups consistently',()=>{
    const people=Array.from({length:4},(_,i)=>({id:'p'+i,label:'P'+i,name:'',sectionId:i<2?'brass':'guard'}));
    const c=validateAssignmentConstraints({...emptyAssignmentConstraints(),pins:[{performerId:'p0',slot:0}],forbidden:[{performerId:'p1',slot:3}],sectionSlots:[{slot:1,sectionId:'brass'}],roleSlots:[{slot:2,role:'Flag'}],roles:{p2:'Flag'},orderedGroups:[{id:'order',name:'Brass order',performerIds:['p0','p1'],slots:[0,1]}]},people.map(p=>p.id),4,['brass','guard']);
    for(const unknownRoles of ['reject','allow'] as const){const rules={...c,unknownRoles},compiled=compileAssignmentEligibility(rules);for(const p of people)for(let slot=0;slot<4;slot++)expect(compiled(p,slot)).toBe(assignmentAllowed(rules,p,slot));}
    expect(assignmentAllowed(c,people[3],2)).toBe(false);expect(assignmentAllowed({...c,unknownRoles:'allow'},people[3],2)).toBe(true);
    expect(assignmentAllowed({...c,unknownRoles:'allow',roles:{...c.roles,p3:'Rifle'}},people[3],2)).toBe(false);
    const conflict=compileAssignmentEligibility({...c,pins:[...c.pins,{performerId:'p2',slot:0}]});expect(people.some(p=>conflict(p,0))).toBe(false);
  });
  it('accepts the full published performer and section ID lengths',()=>{
    const performerId='p'.repeat(128),sectionId='s'.repeat(128),person={id:performerId,label:'P',name:'',sectionId};
    const c=validateAssignmentConstraints({...emptyAssignmentConstraints(),pins:[{performerId,slot:0}],sectionSlots:[{slot:0,sectionId}],roles:{[performerId]:'Trumpet'}},[performerId],2,[sectionId]);
    expect(assignmentAllowed(c,person,0)).toBe(true);expect(assignmentAllowed(c,person,1)).toBe(false);
  });
  it('treats valid IDs matching object method names as unknown until explicitly tagged',()=>{
    const person={id:'toString',label:'P',name:'',sectionId:'section'},rules={...emptyAssignmentConstraints(),roleSlots:[{slot:0,role:'Trumpet'}],unknownRoles:'allow' as const};
    expect(assignmentRole(rules,person.id)).toBeUndefined();expect(assignmentAllowed(rules,person,0)).toBe(true);expect(compileAssignmentEligibility(rules)(person,0)).toBe(true);
    const known={...rules,roles:{toString:'Flag'}};expect(assignmentRole(known,person.id)).toBe('Flag');expect(assignmentAllowed(known,person,0)).toBe(false);expect(compileAssignmentEligibility(known)(person,0)).toBe(false);
  });
});

function setup() {
  const project=createDemoProject();project.performers=project.performers.slice(0,6);
  project.sets=project.sets.slice(0,3).map((set,index)=>({...set,positions:Object.fromEntries(project.performers.map((p,i)=>[p.id,i<4?{x:index===1?20+i*20:80-i*20,y:25}:{x:i===4?5:95,y:45}]))}));
  project.moves=project.moves.slice(0,2).map(m=>({...m,counts:8,transition:'ease' as const,paths:{}}));
  const store=createEditorStore(project),ids=project.performers.slice(0,4).map(p=>p.id);store.dispatch('set.select',{index:1});store.setValue('selection','selectedIds',ids);store.dispatch('formation.preview',{kind:'line'});
  store.dispatch('formation.update',{options:{center:{x:50,y:25},width:60,height:0,columns:4,rotation:0,assignment:'roster'}});
  const session=store.getState().ui.formationPreview!,problem=assignmentProblem(project,session,store.getState().ui.projectEpoch);
  return {project,store,ids,session,problem};
}
describe('proposal comparison and transaction safety',()=>{
  it('compares the physical 10-yard versus 12-yard objective tradeoff before commit',async()=>{
    const project=createDemoProject();project.performers=project.performers.slice(0,2);const ids=project.performers.map(p=>p.id);
    project.sets=project.sets.slice(0,2).map((s,i)=>({...s,positions:{[ids[0]]:{x:10,y:10},[ids[1]]:i?{x:16,y:10}:{x:23/3,y:10+Math.sqrt(275)/3}}}));
    project.moves=project.moves.slice(0,1).map(m=>({...m,counts:8,transition:'linear' as const,paths:{}}));
    const store=createEditorStore(project);store.dispatch('set.select',{index:1});store.setValue('selection','selectedIds',ids);store.dispatch('formation.preview',{kind:'line'});store.dispatch('formation.update',{options:{center:{x:13,y:10},width:6,height:0,rotation:0,columns:2,assignment:'roster'}});
    const problem=assignmentProblem(project,store.getState().ui.formationPreview!,0),result=await optimizeAssignment(problem,emptyAssignmentConstraints()),[shortest,balanced]=result.proposals;
    expect(shortest.metrics.travel).toBeCloseTo(10,8);expect(shortest.metrics.longestTravel).toBeCloseTo(10,8);expect(balanced.metrics.travel).toBeCloseTo(12,8);expect(balanced.metrics.longestTravel).toBeCloseTo(6,8);
    expect(shortest.metrics.demand!.lower).toBeLessThanOrEqual(1.25);expect(shortest.metrics.demand!.upper).toBeGreaterThanOrEqual(1.25);expect(balanced.metrics.demand!.lower).toBeLessThanOrEqual(.75);expect(balanced.metrics.demand!.upper).toBeGreaterThanOrEqual(.75);
    expect(shortest.order).toEqual(ids);expect(balanced.order).toEqual([...ids].reverse());expect(store.getState().project.present).toEqual(project);expect(store.getState().project.past).toHaveLength(0);
  });
  it('reduces actual adjacent travel/crossing flags and reports shared peak-demand bounds',async()=>{
    const {store,problem}=setup(),before=structuredClone(problem),rules=defaultAssignmentConstraints(store.getState()),result=await optimizeAssignment(problem,rules);
    expect(problem).toEqual(before);expect(result.current.metrics.travel).toBeCloseTo(320,8);expect(result.current.metrics.flags!.spacing).toBeGreaterThan(0);
    expect(result.current.metrics.demand!.lower).toBeLessThanOrEqual(11.25);expect(result.current.metrics.demand!.upper).toBeGreaterThanOrEqual(11.25);expect(result.current.metrics.demand!.upper-result.current.metrics.demand!.lower).toBeLessThan(.0011);
    for(const proposal of result.proposals){expect(proposal.metrics.travel).toBe(0);expect(proposal.metrics.flags!.spacing).toBe(0);expect(proposal.metrics.demand!.upper).toBeLessThan(.001);expect(mappingEligible(problem,result.constraints,proposal.order)).toBe(true);}
  });
  it('accepts only a fresh eligible proposal, leaves history untouched until Apply, and saves v11 constraints with exact identities',async()=>{
    const {project,store,ids,session,problem}=setup(),result=await optimizeAssignment(problem,defaultAssignmentConstraints(store.getState())),state=store.getState();
    const review={revision:state.project.revision,epoch:state.ui.projectEpoch,signature:JSON.stringify(session),constraints:result.constraints,order:result.proposals[0].order};
    expect(store.dispatch('assignment.open')).toBe(true);expect(assignmentReviewCurrent(store.getState(),review)).toBe(true);expect(store.dispatch('assignment.accept',review)).toBe(true);
    expect(store.getState().project.past).toHaveLength(0);expect(store.getState().project.present).toEqual(project);expect(currentFormationResult(store.getState())!.error).toBeNull();expect(store.dispatch('formation.apply')).toBe(true);
    const accepted=store.getState().project.present;expect(accepted.performers).toEqual(project.performers);expect(accepted.moves).toEqual(project.moves);expect(accepted.sets[0]).toEqual(project.sets[0]);expect(accepted.sets[2]).toEqual(project.sets[2]);
    for(const p of project.performers.filter(p=>!ids.includes(p.id)))expect(accepted.sets[1].positions[p.id]).toEqual(project.sets[1].positions[p.id]);
    expect(store.getState().project.past).toHaveLength(1);const wire=serializeProject(accepted);expect(JSON.parse(wire).schemaVersion).toBe(11);expect(parseProject(wire)).toEqual(accepted);
    const old=JSON.parse(wire);old.schemaVersion=10;expect(()=>parseProject(JSON.stringify(old))).toThrow(/requires schema version 11/);
    store.dispatch('history.undo');expect(store.getState().project.present).toEqual(project);store.dispatch('history.redo');expect(store.getState().project.present).toEqual(accepted);
    const shape=accepted.sets[1].liveFormations![0];store.dispatch('live.edit',{id:shape.id});expect(store.getState().ui.formationPreview!.assignmentConstraints).toEqual(shape.assignmentConstraints);
    expect(store.dispatch('live.members',{ids:ids.slice(1)})).toBe(false);expect(currentFormationResult(store.getState())!.changed).toBe(false);
  });
  it('rejects stale selection and forged pairings, and cancellation keeps the existing formation draft',async()=>{
    const {project,store,session,problem,ids}=setup(),rules={...emptyAssignmentConstraints(),pins:[{performerId:ids[0],slot:0}]};
    const result=await optimizeAssignment(problem,rules),state=store.getState(),review={revision:state.project.revision,epoch:state.ui.projectEpoch,signature:JSON.stringify(session),constraints:result.constraints,order:result.proposals[0].order};
    store.dispatch('assignment.open');const forged=[...review.order];[forged[0],forged[1]]=[forged[1],forged[0]];
    expect(store.dispatch('assignment.accept',{...review,order:forged})).toBe(false);expect(store.getState().project.present).toEqual(project);
    store.setValue('ui','dialog',null);expect(store.getState().ui.formationPreview).toEqual(session);store.dispatch('assignment.open');
    store.setValue('selection','selectedIds',ids.slice(1));expect(store.dispatch('assignment.accept',review)).toBe(false);store.setValue('selection','selectedIds',ids);
    store.setValue('ui','dialog',null);expect(store.getState().ui.formationPreview).toBeNull();expect(store.getState().project.past).toHaveLength(0);
  });
  it('persists rich restrictions, preserves them on copy and prunes detached identities without filling vacant slots',async()=>{
    const {store,ids,session,problem}=setup();
    const rules={...emptyAssignmentConstraints(),pins:[{performerId:ids[3],slot:0}],forbidden:[{performerId:ids[0],slot:0}],roleSlots:[{slot:0,role:'Trumpet'}],roles:{[ids[3]]:'Trumpet'},orderedGroups:[{id:'ordered',name:'Middle pair',performerIds:[ids[2],ids[1]],slots:[1,2]}]};
    const result=await optimizeAssignment(problem,rules),s=store.getState();store.dispatch('assignment.open');
    expect(store.dispatch('assignment.accept',{revision:s.project.revision,epoch:s.ui.projectEpoch,signature:JSON.stringify(session),constraints:result.constraints,order:result.proposals[0].order})).toBe(true);store.dispatch('formation.apply');
    const accepted=store.getState().project.present,shape=accepted.sets[1].liveFormations![0];expect(parseProject(serializeProject(accepted))).toEqual(accepted);
    expect(store.dispatch('live.copy',{id:shape.id,targetSetId:accepted.sets[2].id})).toBe(true);expect(store.getState().ui.formationPreview!.assignmentConstraints).toEqual(shape.assignmentConstraints);store.dispatch('formation.cancel');
    store.dispatch('set.select',{index:1});expect(store.dispatch('live.detach',{id:shape.id,ids:[ids[3]]})).toBe(true);
    const detached=store.getState().project.present,remaining=detached.sets[1].liveFormations![0];expect(remaining.members.some(m=>m.slot===0)).toBe(false);expect(remaining.assignmentConstraints!.pins).toEqual([]);expect(remaining.assignmentConstraints!.roles).toEqual({});expect(remaining.assignmentConstraints!.roleSlots).toEqual(rules.roleSlots);
    expect(parseProject(serializeProject(detached))).toEqual(detached);store.dispatch('live.edit',{id:shape.id});
    const vacant=assignmentProblem(detached,store.getState().ui.formationPreview!,store.getState().ui.projectEpoch);expect(vacant.slots.map(s=>s.slot)).toEqual([1,2,3]);
    const comparison=await optimizeAssignment(vacant,remaining.assignmentConstraints!);expect(comparison.proposals).toHaveLength(2);expect(comparison.proposals.every(p=>p.order.length===3)).toBe(true);
    store.dispatch('formation.cancel');store.dispatch('history.undo');expect(store.getState().project.present).toEqual(accepted);
  });
  it('explains infeasible rules and respects fixed detailed endpoints instead of snapping or dropping paths',async()=>{
    const {problem,ids}=setup();const impossible={...emptyAssignmentConstraints(),pins:[{performerId:ids[0],slot:0},{performerId:ids[1],slot:0}]};
    const failed=await optimizeAssignment(problem,impossible);expect(failed.proposals).toEqual([]);expect(failed.infeasible).toMatch(/No complete assignment/);
    const incoming=problem.checks.find(c=>c.side==='incoming')!.input,track=incoming.tracks.find(t=>t.id===ids[0])!;track.from={...track.to};track.path={segments:[{id:'fixed-hold',kind:'hold',startCount:0,endCount:incoming.counts}]};incoming.detailedPaths=true;incoming.modelKey+='fixed';
    const result=await optimizeAssignment(problem,emptyAssignmentConstraints());for(const proposal of result.proposals)expect(proposal.order[0]).toBe(ids[0]);
  });
  it('revalidates fixed path endpoints at acceptance even for a forged unconstrained worker response',()=>{
    const {project,ids}=setup();project.sets[0].positions[ids[0]]={...project.sets[1].positions[ids[0]]};project.moves[0].paths[ids[0]]={segments:[{id:'fixed',kind:'hold',startCount:0,endCount:8}]};
    const store=createEditorStore(project);store.dispatch('set.select',{index:1});store.setValue('selection','selectedIds',ids);store.dispatch('formation.preview',{kind:'line'});store.dispatch('formation.update',{options:{center:{x:50,y:25},width:60,height:0,columns:4,rotation:0,assignment:'roster'}});
    const state=store.getState(),session=state.ui.formationPreview!;store.dispatch('assignment.open');
    expect(store.dispatch('assignment.accept',{revision:state.project.revision,epoch:state.ui.projectEpoch,signature:JSON.stringify(session),constraints:emptyAssignmentConstraints(),order:[...session.order!].reverse()})).toBe(false);
    expect(store.getState().project.present).toEqual(project);expect(store.getState().ui.formationPreview).toEqual(session);expect(store.getState().project.past).toHaveLength(0);
  });
  it('preserves scatter pin identities and does not reassign vacant slots',async()=>{
    const {store,project,ids}=setup();store.dispatch('formation.cancel');store.dispatch('formation.scatter');let session=store.getState().ui.formationPreview!;
    store.dispatch('scatter.pin',{slot:0,pinned:true});session=store.getState().ui.formationPreview!;const problem=assignmentProblem(project,session,0),owner=problem.slots[0].ownerId;
    const result=await optimizeAssignment(problem,emptyAssignmentConstraints());for(const p of result.proposals)expect(p.order[0]).toBe(owner);
    expect(problem.performers.map(p=>p.id).sort()).toEqual([...ids].sort());
  });
  it('cancels or exhausts its budget without returning a partial proposal or changing inputs',async()=>{
    const {problem}=setup(),before=structuredClone(problem);
    await expect(optimizeAssignment(problem,emptyAssignmentConstraints(),{canceled:()=>true})).rejects.toThrow(/canceled/);
    await expect(optimizeAssignment(problem,emptyAssignmentConstraints(),{budgetMs:0})).rejects.toThrow(/work budget/);expect(problem).toEqual(before);
  });
});

describe('shared step-demand measurements',()=>{
  it('bounds eased, held and independently timed travel using the analysis evaluator',()=>{
    const track={id:'a',label:'A',from:{x:0,y:0},to:{x:16,y:0},minimumSpacing:1,maximumStride:1.25,direction:'unknown',context:'test',path:{segments:[{id:'wait',kind:'hold',startCount:0,endCount:4},{id:'move',kind:'line',startCount:4,endCount:8}]}} as Track;
    const generator=peakStrideBounds(compileTrack(track,12,'ease'));let result=generator.next();while(!result.done)result=generator.next();expect(result.value.lower).toBeLessThanOrEqual(6);expect(result.value.upper).toBeGreaterThanOrEqual(6);expect(result.value.upper-result.value.lower).toBeLessThan(.0011);
  });
});
