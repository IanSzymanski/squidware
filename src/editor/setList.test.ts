import { describe, expect, it } from 'vitest';
import v1 from '../fixtures/schema-v1.squid?raw';
import v2 from '../fixtures/schema-v2.squid?raw';
import { exportCoordinatesCsv, parseProject, serializeProject, setStartCount, totalCounts } from '../domain';
import { createEditorStore } from './store';
import { moveSetTo } from './projectEdits';
import { matchingSets } from './setList';

function maximum() {
  const p = parseProject(v2), opening = p.sets[0], move = p.moves[0];
  p.sets = Array.from({ length: 128 }, (_, i) => ({ ...structuredClone(opening), id: `set-${i}`, name: i % 2 ? `Ballad ${i + 1}` : `Opener ${i + 1}` }));
  p.moves = p.sets.slice(1).map((set, i) => ({ ...move, id: `move-${i}`, fromSetId: p.sets[i].id, toSetId: set.id, counts: 32, paths: {} }));
  return p;
}
const request = (store: ReturnType<typeof createEditorStore>, from: number, target: number) => {
  const s = store.getState(); return { id: s.project.present.sets[from].id, target, revision: s.project.revision, epoch: s.ui.projectEpoch };
};

describe('compact set navigation and atomic reorder', () => {
  it('resolves absolute set numbers and literal case-insensitive names without renumbering filtered rows', () => {
    const sets = maximum().sets;
    expect(matchingSets(sets, ' 040 ')).toEqual([39]);
    expect(matchingSets(sets, 'set 128')).toEqual([127]);
    expect(matchingSets(sets, 'bALLAD')).toHaveLength(64);
    expect(matchingSets(sets, 'Ballad 40')).toEqual([39]);
    for (const query of ['0', '129', '999999999999999999999', '[', 'no match']) expect(matchingSets(sets, query)).toEqual([]);
    expect(matchingSets(sets, '')).toHaveLength(128);
  });
  for (const [format, raw] of [['legacy v1', v1], ['canonical v2', v2]]) {
    for (const [from, target] of [[0, 2], [2, 0], [1, 2], [2, 1]]) it(`${format}: moves ${from + 1} to ${target + 1} with explicit incoming/opening semantics`, () => {
      const p = parseProject(raw);
      p.moves[0].paths.a = { segments: [{ id: 'path-a', kind: 'line', startCount: 0, endCount: p.moves[0].counts }] };
      p.moves[0].marchingDirections = { a: 'forward' };
      const store = createEditorStore(p); store.dispatch('set.select', { index: from });
      expect(store.dispatch('set.move-to', request(store, from, target))).toBe(true);
      const s = store.getState(), next = s.project.present;
      expect(next.sets[target]).toEqual(p.sets[from]);
      expect(next.sets[s.selection.activeIndex].id).toBe(p.sets[from].id);
      expect(next.sets.map(set => set.id).sort()).toEqual(p.sets.map(set => set.id).sort());
      for (const [i, set] of next.sets.entries()) {
        expect(set).toEqual(p.sets.find(old => old.id === set.id));
        if (!i) continue;
        const incoming = next.moves[i - 1], old = p.moves.find(move => move.toSetId === set.id);
        expect([incoming.fromSetId, incoming.toSetId]).toEqual([next.sets[i - 1].id, set.id]);
        if (old) {
          expect(incoming).toMatchObject({ id: old.id, counts: old.counts, tempo: old.tempo, transition: old.transition, paths: old.paths });
          expect(incoming.marchingDirections).toEqual(old.fromSetId === incoming.fromSetId ? old.marchingDirections : undefined);
        } else expect(incoming).toMatchObject({ counts: 32, ...p.openingTiming, paths: {} });
      }
      expect(next.moves.some(move => move.toSetId === next.sets[0].id)).toBe(false);
      expect(setStartCount(next, 0)).toBe(0);
      expect(parseProject(serializeProject(next))).toEqual(next);
      expect(exportCoordinatesCsv(next)).toContain(next.sets[0].name);
      expect(s.project.past).toHaveLength(1);
      store.dispatch('history.undo'); expect(store.getState().project.present).toEqual(p);
      expect(store.getState().selection.activeIndex).toBe(from);
      store.dispatch('history.redo'); expect(store.getState().project.present).toEqual(next);
      expect(store.getState().selection.activeIndex).toBe(target);
    });
  }
  it('moves set 40 to 12 in one publication/history entry while preserving an independently active set', () => {
    const p = maximum(), store = createEditorStore(p); store.dispatch('set.select', { index: 20 });
    store.setValue('playback', 'playing', true);
    const observations: unknown[] = [];
    store.subscribe(() => { const s = store.getState(); observations.push([s.project.present.sets[s.selection.activeIndex].id, s.project.past.length, s.playback.playing]); });
    expect(store.dispatch('set.move-to', request(store, 39, 11))).toBe(true);
    const s = store.getState();
    expect(s.project.present.sets[11].id).toBe('set-39');
    expect(s.selection.activeIndex).toBe(21); expect(s.playback.count).toBe(setStartCount(s.project.present, 21));
    expect(observations).toEqual([['set-20', 1, false]]);
    expect(s.project.past[0].name).toMatch(/Move set 40.*position 12/);
    expect(totalCounts(s.project.present)).toBe(totalCounts(p));
    store.dispatch('history.undo'); expect(store.getState().project.present).toEqual(p);
    store.dispatch('history.redo'); expect(store.getState().project.present.sets[11].id).toBe('set-39');
  });
  it('rejects stale or malformed requests and pending edits without changing history or playback', () => {
    const store = createEditorStore(maximum()), good = request(store, 39, 11);
    for (const patch of [{ target: -1 }, { target: 128 }, { target: 1.5 }, { target: NaN }, { target: 39 }, { id: 'missing' }, { revision: -1 }, { epoch: -1 }]) expect(store.dispatch('set.move-to', { ...good, ...patch })).toBe(false);
    for (const key of ['pendingDraft', 'dialog'] as const) {
      store.setValue('ui', key, key === 'dialog' ? 'help' : true);
      expect(store.dispatch('set.move-to', good)).toBe(false);
      expect(store.dispatch('set.reorder', { index: 39, direction: -1 })).toBe(false);
      store.setValue('ui', key, key === 'dialog' ? null : false);
    }
    store.dispatch('project.load', { project: maximum() }); expect(store.dispatch('set.move-to', good)).toBe(false);
    expect(store.getState().project.past).toHaveLength(0); expect(store.getState().selection.activeIndex).toBe(0);
    expect(moveSetTo(store.getState().project.present, 'set-0', 0)).toBe(store.getState().project.present);
  });
  it('rejects an opening reorder that would strand a saved musical anchor atomically', () => {
    const p = parseProject(v2); p.moves[0].counts = 1024;
    p.score = { firstMeasure: 1, pickupCounts: 0, changes: [], marks: [{ count: 1000, label: 'Ending' }] };
    const store = createEditorStore(p), before = store.getState();
    expect(store.dispatch('set.move-to', request(store, 1, 0))).toBe(false);
    const after = store.getState(); expect(after.project).toBe(before.project);
    expect(after.selection).toBe(before.selection); expect(after.playback).toBe(before.playback);
    expect(after.ui.toast).toMatch(/count|duration/i);
  });
});
