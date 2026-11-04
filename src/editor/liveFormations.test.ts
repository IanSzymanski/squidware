import { describe, expect, it } from 'vitest';
import { analyzeTransition, createDemoProject, parseProject, sampleProject, serializeProject, validateProject } from '../domain';
import { projectV2AsLegacy } from '../projectV2';
import { validateLiveFormations } from '../liveFormations';
import type { FormationKind } from '../types';
import { createEditorStore } from './store';
import { currentFormationResult } from './formationSession';
import { paletteEntries } from './paletteCommands';

function setup(kind: FormationKind = 'line', count = 4) {
  const project=createDemoProject(), ids=project.performers.slice(0,count).map(p=>p.id);
  const store=createEditorStore(project);
  store.setValue('selection','selectedIds',ids);
  expect(store.dispatch('formation.preview',{kind})).toBe(true);
  const options=store.getState().ui.formationPreview!.options;
  store.dispatch('formation.update',{options:{...options,center:{x:50,y:25},width:20,height:10,columns:2}});
  store.dispatch('live.configure',{enabled:true,name:'Front ensemble'});
  expect(currentFormationResult(store.getState())?.error).toBeNull();
  expect(store.dispatch('formation.apply')).toBe(true);
  const shape=store.getState().project.present.sets[0].liveFormations![0];
  return {store,ids,shape};
}
describe('live formations',()=>{
  it.each<FormationKind>(['line','arc','block','circle','curve'])('%s reopens after save, edits exact geometry and keeps assignment identity',kind=>{
    const {store,shape,ids}=setup(kind), saved=serializeProject(store.getState().project.present);
    expect(JSON.parse(saved).schemaVersion).toBe(7);
    expect(projectV2AsLegacy.bind(null,store.getState().project.present)).toThrow(/Live formations/);
    store.dispatch('project.load',{project:parseProject(saved)});
    expect(store.getState().project.present.schemaVersion).toBe(2);
    expect(store.dispatch('live.edit',{id:shape.id})).toBe(true);
    expect(currentFormationResult(store.getState())?.changed).toBe(false);
    const session=store.getState().ui.formationPreview!;
    expect(session.order).toEqual(shape.members.map(m=>m.performerId));
    store.dispatch('formation.update',{options:{...session.options,width:26,height:12,rotation:20,columns:3}});
    expect(store.getState().ui.formationPreview!.order).toEqual(session.order);
    const expected=currentFormationResult(store.getState())!.updates;
    store.dispatch('live.configure',{name:'Edited'});
    expect(store.dispatch('formation.apply')).toBe(true);
    const edited=store.getState().project.present;
    for(const id of ids) expect(edited.sets[0].positions[id]).toEqual(expected[id]);
    expect(edited.sets[0].liveFormations![0]).toMatchObject({id:shape.id,name:'Edited',kind,options:{width:26,height:12,rotation:20,columns:3}});
    expect(store.getState().project.past).toHaveLength(1);
    expect(store.getState().project.past[0].name).toMatch(/Save live formation/);
    store.dispatch('history.undo'); expect(serializeProject(store.getState().project.present)).toBe(saved);
    store.dispatch('history.redo'); expect(parseProject(serializeProject(edited))).toEqual(edited);
    store.dispatch('live.edit',{id:shape.id});store.dispatch('formation.preview',{kind:kind==='line'?'arc':'line'});
    expect(store.getState().ui.formationPreview!.live?.id).toBe(shape.id);
    store.dispatch('formation.cancel'); expect(store.getState().project.present).toEqual(edited);
  });
  it('metadata-only creation, rename, cancel and detach are undoable without moving dots',()=>{
    const {store,shape}=setup(), before=store.getState().project.present;
    store.dispatch('live.edit',{id:shape.id});store.dispatch('live.configure',{name:'Renamed'});
    expect(currentFormationResult(store.getState())!.changed).toBe(true);
    store.dispatch('formation.cancel');expect(store.getState().project.present).toEqual(before);
    store.dispatch('live.edit',{id:shape.id});store.dispatch('live.configure',{name:'Renamed'});store.dispatch('formation.apply');
    expect(store.getState().project.present.sets[0].positions).toEqual(before.sets[0].positions);
    store.dispatch('live.detach',{id:shape.id});expect(store.getState().project.present.sets[0].liveFormations).toBeUndefined();
    store.dispatch('history.undo');expect(store.getState().project.present.sets[0].liveFormations![0].name).toBe('Renamed');
    store.dispatch('history.undo');expect(store.getState().project.present).toEqual(before);
    store.dispatch('history.undo'); // original positions
    store.dispatch('formation.preview',{kind:'line'});const session=store.getState().ui.formationPreview!;
    store.dispatch('formation.update',{options:{...session.options,width:20,height:10,columns:2,center:{x:50,y:25}}});store.dispatch('formation.apply');
    store.dispatch('formation.preview',{kind:'line'});expect(currentFormationResult(store.getState())!.changed).toBe(false);
    store.dispatch('live.configure',{enabled:true});expect(currentFormationResult(store.getState())!.changed).toBe(true);expect(store.dispatch('formation.apply')).toBe(true);
  });
  it('individual edits detach only moved dots, preserve holes through reopen, and explicit redistribution closes them',()=>{
    const {store,shape,ids}=setup(), before=store.getState().project.present, removed=shape.members[1].performerId;
    store.dispatch('positions.move',{index:0,updates:{[removed]:{x:5,y:5}}});
    const detached=store.getState().project.present, live=detached.sets[0].liveFormations![0];
    expect(live.slotCount).toBe(4);expect(live.members).toEqual(shape.members.filter(m=>m.performerId!==removed));
    for(const id of ids.filter(id=>id!==removed)) expect(detached.sets[0].positions[id]).toEqual(before.sets[0].positions[id]);
    store.dispatch('history.undo');expect(store.getState().project.present).toEqual(before);store.dispatch('history.redo');
    store.dispatch('project.load',{project:parseProject(serializeProject(detached))});store.dispatch('live.edit',{id:shape.id});
    expect(currentFormationResult(store.getState())!.changed).toBe(false);
    const session=store.getState().ui.formationPreview!;
    store.dispatch('formation.update',{options:{...session.options,center:{x:52,y:25}}});
    expect(currentFormationResult(store.getState())!.updates[shape.members[2].performerId].x).toBeCloseTo(before.sets[0].positions[shape.members[2].performerId].x+2);
    store.dispatch('formation.cancel');store.dispatch('live.edit',{id:shape.id});store.dispatch('live.redistribute');
    expect(store.getState().ui.formationPreview!.live!.slots).toEqual([0,1,2]);store.dispatch('formation.apply');
    expect(store.getState().project.present.sets[0].liveFormations![0].slotCount).toBe(3);
    expect(store.getState().project.present.sets[0].positions[removed]).toEqual({x:5,y:5});
  });
  it.each<FormationKind>(['line','arc','block'])('%s membership add/remove/empty previews are explicit and shared members block apply until resolved',kind=>{
    const {store,shape,ids}=setup(kind), extra=store.getState().project.present.performers[5].id;
    store.dispatch('live.edit',{id:shape.id});store.dispatch('live.members',{ids:[ids[0],ids[1],extra]});
    expect(store.getState().selection.selectedIds).toEqual([ids[0],ids[1],extra]);expect(currentFormationResult(store.getState())!.error).toBeNull();
    store.dispatch('formation.apply');const saved=store.getState().project.present;
    expect(saved.sets[0].liveFormations![0].members.map(m=>m.performerId).sort()).toEqual([ids[0],ids[1],extra].sort());
    store.dispatch('live.edit',{id:shape.id});store.dispatch('live.members',{ids:[]});expect(store.dispatch('formation.apply')).toBe(false);
    store.dispatch('live.members',{ids:[extra]});expect(currentFormationResult(store.getState())!.error).toBeNull();store.dispatch('formation.cancel');
    expect(store.getState().project.present).toBe(saved);
    store.setValue('selection','selectedIds',[ids[0],ids[2]]);store.dispatch('formation.preview',{});store.dispatch('live.configure',{enabled:true,name:'Conflict'});
    expect(currentFormationResult(store.getState())!.error).toMatch(/another live formation/);expect(store.dispatch('formation.apply')).toBe(false);
    store.dispatch('live.members',{ids:[ids[2],ids[3]]});expect(currentFormationResult(store.getState())!.error).toBeNull();store.dispatch('formation.apply');
    expect(store.getState().project.present.sets[0].liveFormations).toHaveLength(2);
    store.dispatch('live.edit',{id:shape.id});store.dispatch('live.configure',{name:'Conflict'});expect(currentFormationResult(store.getState())!.error).toMatch(/unique/);
  });
  it('canceled drag restores ownership, committed drag and roster removal detach, undo restores both',()=>{
    const {store,shape,ids}=setup(), before=store.getState().project.present;
    store.beginTransaction('Move dot');store.dispatch('positions.move',{index:0,updates:{[ids[0]]:{x:5,y:5}}});
    expect(store.getState().project.present.sets[0].liveFormations![0].members).toHaveLength(3);
    store.cancelTransaction();expect(store.getState().project.present).toEqual(before);
    store.beginTransaction('Move dot');store.dispatch('positions.move',{index:0,updates:{[ids[0]]:{x:5,y:5}}});store.commitTransaction();
    store.dispatch('history.undo');expect(store.getState().project.present).toEqual(before);
    store.dispatch('performers.remove',{ids:[ids[0]]});const after=store.getState().project.present;
    expect(after.sets[0].liveFormations![0].members).toHaveLength(3);expect(after.sets[0].liveFormations![0].slotCount).toBe(4);
    expect(validateProject(after)).toEqual(after);store.dispatch('history.undo');expect(store.getState().project.present).toEqual(before);
    store.dispatch('live.detach',{id:shape.id,ids:[ids[1]]});expect(store.getState().project.present.sets[0].liveFormations![0].members).toHaveLength(3);
  });
  it('copies to other sets through preview, detects ownership conflict, and duplicate keeps independent IDs',()=>{
    const {store,shape}=setup(), original=store.getState().project.present, target=original.sets[1].id;
    expect(store.dispatch('live.copy',{id:shape.id,targetSetId:target})).toBe(true);
    expect(store.getState().selection.activeIndex).toBe(1);expect(store.getState().ui.formationPreview!.live!.id).not.toBe(shape.id);
    expect(store.getState().project.present).toBe(original);store.dispatch('formation.cancel');expect(store.getState().project.present).toBe(original);
    store.dispatch('set.select',{index:0});store.dispatch('live.copy',{id:shape.id,targetSetId:target});expect(store.dispatch('formation.apply')).toBe(true);
    const copied=store.getState().project.present;expect(copied.sets[0]).toBe(original.sets[0]);expect(copied.sets[1].liveFormations![0].members).toEqual(shape.members);
    store.dispatch('set.select',{index:0});store.dispatch('live.copy',{id:shape.id,targetSetId:target});expect(currentFormationResult(store.getState())!.error).toMatch(/another live formation/);store.dispatch('formation.cancel');
    store.dispatch('set.select',{index:0});store.dispatch('set.duplicate');
    expect(store.getState().project.present.sets[1].liveFormations![0].id).not.toBe(shape.id);
    expect(store.getState().project.present.sets[1].liveFormations![0].members).toEqual(shape.members);
    expect(parseProject(serializeProject(store.getState().project.present))).toEqual(store.getState().project.present);
  });
  it('rejects malformed or mismatched metadata, downgrade attempts, and unsupported future versions',()=>{
    const {store}=setup(), project=store.getState().project.present, shape=project.sets[0].liveFormations![0];
    for(const change of [(f:typeof shape)=>{f.members[0].slot=500},(f:typeof shape)=>{f.members[0].performerId='missing'},(f:typeof shape)=>{f.members[1].slot=f.members[0].slot},(f:typeof shape)=>{f.options.width=NaN},(f:typeof shape)=>{f.options.center.x+=1},(f:typeof shape)=>{f.slotCount=501},(f:typeof shape)=>{f.members=[]},(f:typeof shape)=>{f.name='\n'}]) {
      const bad=structuredClone(shape);change(bad);expect(()=>validateLiveFormations([bad],project.sets[0].positions,project.field)).toThrow(/live formation/i);
    }
    const wire=JSON.parse(serializeProject(project));
    for(const schemaVersion of [1,2,3,4,5,6]) expect(()=>parseProject(JSON.stringify({...wire,schemaVersion}))).toThrow(/requires schema version 7/);
    expect(()=>parseProject('{"schemaVersion":13}')).toThrow(/Update Squidware/);
  });
  it('guards pending, stale and out-of-field previews and exposes the same live edit through Commands',()=>{
    const {store,shape}=setup();expect(paletteEntries(store.getState()).find(e=>e.key===`live-edit-${shape.id}`)?.disabledReason).toBeNull();
    store.setValue('ui','pendingDraft',true);expect(store.dispatch('live.edit',{id:shape.id})).toBe(false);store.setValue('ui','pendingDraft',false);
    store.dispatch('live.edit',{id:shape.id});const session=store.getState().ui.formationPreview!;
    store.dispatch('formation.update',{options:{...session.options,width:200}});expect(currentFormationResult(store.getState())!.error).toMatch(/boundary/);expect(store.dispatch('formation.apply')).toBe(false);
    store.dispatch('formation.cancel');store.dispatch('live.edit',{id:shape.id});store.dispatch('set.update',{index:0,update:{notes:'changed'}});
    expect(store.getState().ui.formationPreview).toBeNull();expect(store.dispatch('formation.apply')).toBe(false);
  });
  it('committed slots, serialized dots, playback and analysis use identical physical coordinates',()=>{
    const {store,shape}=setup('arc');store.dispatch('live.edit',{id:shape.id});
    const session=store.getState().ui.formationPreview!;store.dispatch('formation.update',{options:{...session.options,height:15,rotation:12}});
    const expected=currentFormationResult(store.getState())!.updates;store.dispatch('formation.apply');
    const reopened=parseProject(serializeProject(store.getState().project.present));
    for(const [id,point] of Object.entries(expected)) expect(sampleProject(reopened,0).positions[id]).toEqual(point);
    const plain={...reopened,sets:reopened.sets.map(({liveFormations:_live,...set})=>set)};
    for(const count of [0,.5,16,32]) expect(sampleProject(reopened,count)).toEqual(sampleProject(plain,count));
    expect(analyzeTransition(reopened,1)).toEqual(analyzeTransition(plain,1));
  });
  it('validates custom hold constraints before committing live endpoint edits',()=>{
    const p=createDemoProject(), id=p.performers[0].id;
    p.sets[1].positions[id]={...p.sets[0].positions[id]};
    p.moves[0].paths[id]={segments:[{id:'hold',kind:'hold',startCount:0,endCount:p.moves[0].counts}]};
    const store=createEditorStore(p);store.setValue('selection','selectedIds',[id]);
    store.dispatch('formation.preview',{kind:'line'});store.dispatch('live.configure',{enabled:true});
    const options=store.getState().ui.formationPreview!.options;
    store.dispatch('formation.update',{options:{...options,center:{x:50,y:25}}});
    expect(currentFormationResult(store.getState())!.error).toMatch(/hold/i);expect(store.dispatch('formation.apply')).toBe(false);
    expect(store.getState().project.present).toEqual(p);expect(store.getState().project.past).toHaveLength(0);
  });
  it.each([1,64,500])('bounded %i-member live formation keeps reload and reopen valid',count=>{
    // Demo has 64; extend a valid single-set roster for the maximum case.
    const project=createDemoProject();project.sets=project.sets.slice(0,1);project.moves=[];
    const sectionId=project.sections[0].id;
    project.performers=Array.from({length:count},(_,i)=>({id:`p-${i}`,label:`P${i}`,name:'',sectionId}));
    project.sets[0].positions=Object.fromEntries(project.performers.map((p,i)=>[p.id,{x:10+80*i/Math.max(1,count-1),y:25}]));
    const store=createEditorStore(project);store.setValue('selection','selectedIds',project.performers.map(p=>p.id));store.dispatch('formation.preview',{kind:'block'});
    store.dispatch('formation.update',{options:{center:{x:50,y:25},width:60,height:30,columns:20,rotation:0,assignment:'roster'}});store.dispatch('live.configure',{enabled:true});expect(store.dispatch('formation.apply')).toBe(true);
    const next=parseProject(serializeProject(store.getState().project.present));expect(next.sets[0].liveFormations![0].members).toHaveLength(count);
    store.dispatch('live.edit',{id:next.sets[0].liveFormations![0].id});expect(currentFormationResult(store.getState())!.changed).toBe(false);
  });
});
