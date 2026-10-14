import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultPreferences } from '../preferences';
import type { Preferences, PreferencesBridge, PreferencesResult } from '../preferences';
import { createBlankProject, createDemoProject, serializeProject } from '../domain';
import { createEditorStore } from './store';
import { browserPreferences, preferencesSnapshot, startPreferencesController } from './preferencesController';
import { markFileOpened, hasUnsavedWork } from './fileSession';
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
afterEach(() => vi.useRealTimers());
function setup(override: Partial<PreferencesBridge> = {}) {
  const store = createEditorStore(createDemoProject()); markFileOpened(store, false);
  const saved: Preferences[] = [];
  const bridge: PreferencesBridge = { readPreferences: async () => ({ preferences: defaultPreferences() }), savePreferences: async value => { saved.push(value); }, resetPreferences: async () => defaultPreferences(), ...override };
  const controller = startPreferencesController(store, bridge);
  return { store, saved, controller };
}
describe('preferences lifecycle', () => {
  it('persists only intentional choices without project revisions or dirty state', async () => {
    const { store, saved, controller } = setup(); await controller.ready;
    const original = serializeProject(store.getState().project.present); const revision = store.getState().project.revision;
    store.setValue('ui', 'zoom', 2); controller.update({ paperSize: 'a4', minimumSpacing: 2, nudgeStep: 1 });
    store.setValue('selection', 'selectedIds', ['temporary']); store.setValue('playback', 'count', 12); store.setValue('playback', 'playing', true);
    store.setValue('ui', 'tool', 'pan'); store.setValue('ui', 'castQuery', 'temporary');
    await controller.flush();
    expect(saved.at(-1)).toEqual({ ...defaultPreferences(), zoom: 2, paperSize: 'a4', minimumSpacing: 2, nudgeStep: 1 });
    expect(serializeProject(store.getState().project.present)).toBe(original);
    expect(store.getState().project.revision).toBe(revision); expect(hasUnsavedWork(store.getState())).toBe(false);
    const next = createBlankProject(); next.field.preset = 'high-school'; next.audioOffsetSeconds = 4;
    store.dispatch('project.load', { project: next }); await controller.flush();
    expect(store.getState().project.present).toEqual(next); expect(preferencesSnapshot(store.getState()).paperSize).toBe('a4');
    expect(saved).toHaveLength(1); controller.stop();
  });
  it('waits for startup load and keeps edits made while it loads', async () => {
    const load = deferred<PreferencesResult>(); const { store, saved, controller } = setup({ readPreferences: () => load.promise });
    store.setValue('ui', 'zoom', 2); const flushing = controller.flush();
    expect(saved).toHaveLength(0);
    load.resolve({ preferences: { ...defaultPreferences(), zoom: 1.5, paperSize: 'a4' } }); await flushing;
    expect(store.getState().ui.zoom).toBe(2); expect(saved[0]?.paperSize).toBe('a4'); controller.stop();
  });
  it('reports unavailable storage and retries without losing the chosen settings', async () => {
    let fail = true;
    const { store, saved, controller } = setup({ readPreferences: async () => { throw new Error('Storage denied'); }, savePreferences: async value => { if (fail) throw new Error('Disk full'); saved.push(value); } });
    await controller.ready; expect(store.getState().preferences.error).toContain('Storage denied');
    controller.update({ zoom: 1.5 }); await controller.flush();
    expect(store.getState().preferences.error).toContain('Disk full'); expect(store.getState().ui.zoom).toBe(1.5);
    fail = false; await controller.flush(); expect(saved).toHaveLength(1); expect(store.getState().preferences.status).toBe('saved'); controller.stop();
  });
  it('retains changes made during a queued save or reset, and stops unsubscribed work', async () => {
    vi.useFakeTimers(); const write = deferred<void>(); const reset = deferred<Preferences>();
    const { store, controller } = setup({ savePreferences: () => write.promise, resetPreferences: () => reset.promise }); await controller.ready;
    controller.update({ zoom: 1.5 }); const flushing = controller.flush(); await Promise.resolve(); await Promise.resolve();
    controller.update({ zoom: 2 }); write.resolve(); await flushing;
    expect(preferencesSnapshot(store.getState()).zoom).toBe(2);
    const resetting = controller.reset(); await Promise.resolve(); controller.update({ paperSize: 'a4' }); reset.resolve(defaultPreferences()); expect(await resetting).toBe(true);
    expect(store.getState().ui.zoom).toBe(1); expect(preferencesSnapshot(store.getState()).paperSize).toBe('a4');
    controller.stop(); store.setValue('ui', 'zoom', 3); await vi.runAllTimersAsync();
    expect(store.getState().preferences.value.zoom).toBe(1);
  });
  it('coalesces changes in one event while transient controls never create writes', async () => {
    vi.useFakeTimers(); const { store, saved, controller } = setup(); await controller.ready;
    store.setValue('ui', 'menu', true); store.setValue('playback', 'count', 1); await vi.advanceTimersByTimeAsync(400); expect(saved).toHaveLength(0);
    store.setValue('ui', 'zoom', 1.2); store.setValue('ui', 'zoom', 1.4); await vi.advanceTimersByTimeAsync(0);
    expect(saved).toHaveLength(1); expect(saved[0].zoom).toBe(1.4); controller.stop();
  });
  it('queues a return to the previous value while an earlier write is still pending', async () => {
    const first = deferred<void>(); const writes: Preferences[] = [];
    const { controller } = setup({ savePreferences: async value => { writes.push(value); if (writes.length === 1) await first.promise; } }); await controller.ready;
    controller.update({ zoom: 2 }); await Promise.resolve(); await Promise.resolve();
    controller.update({ zoom: 1 }); await controller.flush(); first.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(writes.map(value => value.zoom)).toEqual([2, 1]); controller.stop();
  });
  it('recovers browser corruption and blocks newer files until an explicit reset', async () => {
    const data = new Map([['squidware.preferences.v1', '{bad']]); const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    let bridge = browserPreferences(storage); expect((await bridge.readPreferences()).warning).toBeTruthy();
    await bridge.savePreferences(defaultPreferences()); expect(data.get('squidware.preferences.v1.preserved')).toBe('{bad');
    data.set('squidware.preferences.v1', '{"version":2}'); bridge = browserPreferences(storage); expect((await bridge.readPreferences()).readOnly).toBe(true);
    await expect(bridge.savePreferences(defaultPreferences())).rejects.toThrow('newer');
    await bridge.resetPreferences(); expect(data.get('squidware.preferences.v1.preserved')).toBe('{"version":2}');
    await bridge.savePreferences({ ...defaultPreferences(), zoom: 2 });
    await bridge.resetPreferences(); expect(JSON.parse(data.get('squidware.preferences.v1.preserved')!).zoom).toBe(2);
  });
});

