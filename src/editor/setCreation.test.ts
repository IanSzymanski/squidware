import { describe, expect, it } from 'vitest';
import v1 from '../fixtures/schema-v1.squid?raw';
import { parseProject, serializeProject, setStartCount, totalCounts, PROJECT_LIMITS } from '../domain';
import { validatePreferences } from '../preferences';
import { createLegacyPerformanceFixture } from '../performanceFixtures';
import { migrateProjectV1 } from '../projectV2';
import { createEditorStore } from './store';
import { paletteEntries } from './paletteCommands';
import type { SetCreationKind } from './projectEdits';

const kinds: SetCreationKind[] = ['new', 'duplicate', 'insert-before', 'hold'];
function fixture() {
  const p = parseProject(v1);
  p.moves[0].paths.a = { segments: [{ id: 'explicit-line', kind: 'line', startCount: 0, endCount: p.moves[0].counts }] };
  return p;
}

describe('distinct set creation', () => {
  for (const kind of kinds) for (const index of [0, 1, 2]) it(`${kind} at index ${index} preserves the existing production and makes one reversible edit`, () => {
    const p = fixture(), store = createEditorStore(p);
    store.dispatch('set.select', { index }); store.setValue('selection', 'selectedIds', ['a']);
    const before = store.getState().project.present;
    expect(store.dispatch('set.create', { kind, index, counts: 13, tempo: 143.25 })).toBe(true);
    const state = store.getState(), next = state.project.present;
    const at = kind === 'insert-before' ? index : index + 1;
    const created = next.sets[at];
    expect(next.sets.filter(s => s.id !== created.id)).toEqual(p.sets);
    expect(created.id).not.toBe(p.sets[index].id);
    expect(new Set([...next.sets, ...next.moves].map(s => s.id)).size).toBe(next.sets.length + next.moves.length);
    expect(Object.keys(created.positions).sort()).toEqual(p.performers.map(p => p.id).sort());
    expect(created.notes).toBe(kind === 'duplicate' ? p.sets[index].notes : '');
    if (kind === 'new') {
      expect(created.positions).not.toEqual(p.sets[index].positions);
      expect(created.name).toBe('Set 4');
    } else {
      expect(created.positions).toEqual(p.sets[kind === 'insert-before' ? Math.max(0, index - 1) : index].positions);
      expect(created.positions).not.toBe(p.sets[index].positions);
    }
    const added = next.moves.filter(m => !p.moves.some(old => old.id === m.id));
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ counts: 13, tempo: 143.25, paths: {},
      transition: kind === 'duplicate' ? (index ? p.moves[index - 1].transition : p.openingTiming.transition) : 'linear' });
    for (const old of p.moves) {
      const move = next.moves.find(m => m.id === old.id)!;
      expect(move).toEqual({ ...old, fromSetId: next.sets[next.sets.findIndex(s => s.id === old.toSetId) - 1].id });
    }
    expect(totalCounts(next)).toBe(totalCounts(p) + 13);
    expect(setStartCount(next, 0)).toBe(0);
    expect(state.selection).toEqual({ activeIndex: at, selectedIds: ['a'] });
    expect(state.playback).toMatchObject({ playing: false, count: setStartCount(next, at) });
    expect(state.project.past).toHaveLength(1);
    expect(state.project.past[0].name).toMatch(kind === 'duplicate' ? /^Duplicate/ : kind === 'hold' ? /^Hold/ : kind === 'insert-before' ? /^Insert before/ : /^New set/);
    expect(parseProject(serializeProject(next))).toEqual(next);
    expect(before).toEqual(p);
    store.dispatch('history.undo'); expect(store.getState().project.present).toEqual(p);
    store.dispatch('history.redo'); expect(store.getState().project.present).toEqual(next);
  });

  it('uses the personal default counts except when duplicating an incoming move', () => {
    const p = fixture();
    for (const counts of [1, PROJECT_LIMITS.counts.max]) for (const kind of kinds) for (const index of [0, 1]) {
      const store = createEditorStore(p);
      store.setValue('preferences', 'value', validatePreferences({ newSetCounts: counts }));
      expect(store.dispatch('set.create', { kind, index })).toBe(true);
      const added = store.getState().project.present.moves.find(m => !p.moves.some(old => old.id === m.id))!;
      expect(added.counts).toBe(kind === 'duplicate' && index ? p.moves[index - 1].counts : counts);
      expect(added.tempo).toBe(index ? p.moves[index - 1].tempo : p.openingTiming.tempo);
    }
  });

  it('supports all operations on a one-set production without inventing elapsed opening counts', () => {
    const p = fixture(); p.sets = p.sets.slice(0, 1); p.moves = [];
    for (const kind of kinds) {
      const store = createEditorStore(p);
      expect(store.dispatch('set.create', { kind, index: 0 })).toBe(true);
      const next = store.getState().project.present;
      expect(next.moves).toHaveLength(1); expect(totalCounts(next)).toBe(32);
      expect(next.moves[0].fromSetId).toBe(next.sets[0].id);
      expect(next.moves[0].toSetId).toBe(next.sets[1].id);
      expect(next.moves[0].paths).toEqual({});
      expect(parseProject(serializeProject(next))).toEqual(next);
    }
  });

  it('stages the maximum cast within the field and enforces the 128-set boundary for every action', () => {
    const maximum = migrateProjectV1(createLegacyPerformanceFixture('maximum'));
    const store = createEditorStore({ ...maximum, sets: maximum.sets.slice(0, -1), moves: maximum.moves.slice(0, -1) });
    expect(store.dispatch('set.create', { kind: 'new', index: 126 })).toBe(true);
    const next = store.getState().project;
    expect(parseProject(serializeProject(next.present))).toEqual(next.present);
    for (const kind of kinds) expect(store.dispatch('set.create', { kind, index: 0 })).toBe(false);
    for (const id of ['set.new', 'set.duplicate', 'set.insert-before', 'set.hold'] as const) {
      expect(store.dispatch(id)).toBe(false);
      expect(paletteEntries(store.getState()).find(e => e.invocation.id === id)?.disabledReason).toMatch(/limit/);
    }
    expect(store.getState().project).toBe(next);
  });

  it('rejects invalid timing and contexts without partial edits or history', () => {
    const store = createEditorStore(fixture()), original = store.getState().project;
    for (const options of [{ counts: 0 }, { counts: 1.2 }, { counts: 1025 }, { counts: NaN }, { tempo: 0 }, { tempo: Infinity }]) {
      expect(store.dispatch('set.create', { kind: 'new', index: 1, ...options })).toBe(false);
      expect(store.getState().project).toBe(original);
    }
    for (const index of [-1, .5, 3]) expect(store.dispatch('set.create', { kind: 'hold', index })).toBe(false);
    store.setValue('ui', 'pendingDraft', true);
    expect(store.dispatch('set.new')).toBe(false);
    expect(store.dispatch('set.create', { kind: 'new', index: 0 })).toBe(false);
    store.setValue('ui', 'pendingDraft', false); store.setValue('ui', 'dialog', 'settings');
    expect(store.dispatch('set.create', { kind: 'new', index: 0 })).toBe(false);
    store.setValue('ui', 'dialog', null); store.setValue('playback', 'playing', true);
    expect(store.dispatch('set.hold')).toBe(true);
    expect(store.getState().ui).toMatchObject({ dialog: 'set-create', setCreationKind: 'hold' });
    expect(store.getState().playback.playing).toBe(false);
    expect(store.getState().project).toBe(original);
    store.dispatch('dialog.open', { dialog: null }); // Cancel is navigation, not a project edit.
    expect(store.getState().project).toBe(original);
  });
});
