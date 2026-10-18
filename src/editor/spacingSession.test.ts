import { describe, expect, it } from 'vitest';
import { createDemoProject, parseProject, serializeProject } from '../domain';
import { currentSpacingResult } from './spacingSession';
import { createEditorStore } from './store';
import { canEditPositions } from './editMode';
import { hasUnsavedWork, markFileOpened } from './fileSession';
import type { SpacingOptions } from '../spacing';

function setup() {
  const project=createDemoProject(); const ids=project.performers.slice(0,3).map(p=>p.id);
  ids.forEach((id,i)=>project.sets[0].positions[id]={x:[20,23,40][i],y:20+i});
  const store=createEditorStore(project); markFileOpened(store,false); store.setValue('selection','selectedIds',ids);
  const update=(patch:Partial<SpacingOptions>)=>store.dispatch('spacing.update',{options:{...store.getState().ui.spacingPreview!.options,...patch}});
  return {store,project,ids,update};
}
describe('spacing preview commands', () => {
  it('previews without dirtying or serializing session data; Apply is one reversible, named, selected-set edit', () => {
    const {store,project,ids,update}=setup(); const before=serializeProject(project);
    expect(store.dispatch('spacing.preview')).toBe(true); expect(canEditPositions(store.getState())).toBe(false);
    for(const interval of [2,3,4]) update({operation:'interval',angle:0,unit:'yards',interval});
    expect(store.getState().project.past).toHaveLength(0); expect(hasUnsavedWork(store.getState())).toBe(false);
    expect(serializeProject(store.getState().project.present)).toBe(before);
    const result=currentSpacingResult(store.getState())!;
    expect(result.positions[ids[1]].x).toBe(30);
    expect(store.dispatch('spacing.apply')).toBe(true); const applied=store.getState().project.present;
    expect(applied.sets[0].positions).toEqual(result.positions); expect(applied.sets.slice(1)).toEqual(project.sets.slice(1));
    expect(applied.performers).toEqual(project.performers); expect(applied.moves).toEqual(project.moves);
    expect(store.getState().project.past).toHaveLength(1); expect(store.getState().project.past[0].name).toContain('Space at 4 yards 3 performers');
    expect(store.getState().ui.spacingPreview).toBeNull(); expect(hasUnsavedWork(store.getState())).toBe(true);
    expect(parseProject(serializeProject(applied))).toEqual(applied);
    store.dispatch('history.undo'); expect(serializeProject(store.getState().project.present)).toBe(before); expect(hasUnsavedWork(store.getState())).toBe(false);
    store.dispatch('history.redo'); expect(store.getState().project.present).toEqual(applied);
  });
  it('rejects no-op, boundary and pending-input applications and cancels without an undo entry', () => {
    const {store,update}=setup(); const before=store.getState().project;
    expect(store.dispatch('spacing.apply')).toBe(false); store.dispatch('spacing.preview');
    update({operation:'interval',interval:1000}); expect(store.dispatch('spacing.apply')).toBe(false);
    update({operation:'align'}); store.setValue('ui','pendingDraft',true); expect(store.dispatch('spacing.apply')).toBe(false);
    expect(store.dispatch('spacing.cancel')).toBe(true); expect(store.getState().project).toBe(before);
    store.setValue('ui','pendingDraft',false); store.dispatch('spacing.preview'); update({operation:'distribute',angle:90});
    expect(currentSpacingResult(store.getState())?.changed).toBe(false); expect(store.dispatch('spacing.apply')).toBe(false);
  });
  it('requires an explicit selection of at least two and excludes competing edits', () => {
    const {store,ids}=setup();
    for(const selection of [[],[ids[0]]]) {store.setValue('selection','selectedIds',selection); expect(store.dispatch('spacing.preview')).toBe(false);}
    store.setValue('selection','selectedIds',ids); store.dispatch('spacing.preview');
    expect(store.dispatch('formation.preview',{})).toBe(false); expect(store.dispatch('transform.preview',{})).toBe(false);
    expect(store.dispatch('selection.nudge',{key:'ArrowLeft'})).toBe(false);
    expect(store.dispatch('positions.place',{index:0,id:ids[0],axis:'x',value:30})).toBe(false);
    expect(store.dispatch('cast.show',{mode:'panel'})).toBe(false);
    expect(store.dispatch('snapping.update',{settings:{steps:6,subdivision:1,target:'grid',group:'anchor'}})).toBe(false);
    store.dispatch('spacing.cancel'); store.dispatch('transform.preview',{}); expect(store.dispatch('spacing.preview')).toBe(false);
  });
  it('invalidates synchronously on every context change instead of applying stale membership or geometry', () => {
    const changes: ((store:ReturnType<typeof setup>['store'])=>unknown)[]=[
      s=>s.dispatch('selection.clear'),s=>s.dispatch('set.select',{index:1}),s=>s.dispatch('playback.toggle'),s=>s.dispatch('playback.scrub',{count:1}),
      s=>s.setValue('ui','view','3d'),s=>s.setValue('ui','workspace','cast'),s=>s.dispatch('dialog.open',{dialog:'help'}),
      s=>s.dispatch('set.update',{index:0,update:{notes:'new'}}),s=>s.beginTransaction('Other change'),s=>s.dispatch('project.load',{project:createDemoProject()}),
    ];
    for(const change of changes) {const {store}=setup();store.dispatch('spacing.preview');change(store);expect(store.getState().ui.spacingPreview).toBeNull();expect(store.dispatch('spacing.apply')).toBe(false);}
  });
  it('keeps the physical preview when display orientation changes and names align/distribute distinctly', () => {
    for(const operation of ['align','distribute'] as const) {
      const {store,update}=setup();store.dispatch('spacing.preview');update({operation,angle:0});
      const before=currentSpacingResult(store.getState()); store.setValue('preferences','value',{...store.getState().preferences.value,fieldOrientation:'audience-top'});
      expect(currentSpacingResult(store.getState())).toEqual(before); expect(store.dispatch('spacing.apply')).toBe(true);
      expect(store.getState().project.past[0].name).toMatch(operation==='align'?/^Align 3/:/^Distribute 3/);
    }
  });
});
