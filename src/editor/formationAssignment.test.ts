import { describe, expect, it } from 'vitest';
import { createDemoProject, parseProject, serializeProject } from '../domain';
import { createEditorStore } from './store';
import { currentFormationResult } from './formationSession';

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
  it('defaults to positional mode and applies the same ID destinations after roster shuffling',()=>{
    const {store,ids,project}=setup();
    const shuffled=createEditorStore({...project,performers:[...project.performers].reverse()});shuffled.setValue('selection','selectedIds',ids);
    shuffled.dispatch('formation.preview',{kind:'line'});shuffled.dispatch('formation.update',{options:{...shuffled.getState().ui.formationPreview!.options,width:24,center:{x:50,y:25}}});
    expect(currentFormationResult(shuffled.getState())).toEqual(currentFormationResult(store.getState()));
    expect(store.getState().ui.formationPreview!.options.assignment).toBe('position');
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
    expect(store.getState().ui.formationPreview!.options.assignment).toBe('position');update({columns:2});
    const block=store.getState().ui.formationPreview!;update({rotation:90});update({columns:3});
    expect(store.getState().ui.formationPreview!.assignmentRotation).toBe(block.assignmentRotation);
    expect(new Set(store.getState().ui.formationPreview!.order).size).toBe(4);
    store.dispatch('formation.preview',{kind:'line'});expect(store.getState().ui.formationPreview!.options.assignment).toBe('roster');
    store.dispatch('formation.cancel');expect(store.getState().project.past).toHaveLength(0);
  });
});
