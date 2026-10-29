import { describe, expect, it } from 'vitest';
import v1 from '../fixtures/schema-v1.squid?raw';
import { countToSeconds, parseProject, PROJECT_LIMITS, sampleProject, secondsToCount, serializeProject, setStartCount, totalCounts } from '../domain';
import { createPerformanceFixture } from '../performanceFixtures';
import { resolveAnchor } from '../rehearsal';
import type { Project, RehearsalAnchor } from '../types';
import { splitEasingDeviation, splitTransition } from './splitTransition';
import { createEditorStore } from './store';
import { paletteEntries } from './paletteCommands';

function fixture(): Project {
  const p = parseProject(v1);
  p.moves[0] = { ...p.moves[0], transition: 'linear', tempo: 123.25,
    paths: { a: { segments: [{ id: 'authored-line', kind: 'line', startCount: 0, endCount: p.moves[0].counts }] } }, marchingDirections: { a: 'backward' } };
  p.score = { firstMeasure: 1, pickupCounts: 0, changes: [], marks: [{ count: 2, label: 'Entrance' }] };
  return p;
}
function args(store: ReturnType<typeof createEditorStore>, count = 5) {
  const s = store.getState();
  return { moveId: s.project.present.moves[0].id, count, revision: s.project.revision, epoch: s.ui.projectEpoch };
}

