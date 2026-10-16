import { describe, expect, it } from 'vitest';
import { createDemoProject, parseProject, serializeProject } from '../domain';
import type { FormationKind } from '../types';
import { createEditorStore } from './store';
import { currentFormationResult } from './formationSession';
import { canEditPositions } from './editMode';
import { hasUnsavedWork, markFileOpened } from './fileSession';

function setup() {
  const project = createDemoProject(); const ids = project.performers.slice(0,3).map(p=>p.id);
  ids.forEach((id,i)=>{project.sets[0].positions[id]={x:40+i*5,y:25};});
  const store = createEditorStore(project); markFileOpened(store,false);
  store.setValue('selection','selectedIds',ids);
  return {store,project:store.getState().project.present,ids};
}
describe('formation preview commands', () => {
  it.each<FormationKind>(['line','arc','circle','block','curve'])('%s previews remain unsaved and apply exactly once with undo/redo and file round trip', kind => {
    const {store,project,ids}=setup(); const before=serializeProject(project);
    expect(store.dispatch('formation.preview',{kind})).toBe(true);
    const session=store.getState().ui.formationPreview!;
    for (const width of [12,16,20]) store.dispatch('formation.update',{options:{...session.options,width,height:10}});
    const expected=currentFormationResult(store.getState())!.updates;
    expect(canEditPositions(store.getState())).toBe(false);
    expect(serializeProject(store.getState().project.present)).toBe(before); expect(hasUnsavedWork(store.getState())).toBe(false);
    expect(store.getState().project.past).toHaveLength(0);
    expect(store.dispatch('positions.move',{index:0,updates:{[ids[0]]:{x:1,y:1}}})).toBe(false);
    expect(store.dispatch('transform.preview',{})).toBe(false);
    expect(store.dispatch('formation.apply')).toBe(true);
    expect(store.getState().project.past).toHaveLength(1); expect(store.getState().project.past[0].name).toContain(`Apply ${kind} to 3 performers`);
    for (const id of ids) expect(store.getState().project.present.sets[0].positions[id]).toEqual(expected[id]);
    expect(store.getState().project.present.sets[1]).toBe(project.sets[1]); expect(store.getState().project.present.performers).toBe(project.performers);
    expect(store.getState().project.present.sets[0].positions[project.performers[4].id]).toBe(project.sets[0].positions[project.performers[4].id]);
    expect(parseProject(serializeProject(store.getState().project.present))).toEqual(store.getState().project.present);
    store.dispatch('history.undo'); expect(serializeProject(store.getState().project.present)).toBe(before); expect(hasUnsavedWork(store.getState())).toBe(false);
    store.dispatch('history.redo'); for (const id of ids) expect(store.getState().project.present.sets[0].positions[id]).toEqual(expected[id]);
  });
  it('retains independent shape parameters, cancels without history and rejects invalid, pending and unchanged previews', () => {
    const {store}=setup(); const history=store.getState().project;
    store.dispatch('formation.preview',{kind:'line'}); const line=store.getState().ui.formationPreview!.options;
    store.dispatch('formation.update',{options:{...line,width:12,rotation:15}});
    store.dispatch('formation.preview',{kind:'block'}); const block=store.getState().ui.formationPreview!.options;
    store.dispatch('formation.update',{options:{...block,width:30,columns:3}});
    store.dispatch('formation.preview',{kind:'line'}); expect(store.getState().ui.formationPreview!.options).toMatchObject({width:12,rotation:15});
    store.dispatch('formation.preview',{kind:'block'}); expect(store.getState().ui.formationPreview!.options).toMatchObject({width:30,columns:3});
    store.dispatch('formation.update',{options:{...block,width:200}}); expect(store.dispatch('formation.apply')).toBe(false);
    store.dispatch('formation.update',{options:{...block,width:20}}); store.setValue('ui','pendingDraft',true);
    expect(store.dispatch('formation.apply')).toBe(false); expect(store.dispatch('formation.preview',{kind:'line'})).toBe(false);
    expect(store.dispatch('formation.cancel')).toBe(true); expect(store.getState().project).toBe(history);
    expect(store.getState().ui.pendingDraft).toBe(true); // Never clears another field's draft.
    store.setValue('ui','pendingDraft',false);
    store.dispatch('formation.preview',{kind:'line'});
    store.dispatch('formation.update',{options:{...line,width:10,height:0}});
    expect(store.dispatch('formation.apply')).toBe(false); // Original 40,45,50 line.
    store.dispatch('formation.cancel'); expect(store.getState().project).toBe(history);
  });
  it('invalidates stale sessions synchronously on context changes and protects unrelated pending fields', () => {
    const changes: ((s:ReturnType<typeof setup>['store'])=>unknown)[] = [s=>s.dispatch('selection.clear'),s=>s.dispatch('set.select',{index:1}),s=>s.dispatch('playback.toggle'),s=>s.dispatch('playback.scrub',{count:1}),s=>s.setValue('ui','view','3d'),s=>s.setValue('ui','workspace','cast'),s=>s.dispatch('dialog.open',{dialog:'help'}),s=>s.dispatch('set.update',{index:0,update:{notes:'changed'}}),s=>s.beginTransaction('Other edit')];
    for (const change of changes) {
      const {store}=setup(); store.dispatch('formation.preview',{}); change(store);
      expect(store.getState().ui.formationPreview).toBeNull(); expect(store.dispatch('formation.apply')).toBe(false);
    }
    const {store}=setup(); store.setValue('ui','pendingDraft',true);
    expect(store.dispatch('formation.preview',{})).toBe(false); expect(store.getState().ui.pendingDraft).toBe(true);
  });
});
