import { describe, expect, it } from 'vitest';
import { createDemoProject, serializeProject } from '../domain';
import { currentTransformResult } from './transformSession';
import { createEditorStore } from './store';
import { canEditPositions } from './editMode';
import { hasUnsavedWork, markFileOpened } from './fileSession';

function setup() {
  const project = createDemoProject(); const [a,b] = project.performers;
  project.sets[0].positions[a.id] = {x:30,y:20}; project.sets[0].positions[b.id] = {x:36,y:20};
  const store = createEditorStore(project); markFileOpened(store,false);
  store.setValue('selection','selectedIds',[a.id,b.id]);
  return {store,project,a:a.id,b:b.id};
}
describe('transform preview session commands', () => {
  it('previews without editing history, save state or exported project; apply makes one reversible edit', () => {
    const {store,project,a,b} = setup(); const before=serializeProject(project);
    expect(store.dispatch('transform.preview',{})).toBe(true);
    const session=store.getState().ui.transformPreview!;
    for (const angle of [10,20,90]) store.dispatch('transform.update',{options:{...session.options,angle}});
    expect(canEditPositions(store.getState())).toBe(false);
    expect(serializeProject(store.getState().project.present)).toBe(before); expect(store.getState().project.past).toHaveLength(0); expect(hasUnsavedWork(store.getState())).toBe(false);
    expect(currentTransformResult(store.getState())?.updates[a]).toEqual({x:33,y:17});
    expect(store.dispatch('selection.transform',{index:0,ids:[a,b],options:{dx:1}})).toBe(false);
    expect(store.dispatch('transform.apply')).toBe(true); expect(store.getState().project.past).toHaveLength(1);
    expect(store.getState().project.past[0].name).toContain('Rotate/scale 2 performers');
    expect(store.getState().project.present.sets[0].positions[b]).toEqual({x:33,y:23}); expect(store.getState().project.present.sets[1]).toEqual(project.sets[1]);
    expect(store.getState().ui.transformPreview).toBeNull(); expect(hasUnsavedWork(store.getState())).toBe(true);
    store.dispatch('history.undo'); expect(serializeProject(store.getState().project.present)).toBe(before); expect(hasUnsavedWork(store.getState())).toBe(false);
    store.dispatch('history.redo'); expect(store.getState().project.present.sets[0].positions[a]).toEqual({x:33,y:17});
  });
  it('cancels, rejects invalid/no-op parameters and never commits stale values while input is pending', () => {
    const {store}=setup(); const history=store.getState().project;
    expect(store.dispatch('transform.apply')).toBe(false);
    store.dispatch('transform.preview',{}); expect(store.dispatch('transform.apply')).toBe(false);
    const session=store.getState().ui.transformPreview!;
    for (const scale of [0,-1,Infinity,100]) { store.dispatch('transform.update',{options:{...session.options,scale}}); expect(store.dispatch('transform.apply')).toBe(false); }
    store.dispatch('transform.update',{options:{...session.options,angle:45}}); store.setValue('ui','pendingDraft',true);
    expect(store.dispatch('transform.apply')).toBe(false); expect(store.getState().project).toBe(history);
    expect(store.dispatch('transform.cancel')).toBe(true); expect(store.getState().ui.pendingDraft).toBe(true); expect(store.getState().project).toBe(history);
    expect(store.dispatch('transform.preview',{})).toBe(false);
    store.setValue('ui','pendingDraft',false); store.dispatch('dialog.open',{dialog:'help'}); expect(store.dispatch('transform.preview',{})).toBe(false);
  });
  it('invalidates synchronously when selection, set, playback, view, workspace, dialog or revision changes', () => {
    const changes: ((s:ReturnType<typeof setup>['store'])=>unknown)[] = [s=>s.dispatch('selection.clear'), s=>s.dispatch('set.select',{index:1}), s=>s.dispatch('playback.toggle'), s=>s.dispatch('playback.scrub',{count:1}), s=>s.setValue('ui','view','3d'), s=>s.setValue('ui','workspace','cast'), s=>s.dispatch('dialog.open',{dialog:'help'}), s=>s.dispatch('set.update',{index:0,update:{notes:'changed'}}), s=>s.beginTransaction('Other edit')];
    for (const change of changes) {
      const {store}=setup(); store.dispatch('transform.preview',{}); change(store);
      expect(store.getState().ui.transformPreview).toBeNull(); expect(store.dispatch('transform.apply')).toBe(false);
    }
  });
  it('supports field mirrors and singleton non-origin pivots without changing unselected performers', () => {
    const {store,project,a,b}=setup(); store.setValue('selection','selectedIds',[a]);
    store.dispatch('transform.preview',{operation:'across-50'}); expect(store.dispatch('transform.apply')).toBe(true);
    expect(store.getState().project.present.sets[0].positions[a]).toEqual({x:70,y:20}); expect(store.getState().project.present.sets[0].positions[b]).toEqual(project.sets[0].positions[b]);
    store.dispatch('history.undo'); store.dispatch('transform.preview',{});
    const session=store.getState().ui.transformPreview!; store.dispatch('transform.update',{options:{...session.options,angle:90,pivot:{kind:'custom',point:{x:20,y:20}}}});
    expect(store.dispatch('transform.apply')).toBe(true); expect(store.getState().project.present.sets[0].positions[a]).toEqual({x:20,y:30});
  });
});
