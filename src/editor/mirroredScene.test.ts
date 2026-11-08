import { describe, expect, it, vi } from 'vitest';
import { createDemoProject, sampleProject } from '../domain';
import { defaultPreferences, validatePreferences } from '../preferences';
import { validateShortcutBindings } from '../shortcuts';
import { moveDrafts, overlayDraft, rehearsalScope, scopePositions, sharedSample } from './mirroredScene';
import { commandUnavailable, paletteEntries } from './paletteCommands';
import { preferencesSnapshot, startPreferencesController } from './preferencesController';
import { createEditorStore } from './store';

describe('mirrored 3D scene', () => {
  it('samples each project and count once for the field and the 3D window', () => {
    const project = createDemoProject();
    const sample = sharedSample(project, 3.5);
    expect(sharedSample(project, 3.5)).toBe(sample);
    expect(sample).toEqual(sampleProject(project, 3.5));
    expect(sharedSample(project, 4)).not.toBe(sample);
    expect(sharedSample({ ...project }, 4)).toEqual(sampleProject(project, 4));
  });
  it('scopes positions to a rehearsal focus and leaves the full show untouched otherwise', () => {
    const project = createDemoProject();
    expect(rehearsalScope(project, null)).toBe(project);
    const ids = project.performers.slice(0, 2).map(p => p.id);
    const scope = { ...project, performers: project.performers.filter(p => ids.includes(p.id)) };
    const positions = project.sets[0].positions;
    expect(scopePositions(positions, null)).toBe(positions);
    expect(Object.keys(scopePositions(positions, scope))).toEqual(ids);
  });
  it('overlays a live 2D drag only on the displayed editable set and only for shown performers', () => {
    const positions = { a: { x: 1, y: 1 }, b: { x: 2, y: 2 } };
    const draft = { index: 2, updates: { a: { x: 9, y: 9 }, hidden: { x: 5, y: 5 } } };
    expect(overlayDraft(positions, draft, 2, true)).toEqual({ a: { x: 9, y: 9 }, b: { x: 2, y: 2 } });
    expect(overlayDraft(positions, draft, 1, true)).toBe(positions);
    expect(overlayDraft(positions, draft, 2, false)).toBe(positions);
    expect(overlayDraft(positions, null, 2, true)).toBe(positions);
    expect(overlayDraft(positions, { index: 2, updates: { hidden: { x: 5, y: 5 } } }, 2, true)).toBe(positions);
  });
  it('publishes uncommitted drags per editor and skips redundant clears', () => {
    const store = createEditorStore(createDemoProject()), other = createEditorStore(createDemoProject());
    const channel = moveDrafts(store), listener = vi.fn(), otherListener = vi.fn();
    channel.subscribe(listener); moveDrafts(other).subscribe(otherListener);
    channel.publish(1, null); expect(listener).not.toHaveBeenCalled();
    channel.publish(1, { a: { x: 3, y: 4 } });
    expect(moveDrafts(store).get()).toEqual({ index: 1, updates: { a: { x: 3, y: 4 } } }); expect(listener).toHaveBeenCalledTimes(1);
    channel.publish(1, {}); expect(channel.get()).toBeNull(); expect(listener).toHaveBeenCalledTimes(2);
    expect(otherListener).not.toHaveBeenCalled(); expect(moveDrafts(other).get()).toBeNull();
  });
});

