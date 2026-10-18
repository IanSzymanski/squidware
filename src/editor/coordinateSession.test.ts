import { describe,expect,it } from 'vitest';
import { createDemoProject,parseProject,serializeProject } from '../domain';
import { createEditorStore } from './store';
import { currentCoordinateResult } from './coordinateSession';
import { canEditPositions } from './editMode';
import { hasUnsavedWork,markFileOpened } from './fileSession';
import type { CoordinateEntryOptions } from '../drillEntry';

function setup(single=false){
  const project=createDemoProject();const ids=project.performers.slice(0,single?1:3).map(p=>p.id);
  ids.forEach((id,i)=>project.sets[0].positions[id]={x:30.12+i*3.7,y:20.03+i*2.1});
  const store=createEditorStore(project);markFileOpened(store,false);store.setValue('selection','selectedIds',ids);
  const update=(patch:Partial<CoordinateEntryOptions>)=>store.dispatch('coordinates.update',{options:{...store.getState().ui.coordinatePreview!.options,...patch}});
  return {store,project,ids,update};
}
describe('coordinate entry session commands',()=>{
  it('opens an empty scoped preview without edits, pending drafts or saved state changes',()=>{
    const {store,project,ids}=setup();expect(store.dispatch('coordinates.preview',{})).toBe(true);
    expect(store.getState().ui.coordinatePreview?.options.mode).toBe('relative');expect(store.getState().ui.coordinatePreview?.ids).toEqual(ids);
    expect(canEditPositions(store.getState())).toBe(false);expect(store.getState().project.present).toEqual(project);
    expect(store.getState().project.past).toHaveLength(0);expect(hasUnsavedWork(store.getState())).toBe(false);expect(store.dispatch('coordinates.apply')).toBe(false);
  });
  it('supports prepopulated typed commands for exact singleton placement with one named undo and save/reopen geometry',()=>{
    const {store,project,ids}=setup(true);const before=serializeProject(project);
    expect(store.dispatch('coordinates.preview',{mode:'absolute',text:'Side 2: 4 outside the 40; on back hash'})).toBe(true);
    const result=currentCoordinateResult(store.getState())!;expect(result.updates[ids[0]]).toEqual({x:62.5,y:20});
    expect(serializeProject(store.getState().project.present)).toBe(before);expect(hasUnsavedWork(store.getState())).toBe(false);
    expect(store.dispatch('coordinates.apply')).toBe(true);const applied=store.getState().project.present;
    expect(applied.sets[0].positions).toEqual(result.positions);expect(applied.sets.slice(1)).toEqual(project.sets.slice(1));expect(applied.performers).toEqual(project.performers);expect(applied.moves).toEqual(project.moves);
    expect(store.getState().project.past).toHaveLength(1);expect(store.getState().project.past[0].name).toContain(`Place ${project.performers[0].label}`);expect(hasUnsavedWork(store.getState())).toBe(true);
    expect(parseProject(serializeProject(applied))).toEqual(applied);expect(store.getState().ui.coordinatePreview).toBeNull();
    store.dispatch('history.undo');expect(serializeProject(store.getState().project.present)).toBe(before);expect(hasUnsavedWork(store.getState())).toBe(false);
    store.dispatch('history.redo');expect(store.getState().project.present).toEqual(applied);
  });
  it.each([6,8,12] as const)('keeps exact %i-to-5 group offsets with independent snapping, audience orientation and one undo',steps=>{
    const {store,project,ids,update}=setup();project.snapping={steps,subdivision:4,target:'markings',group:'individual'};
    store.dispatch('project.load',{project});store.setValue('selection','selectedIds',ids);markFileOpened(store,false);
    store.dispatch('coordinates.preview',{});for(const text of ['1 step forward','2 steps forward','3 steps forward, 2 steps left'])update({text});
    const result=currentCoordinateResult(store.getState())!;expect(result.error).toBeNull();
    store.setValue('preferences','value',{...store.getState().preferences.value,fieldOrientation:'audience-top'});expect(currentCoordinateResult(store.getState())).toEqual(result);
    for(const id of ids){expect(result.positions[id].x-project.sets[0].positions[id].x).toBeCloseTo(-10/steps,9);expect(result.positions[id].y-project.sets[0].positions[id].y).toBeCloseTo(15/steps,9);}
    expect(store.getState().project.past).toHaveLength(0);expect(store.dispatch('coordinates.apply')).toBe(true);expect(store.getState().project.past).toHaveLength(1);expect(store.getState().project.past[0].name).toMatch(/^Move 3 performers/);
    store.dispatch('history.undo');expect(store.getState().project.present).toEqual(project);
  });
  it('never applies a previous valid parse after invalid input, an ambiguous side, a boundary crossing, no-op or pending unrelated draft',()=>{
    const {store,update}=setup(true);const history=store.getState().project;store.dispatch('coordinates.preview',{});
    for(const text of ['Side 1: on the 40; on back hash','on the 40; on back hash','Side 1: 100 yards outside the goal line; on back hash','Side 1: on the 40; on hash']){
      update({text});if(text.startsWith('Side 1: on the 40; on back'))expect(currentCoordinateResult(store.getState())?.error).toBeNull();else expect(store.dispatch('coordinates.apply')).toBe(false);
    }
    update({mode:'relative',text:'0 steps forward'});expect(store.dispatch('coordinates.apply')).toBe(false);
    update({text:'3 steps forward'});store.setValue('ui','pendingDraft',true);expect(store.dispatch('coordinates.apply')).toBe(false);
    expect(store.dispatch('coordinates.cancel')).toBe(true);expect(store.getState().ui.pendingDraft).toBe(true);expect(store.getState().project).toBe(history);expect(store.dispatch('coordinates.preview',{})).toBe(false);
  });
  it('requires explicit selection and excludes competing positional and snapping commands',()=>{
    const {store,ids}=setup();store.setValue('selection','selectedIds',[]);expect(store.dispatch('coordinates.preview',{})).toBe(false);
    store.setValue('selection','selectedIds',ids);store.dispatch('coordinates.preview',{});
    for(const [id,args] of [['transform.preview',{}],['formation.preview',{}],['spacing.preview',undefined],['selection.nudge',{key:'ArrowRight'}],['cast.show',{mode:'panel'}],['snapping.update',{settings:{steps:6,subdivision:1,target:'grid',group:'anchor'}}]] as const){
      // Check the public registry boundary, as a future palette would use it.
      expect((store.dispatch as (id:string,args:unknown)=>unknown)(id,args)).toBe(false);
    }
    store.dispatch('coordinates.cancel');store.dispatch('spacing.preview');expect(store.dispatch('coordinates.preview',{})).toBe(false);
    store.dispatch('spacing.cancel');store.dispatch('coordinates.preview',{mode:'absolute',text:'on the 50; on back hash'});expect(store.dispatch('coordinates.apply')).toBe(false);
  });
  it('normalizes omitted optional arguments and rejects malformed typed payloads before they reach the inline form',()=>{
    const {store}=setup();expect(store.dispatch('coordinates.preview',{mode:undefined,text:undefined})).toBe(true);
    const before=store.getState().ui.coordinatePreview!;expect(before.options).toEqual({mode:'relative',text:'',side:null,defaultUnit:'steps'});
    for(const options of [undefined,null,{...before.options,text:3},{...before.options,side:'1'},{...before.options,defaultUnit:'feet'},{...before.options,mode:'guess'}]){
      expect(store.dispatch('coordinates.update',{options:options as unknown as CoordinateEntryOptions})).toBe(false);expect(store.getState().ui.coordinatePreview).toBe(before);
    }
    expect(store.getState().project.past).toHaveLength(0);expect(store.dispatch('coordinates.apply')).toBe(false);
  });
  it('invalidates synchronously on membership, arrival, playback, dialog, workspace, view, revision, history transaction or project replacement',()=>{
    const changes:((s:ReturnType<typeof setup>['store'])=>unknown)[]=[s=>s.dispatch('selection.clear'),s=>s.dispatch('set.select',{index:1}),s=>s.dispatch('playback.toggle'),s=>s.dispatch('playback.scrub',{count:1}),s=>s.setValue('ui','view','3d'),s=>s.setValue('ui','workspace','cast'),s=>s.dispatch('dialog.open',{dialog:'help'}),s=>s.dispatch('set.update',{index:0,update:{notes:'changed'}}),s=>s.beginTransaction('Other edit'),s=>s.dispatch('project.load',{project:createDemoProject()})];
    for(const change of changes){const {store}=setup();store.dispatch('coordinates.preview',{text:'3 steps forward'});change(store);expect(store.getState().ui.coordinatePreview).toBeNull();expect(store.dispatch('coordinates.apply')).toBe(false);}
  });
});
