import { describe, expect, it } from 'vitest';
import { createDemoProject, parseProject } from '../domain';
import { createPerformanceFixture } from '../performanceFixtures';
import { DEFAULT_SNAPPING } from '../snapping';
import { drillPlan, parseDrillCommand } from './drillCommands';
import { createEditorStore } from './store';
import { paletteEntries, paletteQuery, searchPalette } from './paletteCommands';
import { shortcutIds } from '../shortcuts';

function fixture() {
  const project = createDemoProject(); project.snapping = { ...DEFAULT_SNAPPING, steps: 8 };
  const ids = project.performers.slice(0, 2).map(p => p.id);
  project.sets[0].positions[ids[0]] = { x: 30, y: 20 }; project.sets[0].positions[ids[1]] = { x: 34, y: 21 };
  const store = createEditorStore(project); store.setValue('selection', 'selectedIds', ids);
  return { store, ids, before: store.getState().project, project };
}
describe('drill commands through shared preview sessions', () => {
  it('previews move 4 forward using production steps; cancel preserves history and Apply is one undo action', () => {
    const { store, ids, before } = fixture();
    store.dispatch('palette.open'); expect(store.getState().ui.paletteOpen).toBe(true);
    expect(store.dispatch('drill.preview', { text: 'move 4 forward' })).toBe(true);
    expect(store.getState().project).toBe(before);
    expect(store.getState().ui.coordinatePreview?.options.text).toBe('4 forward');
    store.dispatch('coordinates.cancel'); expect(store.getState().project).toBe(before);
    store.dispatch('drill.preview', { text: 'move 4 forward' }); store.dispatch('coordinates.apply');
    expect(store.getState().project.present.sets[0].positions[ids[0]]).toEqual({ x: 30, y: 22.5 });
    expect(store.getState().project.past).toHaveLength(1);
    store.dispatch('history.undo'); expect(store.getState().project.present).toEqual(before.present);
  });
  it('uses exact mirror and interval previews without snapping or modifying other sets', () => {
    const { store, ids, before } = fixture();
    store.dispatch('drill.preview', { text: 'mirror across 50' }); store.dispatch('transform.apply');
    expect(store.getState().project.present.sets[0].positions[ids[0]].x).toBe(70);
    expect(store.getState().project.present.sets.slice(1)).toEqual(before.present.sets.slice(1));
    store.dispatch('history.undo');
    store.dispatch('drill.preview', { text: 'interval 2 steps horizontal' }); store.dispatch('spacing.apply');
    const points = store.getState().project.present.sets[0].positions;
    expect(points[ids[1]].x - points[ids[0]].x).toBeCloseTo(1.25);
    expect(points[ids[0]].y).toBe(20); expect(points[ids[1]].y).toBe(21);
  });
  it('resolves an exact labelled performer without mutating selection while parsing', () => {
    const { store, ids, project, before } = fixture();
    const label = project.performers[0].label;
    store.setValue('selection', 'selectedIds', []);
    const text = `place ${label} at Side 1: on the 40; on front hash`;
    expect(drillPlan(store.getState(), text).plan?.ids).toEqual([ids[0]]);
    expect(store.getState().selection.selectedIds).toEqual([]);
    store.dispatch('drill.preview', { text }); expect(store.getState().selection.selectedIds).toEqual([ids[0]]);
    expect(store.getState().project).toBe(before);
    store.dispatch('coordinates.apply'); expect(store.getState().project.present.sets[0].positions[ids[0]].x).toBe(40);
  });
  it('accepts quoted labels with spaces and searches parameter editors by their actions', () => {
    const { store, ids } = fixture();
    const project = structuredClone(store.getState().project.present); project.performers[0].label = 'Flute 1';
    store.dispatch('project.load', { project });
    expect(drillPlan(store.getState(), 'place "Flute 1" at Side 2: on the 40; on back hash').plan?.ids).toEqual([ids[0]]);
    expect(searchPalette(paletteEntries(store.getState()), 'rename group').some(entry => entry.invocation.id === 'selection.tools')).toBe(true);
    expect(searchPalette(paletteEntries(store.getState()), 'rebind').some(entry => entry.invocation.id === 'preferences.open')).toBe(true);
    expect(searchPalette(paletteEntries(store.getState()), 'hints').some(entry => entry.invocation.id === 'preferences.open')).toBe(true);
  });
  it('rejects ambiguity, unknown labels, trailing words, field crossings and stale editing context without mutation', () => {
    const { store, before } = fixture();
    for (const text of ['mirror', 'mirror across 50 please', 'interval 2 steps', 'move 4 diagonally', 'move 100 yards forward', 'place missing at Side 1: on the 40; on front hash', 'place B1 at on the 40; on front hash']) {
      expect(drillPlan(store.getState(), text).error).toBeTruthy(); expect(store.dispatch('drill.preview', { text })).toBe(false);
      expect(store.getState().project).toBe(before); expect(store.getState().ui.coordinatePreview).toBeNull();
    }
    expect(() => parseDrillCommand('move '+'x'.repeat(240))).toThrow(/240/);
    store.setValue('selection', 'selectedIds', []); expect(drillPlan(store.getState(), 'move 4 forward').error).toMatch(/Select/);
    store.setValue('playback', 'count', 4); expect(drillPlan(store.getState(), 'mirror across 50').error).toMatch(/set/);
  });
});
describe('command search and enablement', () => {
  it('exposes every rebindable command and searchable set/section variants with useful disabled reasons', () => {
    const { store } = fixture(); const entries = paletteEntries(store.getState());
    for (const id of shortcutIds.filter(id => id !== 'palette.open')) expect(entries.some(e => e.invocation.id === id)).toBe(true);
    expect(searchPalette(entries, 'previous set')[0].disabledReason).toMatch(/first set/);
    expect(searchPalette(entries, 'Brass').some(e => e.name.includes('Select section'))).toBe(true);
    expect(searchPalette(entries, 'undo')[0].disabledReason).toMatch(/no earlier edits/);
    store.setValue('selection', 'selectedIds', []);
    expect(searchPalette(paletteEntries(store.getState()), 'Mirror across 50')[0].disabledReason).toMatch(/Select/);
  });
  it('lists each palette entry once, so result rows keep stable identities', () => {
    const { store } = fixture(); const keys = paletteEntries(store.getState()).map(entry => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(searchPalette(paletteEntries(store.getState()), 'Align recording').filter(entry => entry.invocation.id === 'audio.align-open')).toHaveLength(1);
  });
  it('offers direct set positions as one-step palette reorders that undo atomically', () => {
    const { store } = fixture(); const before = store.getState().project.present.sets.map(set => set.id);
    const entries = paletteEntries(store.getState()).filter(entry => entry.invocation.id === 'set.move-to');
    expect(entries).toHaveLength(before.length);
    const here = entries.find(entry => entry.name === `Move current set to position ${store.getState().selection.activeIndex + 1}`)!;
    expect(here.disabledReason).toBe(`This set is already at position ${store.getState().selection.activeIndex + 1}.`);
    const last = entries.find(entry => entry.name === `Move current set to position ${before.length}`)!;
    expect(last.disabledReason).toBeNull();
    // Moving the opening changes show timing, so the entry says so before and the toast confirms it after.
    expect(last.description).toMatch(/New opening: 0 counts\. The former opening now has a 32-count move\./);
    expect(store.dispatch(last.invocation.id, last.invocation.args as never)).toBe(true);
    expect(store.getState().ui.toast).toBe(`Moved set to position ${before.length}. New opening: 0 counts. The former opening now has a 32-count move.`);
    expect(store.getState().project.present.sets.at(-1)!.id).toBe(before[0]);
    expect(store.dispatch('history.undo')).toBe(true);
    expect(store.getState().project.present.sets.map(set => set.id)).toEqual(before);
  });
  it('resolves a typed set position exactly, never to a longer number that starts with it', () => {
    const store = createEditorStore(parseProject(JSON.stringify(createPerformanceFixture('maximum'))));
    for (const current of [0, 1, 11]) {
      store.dispatch('set.select', { index: current });
      for (const typed of [1, 2, 12]) {
        const [first] = paletteQuery(store.getState(), `Move current set to position ${typed}`).entries;
        expect(first.name).toBe(`Move current set to position ${typed}`);
        expect((first.invocation.args as { target: number }).target).toBe(typed - 1);
        expect(!!first.disabledReason).toBe(typed - 1 === current);
      }
    }
  });
  it('opening and closing command search preserves an existing preview', () => {
    const { store, before } = fixture(); store.dispatch('transform.preview', {});
    const preview = store.getState().ui.transformPreview;
    store.dispatch('palette.open'); store.setValue('ui', 'paletteOpen', false);
    expect(store.getState().ui.transformPreview).toBe(preview); expect(store.getState().project).toBe(before);
  });
  it('keeps action names beginning with drill verbs searchable and allows viewport panning during a preview', () => {
    const { store, before } = fixture();
    const action = paletteQuery(store.getState(), 'Move current set earlier');
    expect(action.phrase).toBe(false); expect(action.entries[0].invocation.id).toBe('set.reorder');
    const direct = paletteQuery(store.getState(), 'Move current set to position 2');
    expect(direct.phrase).toBe(false); expect(direct.entries[0].invocation.id).toBe('set.move-to');
    expect(paletteQuery(store.getState(), 'move 4 forward').resolved?.plan?.command.kind).toBe('coordinates');
    expect(paletteQuery(store.getState(), 'move 4 diagonally').resolved?.error).toBeTruthy();
    store.dispatch('transform.preview', {}); const preview = store.getState().ui.transformPreview;
    expect(store.dispatch('tool.pan')).toBe(true); expect(store.getState().ui.transformPreview).toBe(preview);
    expect(store.dispatch('tool.box')).toBe(true); expect(store.getState().ui.transformPreview).toBe(preview);
    expect(store.getState().project).toBe(before);
  });
});
