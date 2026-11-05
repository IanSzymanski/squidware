import { describe, expect, it } from 'vitest';
import { createDemoProject, parseProject, serializeProject } from '../domain';
import { createEditorStore } from './store';
import { currentFormationResult } from './formationSession';
import { generateFormation } from '../formationGeometry';
import { shortestTravelOrder } from '../formationAssignment';

function setup() {
  const project=createDemoProject(); const ids=project.performers.slice(0,4).map(p=>p.id);
  ids.forEach((id,i)=>project.sets[0].positions[id]={x:65-i*10,y:20});
  const store=createEditorStore(project);store.setValue('selection','selectedIds',[...ids].reverse());
  store.dispatch('formation.preview',{kind:'line'});
  const options=store.getState().ui.formationPreview!.options;
  store.dispatch('formation.update',{options:{...options,width:24,center:{x:50,y:25}}});
  return {store,ids,project:store.getState().project.present};
}
describe('formation assignment commands',()=>{
  it('defaults to shortest-travel mode and applies the same ID destinations after roster shuffling',()=>{
    const {store,ids,project}=setup();
    const shuffled=createEditorStore({...project,performers:[...project.performers].reverse()});shuffled.setValue('selection','selectedIds',ids);
    shuffled.dispatch('formation.preview',{kind:'line'});shuffled.dispatch('formation.update',{options:{...shuffled.getState().ui.formationPreview!.options,width:24,center:{x:50,y:25}}});
    expect(currentFormationResult(shuffled.getState())).toEqual(currentFormationResult(store.getState()));
    expect(store.getState().ui.formationPreview!).toMatchObject({assignmentMode:'shortest',options:{assignment:'position'}});
  });
  it('switches explicitly between shortest, positional and roster while geometry edits keep the chosen mode',()=>{
    const {store,ids}=setup();const preview=()=>store.getState().ui.formationPreview!;
    store.dispatch('formation.update',{options:{...preview().options,rotation:180}});
    expect(currentFormationResult(store.getState())!.updates[ids[0]].x).toBe(38); // Frozen order, now reversed.
    store.dispatch('formation.update',{options:{...preview().options,assignment:'position'}});expect(preview().assignmentMode).toBe('shortest');
    store.dispatch('formation.update',{options:preview().options,assignmentMode:'shortest'});
    const slots=generateFormation('line',4,preview().options),positions=store.getState().project.present.sets[0].positions;
    expect(preview().order).toEqual(shortestTravelOrder(positions,ids,slots));expect(currentFormationResult(store.getState())!.updates[ids[0]].x).toBe(62);
    store.dispatch('formation.update',{options:preview().options,assignmentMode:'position'});
    expect(preview()).toMatchObject({assignmentMode:'position',options:{assignment:'position'},assignmentRotation:180});expect(currentFormationResult(store.getState())!.updates[ids[0]].x).toBe(62);
    store.dispatch('formation.update',{options:{...preview().options,assignment:'roster'}});expect(preview()).toMatchObject({assignmentMode:'roster',options:{assignment:'roster'}});
    store.dispatch('formation.update',{options:{...preview().options,width:30}});expect(preview().assignmentMode).toBe('roster');
    expect(store.getState().ui.formationAssignmentModes.line).toBe('roster');expect(store.getState().project.past).toHaveLength(0);
  });
  it('freezes identity assignments during rotation, movement, dimension edits and repeated shape activation',()=>{
    const {store}=setup();const session=store.getState().ui.formationPreview!;
    for(const patch of [{rotation:180},{width:30},{center:{x:55,y:25}}]) {
      store.dispatch('formation.update',{options:{...store.getState().ui.formationPreview!.options,...patch}});
      expect(store.getState().ui.formationPreview!.order).toEqual(session.order);
    }
    store.dispatch('formation.preview',{kind:'line'});expect(store.getState().ui.formationPreview!.order).toEqual(session.order);
  });
  it('switches assignment without history, previews exact paths and applies one named reversible edit',()=>{
    const {store,ids,project}=setup();const original=serializeProject(project);
    const positional=currentFormationResult(store.getState())!;
    store.dispatch('formation.update',{options:{...store.getState().ui.formationPreview!.options,assignment:'roster'}});
    const result=currentFormationResult(store.getState())!;
    expect(result.updates[ids[0]].x).toBe(38); expect(positional.updates[ids[0]].x).toBe(62);
    expect(result.travel!.total).toBeGreaterThan(positional.travel!.total);
    expect(store.getState().project.past).toHaveLength(0); expect(serializeProject(store.getState().project.present)).toBe(original);
    store.dispatch('formation.apply'); const applied=store.getState().project.present;
    expect(applied.sets[0].positions).toEqual(result.positions);expect(applied.performers).toBe(project.performers);expect(applied.sets[1]).toBe(project.sets[1]);
    expect(store.getState().project.past).toHaveLength(1);expect(store.getState().project.past[0].name).toContain('roster assignment');
    expect(parseProject(serializeProject(applied))).toEqual(applied);
    store.dispatch('history.undo');expect(serializeProject(store.getState().project.present)).toBe(original);
    store.dispatch('history.redo');expect(store.getState().project.present).toEqual(applied);
  });
  it('retains each shape mode and reassigns block ranks only when their column structure changes',()=>{
    const {store}=setup(); const update=(patch:Record<string,unknown>)=>store.dispatch('formation.update',{options:{...store.getState().ui.formationPreview!.options,...patch}});
    update({assignment:'roster'});store.dispatch('formation.preview',{kind:'block'});
    expect(store.getState().ui.formationPreview!).toMatchObject({assignmentMode:'shortest',options:{assignment:'position'}});update({columns:2});
    const block=store.getState().ui.formationPreview!;update({rotation:90});update({columns:3});
    expect(store.getState().ui.formationPreview!.assignmentRotation).toBe(block.assignmentRotation);
    const reranked=store.getState().ui.formationPreview!;
    expect(reranked.order).toEqual(shortestTravelOrder(store.getState().project.present.sets[0].positions,reranked.ids,generateFormation('block',4,reranked.options)));
    expect(new Set(store.getState().ui.formationPreview!.order).size).toBe(4);
    store.dispatch('formation.preview',{kind:'line'});expect(store.getState().ui.formationPreview!).toMatchObject({assignmentMode:'roster',options:{assignment:'roster'}});
    store.dispatch('formation.cancel');expect(store.getState().project.past).toHaveLength(0);
  });
  it('redistributes live members by shortest travel and keeps Scatter and Bézier on positional or roster order',()=>{
    const {store,ids}=setup();const preview=()=>store.getState().ui.formationPreview!;
    expect(store.dispatch('live.configure',{enabled:true})).toBe(true);
    expect(store.dispatch('live.members',{ids:ids.slice(1)})).toBe(true);
    const positions=store.getState().project.present.sets[0].positions;
    expect(preview()).toMatchObject({assignmentMode:'shortest',live:{slotCount:3}});
    expect(preview().order).toEqual(shortestTravelOrder(positions,preview().ids,generateFormation('line',3,preview().options)));
    store.dispatch('formation.cancel');store.setValue('selection','selectedIds',ids);
    for(const command of ['formation.scatter','formation.bezier'] as const){
      expect(command==='formation.scatter'?store.dispatch(command):store.dispatch(command,{wave:false})).toBe(true);
      expect(preview().assignmentMode).toBe('position');
      expect(store.dispatch('formation.update',{options:preview().options,assignmentMode:'shortest'})).toBe(false);
      expect(preview().assignmentMode).toBe('position');store.dispatch('formation.cancel');
    }
    expect(store.getState().ui.formationAssignmentModes.curve).toBeUndefined();
  });
});
