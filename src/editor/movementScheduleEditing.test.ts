import { describe, expect, it } from 'vitest';
import wire from '../../format/examples/scheduled-v6.squid?raw';
import { createDemoProject, parseProject, serializeProject } from '../domain';
import { commandRegistry } from './commands';
import { createEditorStore } from './store';
import { editMovementSchedule, pathFromRows, scheduleRows } from './movementScheduleEditing';
import { splitTransition } from './splitTransition';
import { moveSetTo, updateSetProperties } from './projectEdits';
import type { ScheduleEdit } from './movementScheduleEditing';

function setup() {
  const p = parseProject(wire), store = createEditorStore(p);
  store.dispatch('set.select', { index: 1 }); store.setValue('selection', 'selectedIds', ['a']);
  const request: ScheduleEdit = { moveId: p.moves[0].id, performerId: 'a', path: structuredClone(p.moves[0].paths.a), revision: store.getState().project.revision, epoch: store.getState().ui.projectEpoch };
  return { p, store, request };
}
describe('reviewed movement schedules', () => {
  it('preserves interval identities and geometry through rows and rejects incomplete drafts', () => {
    const { p } = setup(), rows = scheduleRows(p, 0, 'a');
    expect(pathFromRows(rows)).toEqual(p.moves[0].paths.a);
    rows[0].start = ''; expect(() => pathFromRows(rows)).toThrow(/finite number/);
    expect(pathFromRows([])).toBeNull();
  });
  it('applies one named undo transaction without changing another performer, pictures or musical timing', () => {
    const { p, store, request } = setup(); request.path!.segments[0].startCount = 3;
    expect(store.dispatch('schedule.open')).toBe(true); expect(store.dispatch('schedule.save', request)).toBe(true);
    const changed = store.getState().project.present;
    expect(changed.sets).toEqual(p.sets); expect(changed.moves[0].paths.b).toEqual(p.moves[0].paths.b); expect(changed.tempoMap).toEqual(p.tempoMap);
    expect(changed.moves[0].paths.a.segments.map(s => s.id)).toEqual(p.moves[0].paths.a.segments.map(s => s.id));
    expect(store.getState().project.past).toHaveLength(1); expect(parseProject(serializeProject(changed))).toEqual(changed);
    request.path!.segments[0].startCount = 4; expect(changed.moves[0].paths.a.segments[0].startCount).toBe(3);
    store.dispatch('history.undo'); expect(store.getState().project.present).toEqual(p);
    store.dispatch('history.redo'); expect(store.getState().project.present).toEqual(changed);
  });
  it('rejects stale context and invalid intervals atomically; simple curve editing cannot erase a schedule', () => {
    const { p, store, request } = setup();
    for (const update of [{ revision: -1 }, { epoch: -1 }, { moveId: 'missing' }, { performerId: 'b' }]) expect(store.dispatch('schedule.save', { ...request, ...update })).toBe(false);
    request.path!.segments[1].startCount = 5; expect(store.dispatch('schedule.save', request)).toBe(false);
    expect(store.getState().project.present).toEqual(p); expect(store.getState().project.past).toHaveLength(0);
    expect(store.dispatch('path.save', { ...request, controls: null })).toBe(false);
    expect(store.dispatch('path.open')).toBe(true); expect(store.getState().ui.dialog).toBe('movement-schedule');
    store.setValue('ui', 'dialog', null); store.setValue('selection', 'selectedIds', []); expect(store.dispatch('schedule.open')).toBe(false);
    store.setValue('selection', 'selectedIds', ['a','b']); expect(commandRegistry['schedule.open'].enabled(store.getState(), undefined)).toBe(false);
  });
  it('supports interval rescaling while guarding split/rewire and allowing tempo edits and removal', () => {
    const { p, store, request } = setup();
    expect(updateSetProperties(p, 1, { counts: 20 }).moves[0].paths.a.segments[0].startCount).toBe(2.5);
    expect(() => splitTransition(p, { moveId: request.moveId, count: 8 })).toThrow(/custom paths/);
    expect(() => moveSetTo(p, p.sets[2].id, 1)).toThrow(/detailed move/);
    expect(updateSetProperties(p, 1, { tempo: 144 }).moves[0].paths).toEqual(p.moves[0].paths);
    expect(store.dispatch('schedule.save', { ...request, path: null })).toBe(true);
    const changed = store.getState().project.present; expect(changed.moves[0].paths.a).toBeUndefined(); expect(changed.moves[0].paths.b).toEqual(p.moves[0].paths.b);
    const plain = editMovementSchedule(changed, { ...request, performerId: 'b', path: null }); expect(JSON.parse(serializeProject(plain)).schemaVersion).toBe(3);
    expect(scheduleRows(createDemoProject(), 0, 'performer-0-1')).toHaveLength(1);
  });
});
