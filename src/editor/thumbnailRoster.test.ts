import { describe, expect, it } from 'vitest';
import { createBlankProject, createDemoProject } from '../domain';
import { createEditorStore } from './store';
import { createThumbnailRosterSelector, sectionIsSelected, sectionMemberships } from './thumbnailRoster';
import { selectionMembership } from '../selection';
describe('immutable thumbnail and selection inputs', () => {
  it('retains dot inputs across geometry, timing, names and unused color changes', () => {
    const store = createEditorStore(createDemoProject()); const select = createThumbnailRosterSelector();
    const snapshot = () => { const project = store.getState().project.present; return select(project.performers, project.sections); };
    const before = snapshot(); const project = store.getState().project.present; const id = project.performers[0].id;
    store.dispatch('positions.move', { index: 0, updates: { [id]: { x: 12, y: 20 } } }); expect(snapshot()).toBe(before);
    store.dispatch('set.update', { index: 1, update: { counts: 64 } }); expect(snapshot()).toBe(before);
    store.dispatch('performer.update', { id, update: { name: 'Renamed' } }); expect(snapshot()).toBe(before);
    store.dispatch('section.update', { id: project.sections[0].id, update: { name: 'Renamed section' } }); expect(snapshot()).toBe(before);
    store.dispatch('section.add'); const unused = store.getState().project.present.sections.at(-1)!; expect(snapshot()).toBe(before);
    store.dispatch('section.update', { id: unused.id, update: { color: '#112233' } }); expect(snapshot()).toBe(before);
  });
  it('invalidates visible colors, roster identities and order, including undo', () => {
    const store = createEditorStore(createDemoProject()); const select = createThumbnailRosterSelector();
    const snapshot = () => { const p = store.getState().project.present; return select(p.performers, p.sections); };
    const before = snapshot(); const p = store.getState().project.present; const id = p.performers[0].id;
    store.dispatch('section.update', { id: p.sections[0].id, update: { color: '#112233' } });
    expect(snapshot()).not.toBe(before); expect(snapshot()[0]).toMatchObject({ id, color: '#112233' });
    store.dispatch('performer.update', { id, update: { sectionId: p.sections[1].id } });
    expect(snapshot()[0].color).toBe(p.sections[1].color);
    store.dispatch('performers.remove', { ids: [id] }); expect(snapshot()).toHaveLength(63);
    store.dispatch('history.undo'); expect(snapshot()).toHaveLength(64); expect(snapshot()[0].id).toBe(id);
    const current = store.getState().project.present; const reordered = select([...current.performers].reverse(), current.sections);
    expect(reordered[0].id).toBe(current.performers.at(-1)!.id);
  });
  it('preserves inputs for a same-color assignment and allows an empty roster', () => {
    const p = createDemoProject(); const select = createThumbnailRosterSelector();
    const colors = p.sections.map(s => ({ ...s, color: '#112233' })); const before = select(p.performers, colors);
    const reassigned = p.performers.map((performer, i) => i === 0 ? { ...performer, sectionId: p.sections[1].id } : performer);
    expect(select(reassigned, colors)).toBe(before);
    const empty = createBlankProject(); expect(select(empty.performers, empty.sections)).toEqual([]);
  });
  it('shares membership for an immutable selection and refreshes on removal or a new selection', () => {
    const store = createEditorStore(createDemoProject()); const id = store.getState().project.present.performers[0].id;
    store.setValue('selection', 'selectedIds', [id]); const ids = store.getState().selection.selectedIds; const membership = selectionMembership(ids);
    store.setValue('playback', 'count', 1); expect(selectionMembership(store.getState().selection.selectedIds)).toBe(membership);
    expect(membership.has(id)).toBe(true);
    store.dispatch('performers.remove', { ids }); const next = selectionMembership(store.getState().selection.selectedIds); expect(next).not.toBe(membership); expect(next.size).toBe(0);
    store.dispatch('history.undo'); expect(selectionMembership(store.getState().selection.selectedIds).size).toBe(0);
    store.setValue('selection', 'selectedIds', [id]); expect(selectionMembership(store.getState().selection.selectedIds).has(id)).toBe(true);
  });
  it('groups sections correctly without marking an empty or partial section selected', () => {
    const p = createDemoProject(); const groups = sectionMemberships(p.performers, [...p.sections, { id: 'empty', name: 'Empty', color: '#ffffff' }]);
    const first = groups.get(p.sections[0].id)!;
    expect(first).toEqual(p.performers.filter(person => person.sectionId === p.sections[0].id).map(person => person.id));
    expect(sectionIsSelected(first, selectionMembership(first))).toBe(true);
    expect(sectionIsSelected(first, selectionMembership(first.slice(1)))).toBe(false);
    expect(sectionIsSelected(groups.get('empty')!, selectionMembership(first))).toBe(false);
  });
});

