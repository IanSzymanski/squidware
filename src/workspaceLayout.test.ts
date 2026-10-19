import { describe, expect, it } from 'vitest';
import { fitWorkspaceLayout, validateWorkspaceLayout, workspacePreset } from './workspaceLayout';
import { defaultPreferences, validatePreferences } from './preferences';
import { createDemoProject, serializeProject } from './domain';
import { createEditorStore } from './editor/store';
import { startPreferencesController } from './editor/preferencesController';

describe('workspace layout boundaries', () => {
  it('migrates older density choices and repairs layout fields without losing unrelated preferences', () => {
    expect(validatePreferences({ panelLayout: 'compact' }).workspaceLayout).toMatchObject({ setsWidth: 176, inspectorWidth: 235 });
    const p = validatePreferences({ paperSize: 'a4', workspaceLayout: { preset: 'bad', setsWidth: 90000, inspectorWidth: -3, castWidth: NaN, setsCollapsed: 'yes', castCollapsed: true } });
    expect(p.paperSize).toBe('a4');
    expect(p.workspaceLayout).toEqual({ ...workspacePreset('write'), setsWidth: 360, inspectorWidth: 235, castCollapsed: true });
    for (const value of [null, [], 'bad']) expect(validateWorkspaceLayout(value)).toEqual(workspacePreset('write'));
  });
  it('fits a useful field at narrow and scaled widths without overwriting the saved layout', () => {
    const p = { ...workspacePreset('write'), setsWidth: 360, inspectorWidth: 420, castWidth: 480 };
    const before = structuredClone(p);
    for (const side of ['inspector', 'cast'] as const) {
      for (const available of [1920, 1366, 1000, 850, 683, 500, 320]) {
        const fitted = fitWorkspaceLayout(p, available, side);
        const used = (fitted.setsHidden ? 30 : fitted.widths.sets + 6) + (fitted.sideHidden ? 30 : fitted.widths[side] + 6);
        expect(available - used).toBeGreaterThanOrEqual(Math.min(360, available - 60));
      }
      expect(fitWorkspaceLayout(p, 1920, side)).toMatchObject({ setsHidden: false, sideHidden: false });
    }
    expect(p).toEqual(before);
  });
  it('preserves production, history and selection while persisting presets, sizes and Cast across restart', async () => {
    const store = createEditorStore(createDemoProject()); let durable = defaultPreferences();
    const bridge = { readPreferences: async () => ({ preferences: durable }), savePreferences: async (value: typeof durable) => { durable = value; }, resetPreferences: async () => defaultPreferences() };
    const controller = startPreferencesController(store, bridge); await controller.ready;
    const project = serializeProject(store.getState().project.present);
    const ids = store.getState().project.present.performers.slice(0, 2).map(p => p.id); store.setValue('selection', 'selectedIds', ids);
    store.dispatch('layout.preset', { preset: 'review' });
    store.dispatch('layout.update', { update: { setsWidth: 300, castWidth: 360 } });
    store.dispatch('cast.show', { mode: 'panel' }); await controller.flush();
    expect(store.getState().project.past).toHaveLength(0); expect(store.getState().project.revision).toBe(0);
    expect(serializeProject(store.getState().project.present)).toBe(project); expect(store.getState().selection.selectedIds).toEqual(ids);
    controller.stop();
    const next = createEditorStore(createDemoProject()); const restored = startPreferencesController(next, bridge); await restored.ready;
    expect(next.getState().ui.castPanelOpen).toBe(true);
    expect(next.getState().preferences.value.workspaceLayout).toMatchObject({ preset: 'custom', setsWidth: 300, castWidth: 360, inspectorCollapsed: true });
    next.dispatch('layout.focus'); expect(next.getState().ui.focusMode).toBe(true);
    next.dispatch('layout.focus'); expect(next.getState().ui.focusMode).toBe(false);
    restored.stop();
  });
  it('keeps active drafts and previews reachable and always permits leaving focus', () => {
    const s = createEditorStore(createDemoProject());
    s.setValue('ui', 'pendingDraft', true);
    expect(s.dispatch('layout.preset', { preset: 'rehearse' })).toBe(false);
    expect(s.dispatch('layout.focus')).toBe(false);
    expect(s.dispatch('layout.update', { update: { inspectorCollapsed: true } })).toBe(false);
    expect(s.dispatch('layout.update', { update: { inspectorCollapsed: false } })).toBe(true);
    s.setValue('ui', 'pendingDraft', false); s.dispatch('layout.focus');
    s.setValue('ui', 'pendingDraft', true); expect(s.dispatch('layout.focus')).toBe(true);
    expect(s.getState().ui.focusMode).toBe(false);
  });
});
