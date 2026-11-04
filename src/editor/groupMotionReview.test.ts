import { describe, expect, it } from 'vitest';
import { createDemoProject, parseProject, sampleProject, serializeProject } from '../domain';
import { effectiveMove } from '../groupMotion';
import { createEditorStore } from './store';
import { beginGroupMotion, groupMotionPlan, groupReviewCurrent } from './groupMotionReview';
import { historyName } from './historyNames';
import { paletteEntries } from './paletteCommands';
function fixture(){
  const p=createDemoProject();p.performers=p.performers.slice(0,4);const ids=p.performers.map(p=>p.id);p.sets=p.sets.slice(0,3).map(s=>({...s,positions:Object.fromEntries(ids.map((id,i)=>[id,{x:20+i*3,y:25}]))}));p.moves=p.moves.slice(0,2).map(m=>({...m,counts:16,paths:{}}));
  p.sharedRoutes=[{id:'r',name:'Route',closed:false,start:{x:10,y:10},segments:[{id:'s',kind:'line',to:{x:90,y:10}}]}];
  const store=createEditorStore(p);store.dispatch('set.select',{index:1});store.setValue('selection','selectedIds',ids.slice(0,3));store.dispatch('group.open',{});const review=beginGroupMotion(store.getState());return {p,ids,store,review};
}
describe('reviewed group movement commands',()=>{
  it('accepts only reviewed move metadata with one named undo, immutable endpoints and native-compatible reload',()=>{
    const {p,store,review}=fixture(),before=structuredClone(p),plan=groupMotionPlan(p,review);expect(plan.changed).toBe(true);expect(plan.project.sets).toEqual(p.sets);expect(plan.project.moves[1]).toEqual(p.moves[1]);expect(plan.project.moves[0].paths).toEqual(p.moves[0].paths);expect(p).toEqual(before);
    expect(store.dispatch('group.apply',review)).toBe(true);const next=store.getState().project.present;expect(store.getState().project.past).toHaveLength(1);expect(store.getState().project.past[0].name).toMatch(/group movement/);expect(parseProject(serializeProject(next))).toEqual(next);store.dispatch('history.undo');expect(store.getState().project.present).toEqual(p);store.dispatch('history.redo');expect(store.getState().project.present).toEqual(next);
  });
  it('keeps base paths dormant only after explicit acknowledgement and restores them on removal',()=>{
    const {p,ids,review}=fixture();p.moves[0].paths[ids[0]]={segments:[{id:'authored',kind:'cubic',startCount:0,endCount:16,control1:{x:30,y:30},control2:{x:40,y:35}}]};
    expect(()=>groupMotionPlan(p,review)).toThrow(/allow.*override/);review.allowOverride=true;const next=groupMotionPlan(p,review).project;expect(next.moves[0].paths).toEqual(p.moves[0].paths);expect(effectiveMove(next,0).paths[ids[0]]).not.toEqual(p.moves[0].paths[ids[0]]);
    const remove={...review,existing:true,group:null};expect(groupMotionPlan(next,remove).project).toEqual(p);
  });
  it('retains no-op group ordering and rejects overlapping membership and duplicate names',()=>{
    const {p,review,ids}=fixture();review.group!.members=ids.slice(0,2);const first=groupMotionPlan(p,review).project;const other={...review,groupId:'other',group:{...review.group!,id:'other',name:'Other',members:ids.slice(2)}};const two=groupMotionPlan(first,other).project;const edit={...review,existing:true};expect(groupMotionPlan(two,edit).changed).toBe(false);expect(groupMotionPlan(two,edit).project.moves[0].groupMotions!.map(g=>g.id)).toEqual([review.groupId,'other']);expect(()=>groupMotionPlan(first,{...other,group:{...other.group,name:review.group!.name}})).toThrow(/names.*unique/);
    const duplicate={...review,groupId:'new',group:{...review.group!,id:'new',name:'Other'}};expect(()=>groupMotionPlan(first,duplicate)).toThrow(/only one group/);
  });
  it('copies a reviewed program to another move without changing the source and fits counts explicitly',()=>{
    const {p,review,store}=fixture();p.moves[1].counts=32;review.copy={moveId:p.moves[1].id,groupId:'copy',fitCounts:true};const copied=groupMotionPlan(p,review);expect(copied.index).toBe(1);expect(historyName(store.getState(),'group.apply',review)).toContain('Set 3');expect(copied.project.moves[0]).toEqual(p.moves[0]);expect(copied.project.sets).toEqual(p.sets);expect(copied.group!.speed).toBe(review.group!.speed/2);expect(copied.group!.delay).toBe(review.group!.delay*2);expect(copied.group!.members).toEqual(review.group!.members);
    const source=groupMotionPlan(p,{...review,copy:undefined}).project;for(const t of [0,.25,4,8,15.99,16])for(const id of review.group!.members){const a=sampleProject(copied.project,16+t*2).positions[id],b=sampleProject(source,t).positions[id];expect(a.x).toBeCloseTo(b.x,10);expect(a.y).toBeCloseTo(b.y,10);}
    review.copy.fitCounts=false;expect(groupMotionPlan(p,review).group!.speed).toBe(review.group!.speed);
  });
  it('rechecks revision, epoch, selected set/IDs, playback, view and pending drafts without partial edits',()=>{
    for(const which of ['revision','epoch','selection','set','playback','view','draft'] as const){const {store,review,p}=fixture();if(which==='revision')review.revision--;if(which==='epoch')review.epoch--;if(which==='selection')store.setValue('selection','selectedIds',[]);if(which==='set')store.setValue('selection','activeIndex',2);if(which==='playback')store.setValue('playback','playing',true);if(which==='view')store.setValue('ui','view','3d');if(which==='draft')store.setValue('ui','pendingDraft',true);expect(groupReviewCurrent(store.getState(),review)).toBe(false);expect(store.dispatch('group.apply',review)).toBe(false);expect(store.getState().project.present).toEqual(p);expect(store.getState().project.past).toHaveLength(0);}
  });
  it('cancels while preserving unrelated drafts and selects saved members before reopening',()=>{
    const {store,review,p}=fixture();store.setValue('ui','pendingDraft',true);expect(store.dispatch('group.cancel')).toBe(true);expect(store.getState().ui.pendingDraft).toBe(true);expect(store.getState().project.present).toEqual(p);store.setValue('ui','pendingDraft',false);store.dispatch('group.open',{});store.dispatch('group.apply',review);store.setValue('selection','selectedIds',[]);expect(store.dispatch('group.open',{id:review.groupId})).toBe(true);expect(store.getState().selection.selectedIds).toEqual(review.group!.members);expect(beginGroupMotion(store.getState(),review.groupId).group).toEqual(review.group);
  });
  it('explains missing routes, incompatible connectors and invalid group IDs without accepting partial schedules',()=>{
    const {p,review}=fixture();expect(()=>groupMotionPlan({...p,sharedRoutes:undefined},review)).toThrow(/route/);expect(()=>groupMotionPlan(p,{...review,group:{...review.group!,id:'other'}})).toThrow(/identity/);expect(()=>groupMotionPlan(p,{...review,group:{...review.group!,entryCounts:0}})).toThrow(/entry connector/);
  });
  it('exposes group authoring and saved groups through the command palette',()=>{
    const {store,review}=fixture();store.dispatch('group.apply',review);const entries=paletteEntries(store.getState());expect(entries.some(e=>e.invocation.id==='group.open'&&!e.invocation.args.id)).toBe(true);expect(entries.some(e=>e.invocation.id==='group.open'&&e.invocation.args.id===review.groupId)).toBe(true);
  });
});