describe('split a transition', () => {
  it('preserves every performer trajectory and clock throughout a linear show, with stable destination identities', () => {
    const before = fixture(), copy = structuredClone(before), next = splitTransition(before, { moveId: before.moves[0].id, count: 5 });
    expect(before).toEqual(copy);
    expect(next.sets[1].positions).toEqual(sampleProject(before, 5).positions);
    expect(next.sets[1].notes).toBe('');
    expect(next.sets.filter(s => s.id !== next.sets[1].id)).toEqual(before.sets);
    expect(next.moves[1]).toMatchObject({ id: before.moves[0].id, fromSetId: next.sets[1].id, toSetId: before.moves[0].toSetId, counts: 11, tempo: 123.25, transition: 'linear', marchingDirections: { a: 'backward' } });
    expect(next.moves[0].paths.a.segments[0]).toMatchObject({ startCount: 0, endCount: 5 });
    expect(next.moves[0].paths.a.segments[0].id).not.toBe('authored-line');
    expect(next.moves[1].paths.a.segments[0]).toEqual({ id: 'authored-line', kind: 'line', startCount: 0, endCount: 11 });
    expect(next.moves.slice(2)).toEqual(before.moves.slice(1));
    expect(next.score).toEqual(before.score);
    expect(next.openingTiming).toEqual(before.openingTiming);
    expect(totalCounts(next)).toBe(totalCounts(before));
    for (let count = 0; count <= totalCounts(before); count += .125) {
      for (const person of before.performers) {
        const old = sampleProject(before, count).positions[person.id], point = sampleProject(next, count).positions[person.id];
        expect(point.x).toBeCloseTo(old.x, 10); expect(point.y).toBeCloseTo(old.y, 10);
      }
      expect(countToSeconds(next, count)).toBeCloseTo(countToSeconds(before, count), 10);
      expect(secondsToCount(next, countToSeconds(before, count))).toBeCloseTo(count, 10);
    }
    expect(parseProject(serializeProject(next))).toEqual(next);
  });

  it('requires explicit eased conversion, samples the eased split, and reports the actual worst change', () => {
    const p = fixture(); p.moves[0].transition = 'ease';
    for (const count of [1, 5, 8, 15]) {
      expect(() => splitTransition(p, { moveId: p.moves[0].id, count })).toThrow(/easing/);
      const next = splitTransition(p, { moveId: p.moves[0].id, count, allowEasingChange: true });
      expect(next.sets[1].positions).toEqual(sampleProject(p, count).positions);
      expect(next.moves.slice(0, 2).map(m => m.transition)).toEqual(['linear', 'linear']);
      const max = splitEasingDeviation(p, 0, count);
      let observed = 0;
      for (let c = 0; c <= 16; c += .01) for (const person of p.performers) {
        const a = sampleProject(p, c).positions[person.id], b = sampleProject(next, c).positions[person.id];
        observed = Math.max(observed, Math.hypot(a.x - b.x, a.y - b.y));
        expect(countToSeconds(p, c)).toBeCloseTo(countToSeconds(next, c), 10);
      }
      expect(max.yards).toBeCloseTo(observed, 4);
      const a = sampleProject(p, max.count).positions.a, b = sampleProject(next, max.count).positions.a;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(max.yards, 8);
      expect(sampleProject(next, 16).positions).toEqual(p.sets[1].positions);
      expect(parseProject(serializeProject(next))).toEqual(next);
    }
  });

  it('remaps only valid move bookmarks at the same absolute counts, including split and endpoint anchors', () => {
    const p = fixture(), move = p.moves[0];
    const anchor = (count: number): RehearsalAnchor => ({ kind: 'move', moveId: move.id, fromSetId: move.fromSetId, toSetId: move.toSetId, count });
    p.rehearsal = [0, 2.5, 5, 9, 16].map((count, i) => ({ id: `p${i}`, name: `At ${count}`, notes: 'Keep', start: anchor(count), end: { kind: 'set', setId: p.sets[2].id }, focus: { kind: 'all' } }));
    p.rehearsal.push({ ...p.rehearsal[0], id: 'stale', start: { ...anchor(7), fromSetId: 'deleted' } as RehearsalAnchor });
    const next = splitTransition(p, { moveId: move.id, count: 5 });
    for (let i = 0; i < 5; i++) {
      expect(resolveAnchor(next, next.rehearsal![i].start).count).toBe(resolveAnchor(p, p.rehearsal[i].start).count);
      expect(resolveAnchor(next, next.rehearsal![i].start).error).toBeUndefined();
      expect(next.rehearsal![i].end).toEqual(p.rehearsal[i].end);
    }
    expect(next.rehearsal![2].start).toEqual({ kind: 'set', setId: next.sets[1].id });
    expect(next.rehearsal![5]).toEqual(p.rehearsal[5]);
  });

  it('applies from a paused interior count as one named undo and preserves selection, save/reopen and cancellation', () => {
    const store = createEditorStore(fixture()), original = store.getState().project;
    store.dispatch('playback.scrub', { count: 5 }); store.setValue('selection', 'selectedIds', ['b']);
    expect(store.dispatch('set.split-open')).toBe(true);
    expect(store.getState().ui.dialog).toBe('set-split'); expect(store.getState().project).toBe(original);
    store.dispatch('dialog.open', { dialog: null }); expect(store.getState().project).toBe(original);
    expect(store.dispatch('set.split', args(store))).toBe(true);
    const next = store.getState().project.present;
    expect(store.getState().selection).toEqual({ activeIndex: 1, selectedIds: ['b'] });
    expect(store.getState().playback).toMatchObject({ playing: false, count: 5, rehearsalId: null });
    expect(store.getState().project.past.map(e => e.name)).toEqual(['Split transition · count 5']);
    store.dispatch('history.undo'); expect(store.getState().project.present).toEqual(original.present);
    store.dispatch('history.redo'); expect(store.getState().project.present).toEqual(next);
    expect(parseProject(serializeProject(next))).toEqual(next);
  });

  it('rejects invalid, boundary, fractional, absent, one-count and zero-duration splits atomically', () => {
    const store = createEditorStore(fixture()), before = store.getState().project;
    for (const count of [0, -1, .5, 16, 17, NaN, Infinity]) {
      expect(store.dispatch('set.split', args(store, count))).toBe(false);
      expect(store.getState().project).toBe(before);
    }
    expect(store.dispatch('set.split', { ...args(store), moveId: 'missing' })).toBe(false);
    const p = fixture(); p.moves[0].counts = 1; p.moves[0].paths = {};
    const one = createEditorStore(p);
    expect(one.dispatch('set.split-open')).toBe(false);
    expect(one.dispatch('set.split', args(one, 1))).toBe(false);
    p.sets = p.sets.slice(0, 1); p.moves = []; delete p.score;
    const opening = createEditorStore(p);
    expect(opening.dispatch('set.split-open')).toBe(false);
    expect(opening.dispatch('dialog.open', { dialog: 'set-split' })).toBe(false);
    expect(paletteEntries(opening.getState()).find(e => e.invocation.id === 'set.split-open')?.disabledReason).toMatch(/two counts/);
  });

  it('enforces the set limit with 500 performers, and splits a migrated v1 production', () => {
    const p = createPerformanceFixture('maximum');
    const store = createEditorStore({ ...p, sets: p.sets.slice(0, -1), moves: p.moves.slice(0, -1) });
    expect(store.dispatch('set.split', { ...args(store, 1), allowEasingChange: true })).toBe(true);
    const next = store.getState().project;
    expect(Object.keys(next.present.sets[1].positions)).toHaveLength(500);
    expect(next.present.sets).toHaveLength(PROJECT_LIMITS.sets);
    expect(parseProject(serializeProject(next.present))).toEqual(next.present);
    expect(store.dispatch('set.split', { ...args(store, 1), allowEasingChange: true })).toBe(false); expect(store.getState().project).toBe(next);
    expect(store.dispatch('set.split-open')).toBe(false);
    const migrated = parseProject(v1);
    expect(migrated.schemaVersion).toBe(2);
    const split = splitTransition(migrated, { moveId: migrated.moves[0].id, count: 1, allowEasingChange: true });
    expect(split.sets[1].positions).toEqual(sampleProject(migrated, 1).positions);
  });

  it('rejects stale previews, replaced sessions, other dialogs, pending drafts and gestures', () => {
    const store = createEditorStore(fixture()), reviewed = args(store);
    store.dispatch('set.update', { index: 0, update: { name: 'Renamed' } });
    expect(store.dispatch('set.split', reviewed)).toBe(false);
    const replacement = args(store); store.dispatch('project.load', { project: fixture() });
    expect(store.dispatch('set.split', replacement)).toBe(false);
    const before = store.getState().project;
    store.setValue('ui', 'pendingDraft', true); expect(store.dispatch('set.split', args(store))).toBe(false); expect(store.dispatch('set.split-open')).toBe(false);
    store.setValue('ui', 'pendingDraft', false); store.setValue('ui', 'dialog', 'settings'); expect(store.dispatch('set.split', args(store))).toBe(false);
    store.setValue('ui', 'dialog', null); store.beginTransaction('Pointer gesture'); expect(store.dispatch('set.split', args(store))).toBe(false); store.cancelTransaction();
    expect(store.getState().project).toBe(before);
  });

  it('supports a one-count remainder at the maximum move duration', () => {
    const p = fixture(); p.moves[0].counts = PROJECT_LIMITS.counts.max; p.moves[0].paths.a.segments[0].endCount = PROJECT_LIMITS.counts.max;
    const next = splitTransition(p, { moveId: p.moves[0].id, count: PROJECT_LIMITS.counts.max - 1 });
    expect(next.moves.slice(0, 2).map(move => move.counts)).toEqual([1023, 1]);
    expect(totalCounts(next)).toBe(totalCounts(p));
    expect(countToSeconds(next, 1024)).toBeCloseTo(countToSeconds(p, 1024), 10);
    expect(parseProject(serializeProject(next))).toEqual(next);
  });

  it('splits later moves without shifting earlier or later arrivals and musical marks', () => {
    const p = fixture(), move = p.moves[1], start = setStartCount(p, 1);
    const next = splitTransition(p, { moveId: move.id, count: 1, allowEasingChange: true });
    expect(next.sets[2].positions).toEqual(sampleProject(p, start + 1).positions);
    expect(next.moves[0]).toEqual(p.moves[0]);
    expect(setStartCount(next, 3)).toBe(setStartCount(p, 2));
    expect(next.score).toEqual(p.score);
  });
});
