import { describe, expect, it } from 'vitest';
import { createDemoProject, parseProject, serializeProject } from '../domain';
import { DEFAULT_SNAPPING } from '../snapping';
import { createEditorStore } from './store';

function fixture() {
  const project = createDemoProject(); const ids = project.performers.slice(0, 2).map(p => p.id);
  project.sets[0].positions[ids[0]] = { x: 10.1, y: 20.2 }; project.sets[0].positions[ids[1]] = { x: 12.7, y: 21.1 };
  const store = createEditorStore(project);
  return { project: store.getState().project.present, ids, store };
}
describe('show placement commands and compatibility', () => {
  it('rules round-trip, create one undo entry, and never move performers or change device defaults', () => {
    const { project, store } = fixture(); const settings = { steps: 12 as const, subdivision: 4 as const, target: 'markings' as const, group: 'individual' as const };
    store.dispatch('snapping.update', { settings });
    const state = store.getState(); expect(state.project.past).toHaveLength(1); expect(state.project.past[0].name).toBe('Change grid and snapping');
    expect(state.project.present.sets).toBe(project.sets); expect(state.preferences.value.snapDefaults).toEqual(DEFAULT_SNAPPING);
    const reopened = parseProject(serializeProject(state.project.present)); expect(reopened.snapping).toEqual(settings); expect(reopened.sets).toEqual(project.sets);
    store.dispatch('history.undo'); expect(store.getState().project.present).toEqual(project);
    store.dispatch('history.redo'); expect(store.getState().project.present.snapping).toEqual(settings);
    expect(parseProject(serializeProject(project))).not.toHaveProperty('snapping');
  });
  it('numeric placement and translated selection use the configured targets, preserve identity and undo exactly', () => {
    const { project, ids, store } = fixture();
    store.dispatch('snapping.update', { settings: { ...DEFAULT_SNAPPING, group: 'individual' } });
    store.dispatch('selection.transform', { index: 0, ids, options: { dx: .16 } });
    const moved = store.getState().project.present;
    expect(moved.sets[0].positions[ids[0]]).toEqual({ x: 10.625, y: 20.2 });
    expect(moved.sets[0].positions[ids[1]]).toEqual({ x: 13.125, y: 21.1 });
    expect(moved.performers).toBe(project.performers); expect(moved.sets[1]).toBe(project.sets[1]);
    store.dispatch('history.undo'); expect(store.getState().project.present.sets).toEqual(project.sets);
    store.dispatch('positions.place', { index: 0, id: ids[0], axis: 'x', value: 10.26 });
    expect(store.getState().project.present.sets[0].positions[ids[0]]).toEqual({ x: 10, y: 20.2 });
    store.dispatch('history.undo'); expect(store.getState().project.present.sets).toEqual(project.sets);
    store.setValue('ui', 'snap', false);
    store.dispatch('positions.place', { index: 0, id: ids[0], axis: 'x', value: 10.26 });
    expect(store.getState().project.present.sets[0].positions[ids[0]]).toEqual({ x: 10.26, y: 20.2 });
  });
  it('invalid rules/coordinates cannot mutate the project; read-only previews disable placement', () => {
    const { store, ids } = fixture(); const before = store.getState().project;
    expect(store.dispatch('snapping.update', { settings: { ...DEFAULT_SNAPPING, steps: 7 as 8 } })).toBe(false);
    expect(store.dispatch('positions.place', { index: 0, id: ids[0], axis: 'x', value: Infinity })).toBe(false);
    expect(store.getState().project).toBe(before);
    store.setValue('playback', 'playing', true);
    expect(store.dispatch('positions.place', { index: 0, id: ids[0], axis: 'x', value: 20 })).toBe(false);
  });
});