describe('3D window commands and preferences', () => {
  it('stays hidden and disabled without the desktop bridge', () => {
    const store = createEditorStore(createDemoProject());
    expect(store.dispatch('view.popout')).toBe(false); expect(store.getState().ui.popout3d).toBe('unavailable');
    expect(paletteEntries(store.getState()).some(entry => entry.invocation.id.startsWith('view.popout'))).toBe(false);
    expect(commandUnavailable(store.getState(), { id: 'view.popout', args: undefined })).toMatch(/desktop app/);
  });
  it('opens once, moves an inline 3D view back to 2D, then focuses and closes', () => {
    const store = createEditorStore(createDemoProject());
    store.setValue('ui', 'popout3d', 'closed'); store.dispatch('view.select', { view: '3d' });
    expect(store.dispatch('view.popout-close')).toBe(false);
    expect(store.dispatch('view.popout')).toBe(true);
    expect(store.getState().ui).toMatchObject({ popout3d: 'open', view: '2d', popout3dFocus: 0 });
    expect(store.dispatch('view.popout')).toBe(true); expect(store.dispatch('view.popout')).toBe(true);
    expect(store.getState().ui).toMatchObject({ popout3d: 'open', popout3dFocus: 2 });
    expect(store.getState().project.past).toHaveLength(0);
    expect(paletteEntries(store.getState()).filter(entry => entry.invocation.id.startsWith('view.popout')).map(entry => [entry.name, entry.disabledReason])).toEqual([['Open 3D window', null], ['Close 3D window', null]]);
    store.dispatch('view.select', { view: '3d' }); expect(store.getState().ui.view).toBe('3d');
    expect(store.dispatch('view.popout-close')).toBe(true); expect(store.getState().ui).toMatchObject({ popout3d: 'closed', view: '3d' });
  });
  it('stays available during a preview so the 3D window can show it', () => {
    const store = createEditorStore(createDemoProject());
    store.setValue('ui', 'popout3d', 'closed'); store.dispatch('selection.all'); store.dispatch('transform.preview', {});
    expect(store.getState().ui.transformPreview).not.toBeNull();
    expect(commandUnavailable(store.getState(), { id: 'view.popout', args: undefined })).toBeNull();
    expect(store.dispatch('view.popout')).toBe(true); expect(store.getState().ui.transformPreview).not.toBeNull();
  });
  it('persists usable window geometry per device and drops unusable geometry without rejecting other choices', () => {
    expect(defaultPreferences().popout3dBounds).toBeNull();
    const bounds = { x: 1500, y: 40, width: 900, height: 600, displayId: 7 };
    expect(validatePreferences({ version: 1, popout3dBounds: bounds }).popout3dBounds).toEqual(bounds);
    expect(validatePreferences({ version: 1, zoom: 2, popout3dBounds: { x: 'far', y: 0 } })).toMatchObject({ zoom: 2, popout3dBounds: null });
  });
  it('saves reported geometry once instead of re-saving an equal copy on every editor change', async () => {
    const store = createEditorStore(createDemoProject()); const saved: unknown[] = [];
    const controller = startPreferencesController(store, { readPreferences: async () => ({ preferences: defaultPreferences() }), savePreferences: async value => { saved.push(value); if (saved.length > 20) throw new Error('Repeated save loop.'); }, resetPreferences: async () => defaultPreferences() });
    await controller.ready; await new Promise(resolve => setTimeout(resolve));
    controller.update({ popout3dBounds: { x: 10, y: 20, width: 800, height: 500, displayId: 1 } });
    await new Promise(resolve => setTimeout(resolve));
    const after = saved.length; expect(after).toBeGreaterThan(0);
    for (let i = 0; i < 5; i++) store.setValue('ui', 'toast', `change ${i}`);
    await new Promise(resolve => setTimeout(resolve));
    expect(saved).toHaveLength(after); expect(preferencesSnapshot(store.getState()).popout3dBounds).toEqual({ x: 10, y: 20, width: 800, height: 500, displayId: 1 });
    controller.stop();
  });
  it('binds Shift+T without rejecting an older custom Shift+T binding', () => {
    expect(validateShortcutBindings({ 'tool.box': 'Shift+T' })).toEqual({ 'tool.box': 'Shift+T', 'view.popout': null });
    expect(validatePreferences({ version: 1, shortcutBindings: { 'tool.box': 'Shift+T' } }).shortcutBindings).toEqual({ 'tool.box': 'Shift+T', 'view.popout': null });
    expect(() => validateShortcutBindings({ 'tool.box': 'Shift+T', 'view.popout': 'Shift+T' })).toThrow(/conflict/);
  });
});
