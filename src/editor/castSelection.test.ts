import { describe, expect, it } from 'vitest';
import { createDemoProject, serializeProject } from '../domain';
import { filterCast, nextCastRow, selectCastRow, selectVisible } from './castSelection';
import { createEditorStore } from './store';

describe('shared Cast selection', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const modifiers = { shift: false, toggle: false };
  it('uses explicit replacement, additive toggles and stable visible-order ranges', () => {
    expect(selectCastRow(['hidden'], ids, 'b', null, modifiers)).toEqual(['b']);
    expect(selectCastRow(['hidden'], ids, 'b', null, { ...modifiers, toggle: true })).toEqual(['hidden', 'b']);
    expect(selectCastRow(['b', 'hidden'], ids, 'b', null, { ...modifiers, toggle: true })).toEqual(['hidden']);
    expect(selectCastRow(['hidden', 'd'], ids, 'b', 'd', { ...modifiers, shift: true })).toEqual(['hidden', 'd', 'b', 'c']);
    expect(selectCastRow(['hidden'], ids, 'c', 'filtered-out', { ...modifiers, shift: true })).toEqual(['hidden', 'c']);
    expect(selectCastRow(['hidden'], ids, 'removed', 'a', modifiers)).toEqual(['hidden']);
  });
  it('bulk selection only changes visible members and never duplicates IDs', () => {
    expect(selectVisible(['hidden', 'b'], ids, true)).toEqual(['hidden', 'b', 'a', 'c', 'd']);
    expect(selectVisible(['hidden', 'b', 'd'], ids, false)).toEqual(['hidden']);
    expect(selectVisible(['hidden'], [], false)).toEqual(['hidden']);
  });
  it('filters labels and names together with sections without mutating the shared selection', () => {
    const project = createDemoProject(); const first = project.performers[0];
    const performers = project.performers.map(p => p.id === first.id ? { ...p, name: 'Casey Jones' } : p);
    expect(filterCast(performers, '  CASEY  ', 'all').map(p => p.id)).toEqual([first.id]);
    expect(filterCast(performers, 'Casey', project.sections.find(s => s.id !== first.sectionId)!.id)).toEqual([]);
    expect(filterCast(performers, first.label, first.sectionId)).toContain(performers[0]);
  });
  it('navigates a maximum roster in constant keyboard steps without wrapping at edges', () => {
    const maximum = Array.from({ length: 500 }, (_, i) => `p${i}`);
    expect(nextCastRow(maximum, 'p0', 'End')).toBe('p499');
    expect(nextCastRow(maximum, 'p499', 'ArrowDown')).toBe('p499');
    expect(nextCastRow(maximum, 'p499', 'Home')).toBe('p0');
    expect(nextCastRow(maximum, 'p0', 'ArrowUp')).toBe('p0');
    expect(nextCastRow(maximum, 'p250', 'ArrowUp')).toBe('p249');
    expect(nextCastRow([], 'removed', 'Home')).toBeUndefined();
  });
  it('docking and expanding retain selection, filters, coordinates, saved state and history', () => {
    const project = createDemoProject(); const store = createEditorStore(project); const selected = project.performers.slice(0, 3).map(p => p.id);
    store.setValue('selection', 'selectedIds', selected); store.setValue('ui', 'castQuery', 'B');
    const before = store.getState().project; const file = store.getState().fileSession;
    for (const mode of ['panel', 'table', 'closed', 'panel'] as const) expect(store.dispatch('cast.show', { mode })).toBe(true);
    expect(store.getState().selection.selectedIds).toEqual(selected); expect(store.getState().ui.castQuery).toBe('B');
    expect(store.getState().ui).toMatchObject({ workspace: 'design', castPanelOpen: true });
    expect(store.getState().project).toBe(before); expect(store.getState().fileSession).toBe(file);
  });
  it.each(['draft', 'dialog', 'transaction', 'formation', 'transform'])('does not unmount a pending %s session', mode => {
    const store = createEditorStore(createDemoProject()); store.setValue('selection', 'selectedIds', [store.getState().project.present.performers[0].id]);
    if (mode === 'draft') store.setValue('ui', 'pendingDraft', true);
    if (mode === 'dialog') store.dispatch('dialog.open', { dialog: 'preferences' });
    if (mode === 'transaction') store.beginTransaction('Unfinished edit');
    if (mode === 'formation') store.dispatch('formation.preview', {});
    if (mode === 'transform') store.dispatch('transform.preview', {});
    expect(store.dispatch('cast.show', { mode: 'table' })).toBe(false);
    expect(store.getState().ui.workspace).toBe('design');
  });
  it('text/section commands preserve all set positions and identity, with one undo per commit', () => {
    const project = createDemoProject(); const store = createEditorStore(project); const person = project.performers[0];
    const geometry = project.sets.map(set => set.positions); const section = project.sections.find(s => s.id !== person.sectionId)!;
    store.setValue('selection', 'selectedIds', [person.id]);
    store.dispatch('performer.update', { id: person.id, update: { name: 'Casey Jones' } });
    expect(store.getState().project.past).toHaveLength(1); expect(store.getState().project.past[0].name).toBe(`Rename ${person.label}`);
    store.dispatch('performer.update', { id: person.id, update: { sectionId: section.id } });
    expect(store.getState().project.past).toHaveLength(2);
    expect(store.getState().project.present.sets.map(set => set.positions)).toEqual(geometry);
    expect(store.getState().project.present.performers[0]).toMatchObject({ id: person.id, label: person.label, sectionId: section.id });
    store.dispatch('history.undo'); store.dispatch('history.undo'); expect(serializeProject(store.getState().project.present)).toBe(serializeProject(project));
    store.dispatch('performers.remove', { ids: [person.id] }); expect(store.getState().selection.selectedIds).toEqual([]);
    expect(store.getState().project.present.sets.every(set => !set.positions[person.id])).toBe(true);
    store.dispatch('history.undo'); expect(store.getState().project.present.performers[0]).toEqual(person);
  });
  it('opening a different production clears stale filters and removed selections', () => {
    const project = createDemoProject(); const store = createEditorStore(project);
    store.setValue('ui', 'castQuery', 'missing'); store.setValue('ui', 'sectionFilter', 'old-section'); store.setValue('selection', 'selectedIds', [project.performers[0].id]);
    store.dispatch('project.load', { project });
    expect(store.getState().ui).toMatchObject({ castQuery: '', sectionFilter: 'all' }); expect(store.getState().selection.selectedIds).toEqual([]);
  });
});
