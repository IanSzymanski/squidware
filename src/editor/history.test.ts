import { describe, expect, it, vi } from 'vitest';
import { createDemoProject, createBlankProject, validateProject } from '../domain';
import { createPerformanceFixture } from '../performanceFixtures';
import { applyProjectPatches, HISTORY_LIMITS, projectPatches, retainHistory } from './history';
import type { HistoryEntry } from './history';
import { createEditorStore } from './store';

describe('reversible named history', () => {
  it('stores a changed coordinate leaf instead of an entire project snapshot', () => {
    const before = createPerformanceFixture('maximum');
    const id = before.performers[0].id;
    const after = { ...before, sets: before.sets.map((set, index) => index === 1 ? { ...set, positions: { ...set.positions, [id]: { ...set.positions[id], x: 42 } } } : set) };
    const patches = projectPatches(before, after);
    expect(patches).toHaveLength(1);
    expect(patches[0].path).toEqual(['sets', 1, 'positions', id, 'x']);
    const undone = applyProjectPatches(after, patches, 'undo');
    expect(undone).toEqual(before);
    expect(undone.sets[0]).toBe(before.sets[0]);
    expect(undone.sets[1].positions[before.performers[1].id]).toBe(before.sets[1].positions[before.performers[1].id]);
    expect(applyProjectPatches(undone, patches, 'redo')).toEqual(after);
  });

  it('detects equal copied geometry and metadata as no-ops without JSON serialization', () => {
    const store = createEditorStore(createDemoProject());
    const before = store.getState().project;
    const id = before.present.performers[0].id;
    const stringify = vi.spyOn(JSON, 'stringify');
    try {
      store.dispatch('project.update', { title: before.present.title });
      store.dispatch('positions.move', { index: 0, updates: { [id]: { ...before.present.sets[0].positions[id] } } });
      store.dispatch('selection.transform', { index: 0, ids: [id], options: { dx: 0, dy: 0 } });
      expect(stringify).not.toHaveBeenCalled();
      expect(store.getState().project).toBe(before);
    } finally { stringify.mockRestore(); }
  });

  it('reverses a maximum-size formation and all-roster removal while keeping unrelated pictures shared', () => {
    const store = createEditorStore(createPerformanceFixture('maximum'));
    store.dispatch('set.select', { index: 1 });
    const before = store.getState().project.present;
    store.dispatch('selection.all');
    store.dispatch('formation.preview', { kind: 'circle' });
    store.dispatch('formation.update', { options: { center: { x: 50, y: 25 }, width: 60, height: 40, rotation: 0, columns: 20 } });
    expect(store.dispatch('formation.apply')).toBe(true);
    const formed = store.getState().project.present;
    store.dispatch('history.undo');
    expect(store.getState().project.present).toEqual(before);
    expect(store.getState().project.present.sets[0]).toBe(before.sets[0]);
    store.dispatch('history.redo'); expect(store.getState().project.present).toEqual(formed);
    store.dispatch('performers.remove', { ids: formed.performers.map(p => p.id) });
    expect(store.getState().project.present.performers).toEqual([]);
    expect(store.getState().project.past.at(-1)!.patches.length).toBeLessThan(500);
    store.dispatch('history.undo'); expect(store.getState().project.present).toEqual(formed);
    store.dispatch('history.redo'); expect(store.getState().project.present.performers).toEqual([]);
    expect(validateProject(store.getState().project.present)).toEqual(store.getState().project.present);
  });

  it('names movement and metadata actions with their affected picture or performer', () => {
    const store = createEditorStore(createDemoProject());
    const id = store.getState().project.present.performers[0].id;
    store.dispatch('positions.move', { index: 0, updates: { [id]: { x: 10, y: 10 } } });
    expect(store.getState().project.past.at(-1)?.name).toContain('Move B1 — Set 1');
    store.dispatch('performer.update', { id, update: { name: 'Ada' } });
    expect(store.getState().project.past.at(-1)?.name).toBe('Rename B1');
    store.dispatch('set.update', { index: 0, update: { notes: 'N'.repeat(40) } });
    expect(store.getState().project.past.at(-1)?.name).toContain('Edit notes — Set 1');
  });

  it('groups repeated note and color updates into one named commit', () => {
    const store = createEditorStore(createDemoProject());
    const before = store.getState().project.present;
    const listener = vi.fn(); store.subscribe(listener);
    store.transact('Edit rehearsal notes and Brass color', () => {
      for (let length = 1; length <= 40; length++) store.dispatch('set.update', { index: 0, update: { notes: 'N'.repeat(length) } });
      for (const color of ['#112233', '#445566', '#778899']) store.dispatch('section.update', { id: 'brass', update: { color } });
    });
    const history = store.getState().project;
    expect(history.past).toHaveLength(1);
    expect(history.past[0].name).toBe('Edit rehearsal notes and Brass color');
    expect(history.past[0].patches).toHaveLength(2);
    expect(listener).toHaveBeenCalledTimes(1);
    store.dispatch('history.undo'); expect(store.getState().project.present).toEqual(before);
    store.dispatch('history.redo'); expect(store.getState().project.present).toEqual(history.present);
    expect(validateProject(history.present)).toEqual(history.present);
  });

  it('cancels a gesture and restores project, selection, playback and the redo branch', () => {
    const store = createEditorStore(createDemoProject());
    store.dispatch('project.update', { title: 'Edited' }); store.dispatch('history.undo');
    const before = store.getState();
    store.beginTransaction('Drag B1');
    const id = before.project.present.performers[0].id;
    store.dispatch('selection.all');
    store.dispatch('positions.move', { index: 0, updates: { [id]: { x: 12, y: 12 } } });
    expect(store.dispatch('history.undo')).toBe(false);
    store.cancelTransaction();
    expect(store.getState().project).toBe(before.project);
    expect(store.getState().selection).toBe(before.selection);
    expect(store.getState().playback).toBe(before.playback);
    expect(store.getState().project.future).toHaveLength(1);
  });

  it('treats a transaction that returns to its starting values as a no-op and retains redo', () => {
    const store = createEditorStore(createDemoProject());
    store.dispatch('project.update', { title: 'Other' }); store.dispatch('history.undo');
    const before = store.getState().project;
    store.transact('Color session', () => {
      store.dispatch('section.update', { id: 'brass', update: { color: '#ffffff' } });
      store.dispatch('section.update', { id: 'brass', update: { color: before.present.sections[0].color } });
    });
    expect(store.getState().project).toBe(before);
  });

  it('rolls back a failed transaction without retaining a partial action', () => {
    const store = createEditorStore(createDemoProject());
    const before = store.getState().project;
    expect(() => store.transact('Invalid batch', () => {
      store.dispatch('project.update', { title: 'Partial edit' });
      expect(store.dispatch('set.update', { index: 1, update: { counts: 0 } })).toBe(false);
    })).toThrow(/counts/);
    expect(store.getState().project).toBe(before);
    expect(() => store.transact('Throwing batch', () => { store.dispatch('project.update', { title: 'Partial' }); throw new Error('cancel'); })).toThrow('cancel');
    expect(store.getState().project).toBe(before);
  });

  it('rejects nested transactions without canceling the existing transaction', () => {
    const store = createEditorStore(createDemoProject());
    store.beginTransaction('First');
    expect(() => store.transact('Nested', () => {})).toThrow(/Finish or cancel/);
    expect(store.getState().project.transactionName).toBe('First');
    store.dispatch('project.update', { title: 'First edit' }); store.commitTransaction();
    expect(store.getState().project.past[0].name).toBe('First');
  });

  it('clears pending transactions and history when a different production loads', () => {
    const store = createEditorStore(createDemoProject());
    store.beginTransaction('Color');
    store.dispatch('section.update', { id: 'brass', update: { color: '#ffffff' } });
    store.dispatch('project.load', { project: createBlankProject() });
    const loaded = store.getState().project;
    store.commitTransaction();
    expect(store.getState().project).toBe(loaded);
    expect(loaded.past).toEqual([]); expect(loaded.future).toEqual([]);
    expect(loaded.transactionName).toBeUndefined();
    expect(store.getState().fileSession.savedRevision).toBeNull();
  });

  it('restores saved revision status through undo and redo without serializing edits', () => {
    const store = createEditorStore(createDemoProject());
    const saved = store.getState().project.revision;
    store.setValue('fileSession', 'savedRevision', saved);
    const stringify = vi.spyOn(JSON, 'stringify');
    try {
      store.dispatch('project.update', { title: 'Changed' });
      expect(store.getState().project.revision).not.toBe(saved);
      store.dispatch('history.undo'); expect(store.getState().project.revision).toBe(saved);
      store.dispatch('history.redo'); expect(store.getState().project.revision).not.toBe(saved);
      expect(stringify).not.toHaveBeenCalled();
    } finally { stringify.mockRestore(); }
  });

  it('uses unique revisions after undo branching and retains the saved revision for stale saves', () => {
    const store = createEditorStore(createDemoProject());
    store.dispatch('project.update', { title: 'Saving' });
    const saving = store.getState().project.revision;
    store.dispatch('history.undo'); store.dispatch('project.update', { title: 'New branch' });
    const latest = store.getState().project.revision;
    store.setValue('fileSession', 'savedRevision', saving);
    expect(latest).not.toBe(saving);
    expect(store.getState().project.future).toEqual([]);
    expect(store.getState().project.revision).not.toBe(store.getState().fileSession.savedRevision);
  });

  it('expires the oldest actions at the entry limit and keeps a bounded reversible tail', () => {
    const store = createEditorStore(createBlankProject());
    for (let i = 1; i <= 90; i++) store.dispatch('project.update', { title: `Title ${i}` });
    expect(store.getState().project.past).toHaveLength(HISTORY_LIMITS.entries);
    expect(store.getState().project.droppedEntries).toBe(10);
    for (let i = 0; i < HISTORY_LIMITS.entries; i++) store.dispatch('history.undo');
    expect(store.getState().project.present.title).toBe('Title 10');
    expect(store.dispatch('history.undo')).toBe(false);
    expect(store.getState().project.future).toHaveLength(HISTORY_LIMITS.entries);
    for (let i = 0; i < HISTORY_LIMITS.entries; i++) store.dispatch('history.redo');
    expect(store.getState().project.present.title).toBe('Title 90');
  });

  it('enforces the estimated payload limit while always keeping the latest large action', () => {
    const entry = (size: number, revision: number): HistoryEntry => ({ name: 'Action', patches: [], beforeRevision: revision - 1, afterRevision: revision, estimatedBytes: size });
    const retained = retainHistory([entry(HISTORY_LIMITS.estimatedBytes / 2, 1), entry(HISTORY_LIMITS.estimatedBytes / 2, 2), entry(100, 3)]);
    expect(retained.past.map(action => action.afterRevision)).toEqual([2, 3]);
    expect(retained.dropped).toBe(1);
    const large = retainHistory([...retained.past, entry(HISTORY_LIMITS.estimatedBytes + 1, 4)]);
    expect(large.past.map(action => action.afterRevision)).toEqual([4]);
    expect(large.estimatedBytes).toBe(HISTORY_LIMITS.estimatedBytes + 1);
  });
});
