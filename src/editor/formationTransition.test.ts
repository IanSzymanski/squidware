import { describe, expect, it } from 'vitest';
import { createDemoProject, parseProject, sampleProject, serializeProject, setStartCount, validateProject } from '../domain';
import type { FormationKind, LiveFormation } from '../types';
import { liveFormationPoints } from '../liveFormations';
import { emptyAssignmentConstraints } from '../assignmentConstraints';
import { compareTransitionMovement } from '../transitionComparison';
import { transitionInput } from '../analysis/input';
import { sampleMovement } from '../movementPaths';
import { createEditorStore } from './store';
import { beginFormationTransition, formationTransitionCurrent, formationTransitionPlan, transitionMapping } from './formationTransition';

function fixture(kind:FormationKind='arc',count=4,reverse=false) {
  const p=createDemoProject(),extra=Math.min(2,500-count),sectionId=p.sections[0].id;
  p.performers=Array.from({length:count+extra},(_,i)=>({id:'p'+i,label:'P'+(i+1),name:'',sectionId}));
  p.sets=p.sets.slice(0,4).map(s=>({...s,positions:Object.fromEntries(p.performers.map((p,i)=>[p.id,{x:5+i%40*2,y:45}]))}));
  p.moves=p.moves.slice(0,3).map(m=>({...m,counts:16,transition:'linear',paths:{}}));
  const ids=p.performers.slice(0,count).map(p=>p.id);
  function shape(id:string,k:FormationKind,x:number,order:string[]):LiveFormation {
    const pin=order.indexOf(ids[0]);
    return {id,name:id,kind:k,options:{center:{x,y:25},width:count>64?32:18,height:k==='line'?0:count>64?24:8,rotation:0,columns:Math.ceil(Math.sqrt(count)),assignment:'roster'},slotCount:count,
      members:order.map((performerId,slot)=>({performerId,slot})),assignmentConstraints:{...emptyAssignmentConstraints(),pins:[{performerId:ids[0],slot:pin}],roles:{[ids[0]]:'Trumpet'},roleSlots:[{slot:pin,role:'Trumpet'}]}};
  }
  const from=shape('Source',count>64?'block':'line',25,ids),to=shape('Destination',kind,75,reverse?[...ids].reverse():ids);
  p.sets[1]={...p.sets[1],liveFormations:[from],positions:{...p.sets[1].positions,...liveFormationPoints(from,p.field)}};
  p.sets[2]={...p.sets[2],liveFormations:[to],positions:{...p.sets[2].positions,...liveFormationPoints(to,p.field)}};
  const project=validateProject(p),store=createEditorStore(project);store.dispatch('set.select',{index:2});store.setValue('selection','selectedIds',ids);
  const review=beginFormationTransition(store.getState());return {project,store,review,ids};
}
describe('controlled formation transitions',()=>{
  it('materializes line/arc/block endpoints into the same movement used by playback and reload',()=>{
    for(const kind of ['line','arc','block'] as const){
      const {project,review,ids}=fixture(kind,4,true),before=structuredClone(project);review.controls={kind:'cubic',bend:2,departure:1,arrival:12,stagger:.5};
      const {project:next,mapping}=formationTransitionPlan(project,review);expect(project).toEqual(before);expect(next.sets).toEqual(project.sets);expect(next.performers).toEqual(project.performers);expect(next.moves[0]).toEqual(project.moves[0]);expect(next.moves[2]).toEqual(project.moves[2]);
      expect(mapping.map(m=>m.destinationSlot)).toEqual([3,2,1,0]);
      const parsed=parseProject(serializeProject(next));expect(parsed).toEqual(next);expect(JSON.parse(serializeProject(next)).schemaVersion).toBe(11);
      for(const count of [0,.25,1,4.5,8,12,15.9,16]){const a=sampleProject(next,setStartCount(next,1)+count),b=sampleProject(parsed,setStartCount(parsed,1)+count);expect(a).toEqual(b);for(const p of project.performers.filter(p=>!ids.includes(p.id)))expect(a.positions[p.id]).toEqual(sampleProject(project,setStartCount(project,1)+count).positions[p.id]);}
      for(const id of ids){expect(sampleProject(next,16).positions[id]).toEqual(sampleProject(project,16).positions[id]);expect(sampleMovement(project.sets[1].positions[id],project.sets[2].positions[id],next.moves[1].paths[id],0,16)).toEqual(project.sets[1].positions[id]);expect(sampleProject(next,32).positions[id]).toEqual(project.sets[2].positions[id]);}
      expect(next.moves[1].counts).toBe(16);expect(next.moves[1].transition).toBe(project.moves[1].transition);
    }
  });
  it('preserves authored curves/submoves by default and replaces an override only by explicit member choice',()=>{
    const {project,ids}=fixture('line'),from=project.sets[1].positions[ids[0]],to=project.sets[2].positions[ids[0]];
    project.moves[1].paths[ids[0]]={segments:[{id:'wait',kind:'hold',startCount:0,endCount:3},{id:'custom',kind:'cubic',startCount:3,endCount:14,control1:{x:from.x+10,y:30},control2:{x:to.x-10,y:30}}]};
    const store=createEditorStore(project);store.dispatch('set.select',{index:2});store.setValue('selection','selectedIds',ids);const review=beginFormationTransition(store.getState());
    expect(review.policies[ids[0]].mode).toBe('preserve');review.controls={kind:'cubic',bend:-2,departure:1,arrival:12,stagger:0};
    const initial=formationTransitionPlan(project,review);expect(initial.project.moves[1].paths[ids[0]]).toEqual(project.moves[1].paths[ids[0]]);expect(initial.preserved).toBe(1);expect(initial.controlled).toBe(3);
    review.policies[ids[0]]={mode:'custom',path:{segments:[{id:'individual',kind:'line',startCount:2,endCount:15}]}};
    const override=formationTransitionPlan(project,review);expect(override.custom).toBe(1);expect(override.project.moves[1].paths[ids[0]].segments[0].startCount).toBe(2);
    (review.policies[ids[0]] as {path:{segments:{startCount:number}[]}}).path.segments[0].startCount=4;expect(override.project.moves[1].paths[ids[0]].segments[0].startCount).toBe(2);
    review.policies[ids[0]]={mode:'group'};expect(formationTransitionPlan(project,review).project.moves[1].paths[ids[0]].segments[0].kind).toBe('cubic');
  });
  it('uses explicit source/destination slot ranks for stagger while retaining member pins and identities',()=>{
    const {project,review,ids}=fixture('line',4,true);review.controls={kind:'line',bend:0,departure:1,arrival:12,stagger:.5};review.policies[ids[1]]={mode:'preserve'};
    let next=formationTransitionPlan(project,review);expect(next.project.moves[1].paths[ids[0]].segments[0].startCount).toBe(1);expect(next.project.moves[1].paths[ids[2]].segments[0].startCount).toBe(2);expect(next.project.moves[1].paths[ids[1]]).toBeUndefined();
    review.order='destination';review.mapping=transitionMapping(project,1,review.sourceId,review.destinationId,ids,review.order);next=formationTransitionPlan(project,review);
    expect(next.project.moves[1].paths[ids[0]].segments[0].startCount).toBe(2.5);expect(next.project.sets).toEqual(project.sets);
  });
  it('rejects invalid schedules, field controls, mappings and policy scopes without mutating the show',()=>{
    const {project,review,ids}=fixture('line'),before=structuredClone(project);
    for(const controls of [{...review.controls,arrival:0},{...review.controls,stagger:16},{...review.controls,departure:NaN},{...review.controls,kind:'cubic' as const,bend:100}])expect(()=>formationTransitionPlan(project,{...review,controls})).toThrow();
    const mapping=structuredClone(review.mapping);[mapping[0].destinationSlot,mapping[1].destinationSlot]=[mapping[1].destinationSlot,mapping[0].destinationSlot];expect(()=>formationTransitionPlan(project,{...review,mapping})).toThrow(/mapping changed/);
    expect(()=>formationTransitionPlan(project,{...review,policies:{...review.policies,other:{mode:'group'}}})).toThrow(/every selected/);
    expect(()=>formationTransitionPlan(project,{...review,ids:[ids[0],ids[0]]})).toThrow(/exactly once/);expect(project).toEqual(before);
  });
  it('explains absent endpoints and members without silently changing the selection',()=>{
    const {project,review,ids}=fixture();expect(()=>formationTransitionPlan(project,{...review,sourceId:'missing'})).toThrow(/Choose an editable/);
    expect(()=>transitionMapping(project,1,review.sourceId,review.destinationId,[...ids,'p4'],'source')).toThrow(/belong to both/);
    expect(()=>formationTransitionPlan(project,{...review,moveId:'missing'})).toThrow(/move/);
  });
  it('keeps no-op reviews out of history and accepts one scoped named transaction with undo/redo',()=>{
    const {project,store,review}=fixture('line');expect(formationTransitionPlan(project,review).changed).toBe(false);expect(store.dispatch('transition.open')).toBe(true);
    expect(store.dispatch('transition.apply',review)).toBe(false);expect(store.getState().project.past).toHaveLength(0);
    review.controls={...review.controls,kind:'cubic',bend:3,departure:2,arrival:14};expect(formationTransitionCurrent(store.getState(),review)).toBe(true);expect(store.dispatch('transition.apply',review)).toBe(true);
    const accepted=store.getState().project.present;expect(accepted.sets).toEqual(project.sets);expect(store.getState().project.past).toHaveLength(1);expect(store.getState().project.past[0].name).toMatch(/formation transition/i);
    store.dispatch('history.undo');expect(store.getState().project.present).toEqual(project);store.dispatch('history.redo');expect(store.getState().project.present).toEqual(accepted);
  });
  it('blocks stale selection, revision, epoch, playback and view changes at acceptance',()=>{
    for(const change of ['selection','revision','epoch','playback','view','pending'] as const){
      const {project,store,review,ids}=fixture();review.controls.kind='cubic';review.controls.bend=2;store.dispatch('transition.open');
      if(change==='selection')store.setValue('selection','selectedIds',ids.slice(1));
      if(change==='revision')review.revision--;
      if(change==='epoch')review.epoch--;
      if(change==='playback')store.setValue('playback','playing',true);
      if(change==='view')store.setValue('ui','view','3d');
      if(change==='pending')store.setValue('ui','pendingDraft',true);
      expect(store.dispatch('transition.apply',review)).toBe(false);expect(store.getState().project.present).toEqual(project);expect(store.getState().project.past).toHaveLength(0);
    }
  });
  it('requires explicit valid selection at an arrival and allows cancellation without accepting the draft',()=>{
    const {store,review,project}=fixture();store.setValue('selection','selectedIds',[]);expect(store.dispatch('transition.open')).toBe(false);store.setValue('selection','selectedIds',review.ids);store.dispatch('set.select',{index:0});expect(store.dispatch('transition.open')).toBe(false);
    store.dispatch('set.select',{index:2});store.dispatch('transition.open');review.controls.bend=4;store.setValue('ui','pendingDraft',true);expect(store.dispatch('transition.cancel')).toBe(true);expect(store.getState().ui.dialog).toBeNull();expect(store.getState().ui.pendingDraft).toBe(true);expect(store.getState().project.present).toEqual(project);expect(store.getState().project.past).toHaveLength(0);
  });
  it('rejects individual schedules that miss their immutable destination or leave the field',()=>{
    const {project,review,ids}=fixture();review.policies[ids[0]]={mode:'custom',path:{segments:[{id:'hold',kind:'hold',startCount:0,endCount:16}]}};expect(()=>formationTransitionPlan(project,review)).toThrow();
    review.policies[ids[0]]={mode:'custom',path:{segments:[{id:'bad',kind:'cubic',startCount:0,endCount:16,control1:{x:-1,y:25},control2:{x:50,y:25}}]}};expect(()=>formationTransitionPlan(project,review)).toThrow();
  });
  it('does not manufacture a curved loop for a stationary member',()=>{
    const {project,review}=fixture('line');const shape=project.sets[2].liveFormations![0];shape.options.center={...project.sets[1].liveFormations![0].options.center};project.sets[2].positions={...project.sets[2].positions,...liveFormationPoints(shape,project.field)};
    review.controls.kind='cubic';review.controls.bend=4;const result=formationTransitionPlan(project,review);expect(result.changed).toBe(false);
  });
  it('handles 2/64/500 member definitions, exact endpoints and portable schedules without changing constraints',()=>{
    for(const count of [2,64,500]){const {project,review,ids}=fixture('block',count);review.controls={kind:'cubic',bend:2,departure:2,arrival:14,stagger:0};const next=formationTransitionPlan(project,review).project;
      expect(next.sets).toEqual(project.sets);expect(Object.keys(next.moves[1].paths)).toHaveLength(count);expect(parseProject(serializeProject(next))).toEqual(next);
      for(const id of ids){expect(sampleProject(next,16).positions[id]).toEqual(sampleProject(project,16).positions[id]);expect(sampleMovement(project.sets[1].positions[id],project.sets[2].positions[id],next.moves[1].paths[id],0,16)).toEqual(project.sets[1].positions[id]);expect(sampleProject(next,32).positions[id]).toEqual(project.sets[2].positions[id]);}
    }
  },20000);
});
describe('shared transition movement comparison',()=>{
  it('measures selected distance and conservative demand, with all-cast flags on the exact candidate',async()=>{
    const {project,review,ids}=fixture('line');review.controls={kind:'cubic',bend:2,departure:2,arrival:14,stagger:0};const next=formationTransitionPlan(project,review).project;
    const before=transitionInput(project,2,0)!,after=transitionInput(next,2,0)!,comparison=await compareTransitionMovement(before,after,ids);
    expect(comparison.current.travel).toBe(200);expect(comparison.proposed.travel).toBeGreaterThan(200);expect(comparison.proposed.demand.upper).toBeGreaterThan(comparison.current.demand.upper);expect(comparison.current.stride).toBe(4);expect(comparison.proposed.stride).toBe(4);expect(comparison.issueCount).toBe(comparison.proposed.spacing+comparison.proposed.stride);
    expect(comparison.issues.every(i=>i.atCount!==undefined&&i.atCount>=16&&i.atCount<=32)).toBe(true);
  });
  it('returns explicit cancellation/work-budget failures and never mutates compared inputs',async()=>{
    const {project,ids}=fixture(),input=transitionInput(project,2,0)!,before=structuredClone(input);
    await expect(compareTransitionMovement(input,input,ids,{canceled:()=>true})).rejects.toThrow(/canceled/);await expect(compareTransitionMovement(input,input,ids,{budgetMs:0})).rejects.toThrow(/budget/);expect(input).toEqual(before);
  });
  it('bounds worker result detail for 500 members while retaining every flag in the totals',async()=>{
    const {project,review,ids}=fixture('block',500);review.controls={kind:'cubic',bend:2,departure:2,arrival:14,stagger:0};const next=formationTransitionPlan(project,review).project;
    const result=await compareTransitionMovement(transitionInput(project,2,0)!,transitionInput(next,2,0)!,ids);
    expect(result.proposed.stride).toBe(500);expect(result.issueCount).toBeGreaterThanOrEqual(500);expect(result.issues.length).toBe(100);
  },30000);
});
