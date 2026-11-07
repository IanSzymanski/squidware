import { describe, expect, it } from 'vitest';
import { fitWorkspaceLayout, isCrowded, nextCrowdingProbe, validateWorkspaceLayout, workspacePreset, type CrowdingProbe } from './workspaceLayout';
import { defaultPreferences, validatePreferences } from './preferences';
import { createDemoProject, serializeProject } from './domain';
import { createEditorStore } from './editor/store';
import { startPreferencesController } from './editor/preferencesController';
import { fieldReserve } from './editor/breakpoints';

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
    for (const side of ['inspector', 'cast'] as const) for (const demanded of [false, true]) {
      for (const available of [1920, 1366, 1000, 850, 683, 500, 320]) {
        const fitted = fitWorkspaceLayout(p, available, side, demanded);
        const used = (fitted.setsHidden ? 30 : fitted.widths.sets + 6) + (fitted.sideHidden ? 30 : fitted.widths[side] + 6);
        expect(available - used).toBeGreaterThanOrEqual(Math.min(fieldReserve(demanded), available - 60));
      }
      expect(fitWorkspaceLayout(p, 1920, side, demanded)).toMatchObject({ setsHidden: false, sideHidden: false });
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
  it('counts each request to show Cast beside the field without saving it', async () => {
    const store = createEditorStore(createDemoProject()); let durable = defaultPreferences();
    const controller = startPreferencesController(store, { readPreferences: async () => ({ preferences: durable }), savePreferences: async (value: typeof durable) => { durable = value; }, resetPreferences: async () => defaultPreferences() });
    await controller.ready;
    const reveals = () => store.getState().ui.castReveal;
    expect(reveals()).toBe(0);
    // The header Cast tab, Dock Cast and the palette all show the panel; repeating it while Cast is current still asks again.
    store.dispatch('cast.show', { mode: 'panel' }); store.dispatch('cast.show', { mode: 'panel' }); expect(reveals()).toBe(2);
    store.dispatch('cast.show', { mode: 'table' }); store.dispatch('cast.show', { mode: 'closed' }); expect(reveals()).toBe(2);
    await controller.flush(); expect(durable).not.toHaveProperty('castReveal');
    controller.stop();
  });
  it('treats docking as crowded only when it adds overflow, and never past the situation it was measured in', () => {
    const key = '676x433:cast:2d:design', settle = (probe: CrowdingProbe | null, docked: number, idle: number) => {
      const measured = nextCrowdingProbe(probe, key, !isCrowded(probe, key), docked);
      return isCrowded(measured, key) ? nextCrowdingProbe(measured, key, false, idle) : measured;
    };
    // Docking that fits, or overflows no more than the workspace does without the panel, stays docked.
    expect(nextCrowdingProbe(null, key, true, -40)).toBeNull();
    expect(isCrowded(settle(null, 6, 5.5), key)).toBe(false);
    expect(isCrowded(settle(null, 38, -20), key)).toBe(true);
    // A 600 px tall window at 150% already scrolls 6 px without the panel: docking that scrolls 38 px is still crowded.
    const short = settle(null, 38, 6);
    expect(short).toEqual({ key, docked: 38, idle: 6 }); expect(isCrowded(short, key)).toBe(true);
    // Repeated measurements change nothing, so the panel cannot alternate between docked and tucked across frames.
    expect(nextCrowdingProbe(short, key, false, 6)).toBe(short); expect(nextCrowdingProbe(short, key, false, 6.8)).toBe(short);
    const fits = settle(null, 6, 6); expect(isCrowded(fits, key)).toBe(false); expect(nextCrowdingProbe(fits, key, true, 6.5)).toBe(fits);
    // The decision belongs to its window size, panel, view and workspace: the 2D view docks again after the 3D view crowded it.
    const view3d = settle(null, 32, -2), in3d = { ...view3d!, key: key.replace('2d', '3d') };
    expect(isCrowded(in3d, in3d.key)).toBe(true); expect(isCrowded(in3d, key)).toBe(false);
    // The measurement without the panel follows the content: once docking no longer adds overflow the panel docks again,
    // and content that grows beside a docked panel measures it again.
    expect(isCrowded(nextCrowdingProbe(short, key, false, -30), key)).toBe(true);
    expect(nextCrowdingProbe(short, key, false, 40)).toEqual({ key, docked: 38, idle: 40 }); expect(isCrowded(nextCrowdingProbe(short, key, false, 40), key)).toBe(false);
    expect(nextCrowdingProbe(fits, key, true, 40)).toEqual({ key, docked: 40, idle: null });
    // A 3D view whose camera controls settle a frame after each change: measurements that lag a frame behind settle on
    // one placement instead of alternating.
    let lagging: CrowdingProbe | null = null; const placements: boolean[] = [];
    for (let frame = 0; frame < 12; frame++) {
      const crowded = isCrowded(lagging, key), stale = frame % 2 === 0;
      lagging = nextCrowdingProbe(lagging, key, !crowded, crowded ? stale ? 0 : -20 : stale ? 0 : 19);
      placements.push(isCrowded(lagging, key));
    }
    expect(placements.slice(2)).toEqual(Array(10).fill(true));
  });
  it('records whether showing Cast restored a Cast the writer had collapsed, so its overlay offers Collapse', () => {
    const store = createEditorStore(createDemoProject());
    store.dispatch('cast.show', { mode: 'panel' }); expect(store.getState().ui.castRevealRestored).toBe(false);
    store.setValue('preferences', 'value', p => ({ ...p, workspaceLayout: { ...p.workspaceLayout, castCollapsed: true } }));
    store.dispatch('cast.show', { mode: 'panel' });
    expect(store.getState().ui).toMatchObject({ castRevealRestored: true, castReveal: 2 });
    expect(store.getState().preferences.value.workspaceLayout.castCollapsed).toBe(false);
  });
  it('leaves focus mode to show Cast beside the field, which focus mode would hide', () => {
    const store = createEditorStore(createDemoProject());
    for (const mode of ['table', 'closed'] as const) { store.setValue('ui', 'focusMode', true); store.dispatch('cast.show', { mode }); expect(store.getState().ui.focusMode).toBe(true); }
    store.dispatch('cast.show', { mode: 'panel' });
    expect(store.getState().ui).toMatchObject({ focusMode: false, castPanelOpen: true, castReveal: 1, workspace: 'design' });
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
