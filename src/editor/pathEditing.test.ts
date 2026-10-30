import { describe, expect, it } from 'vitest';
import { createDemoProject, parseProject, sampleProject, serializeProject } from '../domain';
import { createEditorStore } from './store';
import { editMovementPath, type PathEdit } from './pathEditing';
import { splitTransition } from './splitTransition';
import { moveSetTo, updateSetProperties } from './projectEdits';
import { commandRegistry } from './commands';

function setup() {
  const project = createDemoProject(), store = createEditorStore(project);
  const id = project.performers[0].id;
  store.dispatch('set.select', { index: 1 }); store.setValue('selection', 'selectedIds', [id]);
  const edit: PathEdit = { moveId: project.moves[0].id, performerId: id, controls: { control1: { x: 30, y: 20 }, control2: { x: 40, y: 30 } }, revision: store.getState().project.revision, epoch: store.getState().ui.projectEpoch };
  return { project, store, edit, id };
}

describe('reviewed path transactions', () => {
  it('requires one explicitly selected performer at an arrival and rejects stale revisions, sessions and move targets', () => {
    const { store, edit } = setup();
    expect(commandRegistry['path.open'].enabled(store.getState(), undefined)).toBe(true);
    for (const update of [{ revision: -1 }, { epoch: -1 }, { moveId: 'missing' }, { performerId: 'missing' }]) expect(store.dispatch('path.save', { ...edit, ...update })).toBe(false);
    store.setValue('selection', 'selectedIds', []); expect(store.dispatch('path.open')).toBe(false);
    store.setValue('selection', 'selectedIds', ['a', 'b']); expect(store.dispatch('path.open')).toBe(false);
    expect(store.getState().project.past).toHaveLength(0);
  });
  it('creates and edits a stable segment in one named undo action, preserving other performers and all picture positions', () => {
    const { project, store, edit, id } = setup();
    expect(store.dispatch('path.open')).toBe(true);
    expect(store.dispatch('path.save', edit)).toBe(true);
    const saved = store.getState().project.present, segmentId = saved.moves[0].paths[id].segments[0].id;
    expect(saved.sets).toEqual(project.sets); expect(saved.moves.slice(1)).toEqual(project.moves.slice(1));
    expect(store.getState().project.past).toHaveLength(1);
    expect(parseProject(serializeProject(saved))).toEqual(saved);
    expect(store.dispatch('history.undo')).toBe(true); expect(store.getState().project.present).toEqual(project);
    expect(store.dispatch('history.redo')).toBe(true); expect(store.getState().project.present).toEqual(saved);
    const revision = store.getState().project.revision;
    expect(store.dispatch('path.save', { ...edit, revision, controls: { ...edit.controls!, control2: { x: 50, y: 30 } } })).toBe(true);
    expect(store.getState().project.present.moves[0].paths[id].segments[0].id).toBe(segmentId);
  });
  it('never partially commits invalid geometry and restores straight motion when explicitly removed', () => {
    const { project, store, edit, id } = setup();
    expect(store.dispatch('path.save', { ...edit, controls: { ...edit.controls!, control1: { x: 101, y: 0 } } })).toBe(false);
    expect(store.getState().project.present).toEqual(project);
    expect(store.getState().project.past).toHaveLength(0);
    expect(store.dispatch('path.save', edit)).toBe(true);
    expect(store.dispatch('path.save', { ...edit, revision: store.getState().project.revision, controls: null })).toBe(true);
    const removed = store.getState().project.present;
    expect(removed.moves[0].paths[id]).toBeUndefined();
    for (const count of [0, 8, 16, 24, 32]) expect(sampleProject(removed, count)).toEqual(sampleProject(project, count));
    expect(JSON.parse(serializeProject(removed)).schemaVersion).toBe(2);
  });
  it('retains controls and segment identity when whole-move counts resize, and prevents unsupported split/rewire operations', () => {
    const { project, edit, id } = setup();
    const p = editMovementPath(project, edit), segment = p.moves[0].paths[id].segments[0];
    const resized = updateSetProperties(p, 1, { counts: 64 });
    expect(resized.moves[0].paths[id].segments[0]).toEqual({ ...segment, endCount: 64 });
    expect(() => splitTransition(p, { moveId: edit.moveId, count: 8 })).toThrow(/Remove curved/);
    expect(() => moveSetTo(p, p.sets[2].id, 1)).toThrow(/curved move/);
    expect(p.sets).toEqual(project.sets);
  });
});
