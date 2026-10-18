import { describe, expect, it } from 'vitest';
import { createDemoProject, serializeProject } from '../domain';
import { defaultPreferences, validatePreferences } from '../preferences';
import { DEFAULT_SNAPPING } from '../snapping';
import { nudgeDistance, nudgeLabel } from '../editIncrements';
import type { NudgeRequest } from '../editIncrements';
import type { Preferences } from '../preferences';
import { createEditorStore } from './store';
import { commandMetadata } from './commands';

function fixture(prefs: Partial<Preferences> = {}, steps: 8 | 6 | 12 = 8) {
  const project = createDemoProject(); const ids = project.performers.slice(0, 2).map(p => p.id);
  project.snapping = { ...DEFAULT_SNAPPING, steps, subdivision: 4 };
  project.sets[0].positions[ids[0]] = { x: 40.1, y: 20.2 }; project.sets[0].positions[ids[1]] = { x: 42.7, y: 21.1 };
  const store = createEditorStore(project); store.setValue('selection', 'selectedIds', ids);
  store.setValue('preferences', 'value', validatePreferences({ ...defaultPreferences(), ...prefs }));
  store.setValue('ui', 'snap', false);
  return { ids, store, original: store.getState().project.present };
}
describe('shared edit increments', () => {
  it.each([8, 6, 12] as const)('resolves normal/fast steps using the %i-to-5 show, independent of subdivision', steps => {
    const { store, ids, original } = fixture({ nudgeUnit: 'steps', nudgeStep: 1, fastNudgeStep: 3 }, steps);
    const p = store.getState().preferences.value;
    expect(nudgeDistance(p, original)).toBe(5 / steps); expect(nudgeDistance(p, original, true)).toBe(15 / steps);
    store.dispatch('selection.nudge', { key: 'ArrowRight' });
    expect(store.getState().project.present.sets[0].positions[ids[0]].x).toBeCloseTo(40.1 + 5 / steps, 10);
    store.dispatch('history.undo'); store.dispatch('selection.nudge', { key: 'ArrowRight', fast: true });
    expect(store.getState().project.present.sets[0].positions[ids[0]].x).toBeCloseTo(40.1 + 15 / steps, 10);
    expect(store.getState().project.present.sets[1]).toBe(original.sets[1]);
    expect(store.getState().project.present.performers).toBe(original.performers);
  });
  it('field-relative buttons and screen-relative keys resolve the same physical request', () => {
    const run = (orientation: Preferences['fieldOrientation'], request: NudgeRequest) => {
      const { store, ids } = fixture({ fieldOrientation: orientation, nudgeStep: 1.25 });
      expect(store.dispatch('selection.nudge', request)).toBe(true);
      expect(store.getState().project.past).toHaveLength(1); expect(store.getState().project.past[0].name).toMatch(/^Nudge 2 performers · 1.25 yd/);
      return ids.map(id => store.getState().project.present.sets[0].positions[id]);
    };
    const expected = [{ x: 41.35, y: 20.2 }, { x: 43.95, y: 21.1 }];
    expect(run('audience-bottom', { key: 'ArrowRight' })).toEqual(expected);
    expect(run('audience-top', { key: 'ArrowLeft' })).toEqual(expected);
    expect(run('audience-top', { key: 'ArrowRight', fieldRelative: true })).toEqual(expected);
  });
  it('uses the existing snap/boundary policy and never changes a rigid group interval', () => {
    const { store, ids } = fixture({ nudgeStep: .625 }); store.setValue('ui', 'snap', true);
    store.dispatch('snapping.update', { settings: { ...DEFAULT_SNAPPING } });
    store.dispatch('selection.nudge', { key: 'ArrowRight' });
    const points = store.getState().project.present.sets[0].positions;
    expect(points[ids[0]].x).toBe(40.625); expect(points[ids[1]].x - points[ids[0]].x).toBeCloseTo(2.6, 10);
    expect(points[ids[0]].y).toBe(20.2); expect(points[ids[1]].y).toBe(21.1);
    store.setValue('preferences', 'value', { ...store.getState().preferences.value, fastNudgeStep: 10 });
    for (let i = 0; i < 8; i++) store.dispatch('selection.nudge', { key: 'ArrowRight', fast: true });
    const stopped = store.getState().project; const edge = stopped.present.sets[0].positions;
    expect(edge[ids[1]].x).toBeLessThanOrEqual(100); expect(edge[ids[1]].x - edge[ids[0]].x).toBeCloseTo(2.6, 10);
    store.dispatch('selection.nudge', { key: 'ArrowRight', fast: true }); expect(store.getState().project).toBe(stopped);
  });
  it('records each accepted repeated request once; undo restores one step and redo restores it', () => {
    const { store, ids } = fixture(); const before = store.getState().project.present;
    for (let i = 0; i < 3; i++) store.dispatch('selection.nudge', { key: 'ArrowRight' });
    expect(store.getState().project.past).toHaveLength(3);
    expect(store.getState().project.present.sets[0].positions[ids[0]].x).toBeCloseTo(41.975, 10);
    store.dispatch('history.undo'); expect(store.getState().project.present.sets[0].positions[ids[0]].x).toBeCloseTo(41.35, 10);
    store.dispatch('history.redo'); expect(store.getState().project.present.sets[0].positions[ids[0]].x).toBeCloseTo(41.975, 10);
    for (let i = 0; i < 3; i++) store.dispatch('history.undo'); expect(store.getState().project.present).toEqual(before);
  });
  it.each(['empty', 'playing', 'between', 'draft', 'dialog', 'formation', 'transform', 'transaction'])('rejects %s edits consistently', mode => {
    const { store } = fixture();
    if (mode === 'empty') store.setValue('selection', 'selectedIds', []);
    if (mode === 'playing') store.setValue('playback', 'playing', true);
    if (mode === 'between') store.dispatch('playback.scrub', { count: 1 });
    if (mode === 'draft') store.setValue('ui', 'pendingDraft', true);
    if (mode === 'dialog') store.dispatch('dialog.open', { dialog: 'preferences' });
    if (mode === 'formation') store.dispatch('formation.preview', {});
    if (mode === 'transform') store.dispatch('transform.preview', {});
    if (mode === 'transaction') store.beginTransaction('Unrelated edit');
    const before = store.getState().project;
    expect(store.dispatch('selection.nudge', { key: 'ArrowRight' })).toBe(false);
    expect(store.dispatch('selection.increment', { operation: 'rotate', direction: 1 })).toBe(false);
    expect(store.getState().project).toBe(before);
    if (mode === 'transaction') store.cancelTransaction();
  });
  it.each([['rotate', -1, -30, 1], ['rotate', 1, 30, 1], ['scale', -1, 0, .75], ['scale', 1, 0, 1.25]] as const)('previews configured %s direction %i without editing until Apply', (operation, direction, angle, scale) => {
    const { store, original } = fixture({ rotationStep: 30, scaleStep: 25 }); const before = serializeProject(original);
    expect(store.dispatch('selection.increment', { operation, direction })).toBe(true);
    expect(store.getState().ui.transformPreview?.options).toMatchObject({ angle, scale, operation: 'rotate-scale' });
    expect(serializeProject(store.getState().project.present)).toBe(before); expect(store.getState().project.past).toHaveLength(0);
    // Changing personal settings never rewrites a preview already being reviewed.
    store.setValue('preferences', 'value', { ...store.getState().preferences.value, rotationStep: 45, scaleStep: 50 });
    expect(store.getState().ui.transformPreview?.options).toMatchObject({ angle, scale });
    store.dispatch('transform.apply'); expect(store.getState().project.past).toHaveLength(1);
    store.dispatch('history.undo'); expect(serializeProject(store.getState().project.present)).toBe(before);
  });
  it('invalid arguments and unsupported preferences cannot become edits', () => {
    const { store } = fixture(); const before = store.getState().project;
    expect(store.dispatch('selection.nudge', { key: 'Enter' as 'ArrowRight' })).toBe(false);
    expect(store.dispatch('selection.nudge', { key: 'ArrowRight', fast: 1 as unknown as boolean })).toBe(false);
    expect(store.dispatch('selection.increment', { operation: 'scale', direction: 0 as 1 })).toBe(false);
    expect(store.getState().project).toBe(before);
    for (const patch of [{ nudgeUnit: 'pixels' }, { rotationStep: 0 }, { rotationStep: Infinity }, { scaleStep: 100 }, { scaleStep: -.1 }]) expect(() => validatePreferences(patch)).toThrow();
    expect(validatePreferences({ version: 1 })).toMatchObject({ nudgeUnit: 'yards', rotationStep: 15, scaleStep: 10 });
  });
  it('displays the configured unit/physical distance and assigns the shortcut only to the shared command', () => {
    const p = { ...defaultPreferences(), nudgeUnit: 'steps' as const, nudgeStep: 1, fastNudgeStep: 4 };
    expect(nudgeLabel(p, { snapping: { ...DEFAULT_SNAPPING, steps: 6 } })).toBe('1 step (0.8333 yd)');
    expect(nudgeLabel(p, {}, true)).toBe('4 steps (2.5 yd)');
    expect(commandMetadata.filter(c => c.shortcut?.includes('Alt + Arrow')).map(c => c.id)).toEqual(['selection.nudge']);
  });
});
