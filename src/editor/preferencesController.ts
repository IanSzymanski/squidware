import { defaultPreferences, validatePreferences } from '../preferences';
import type { Preferences, PreferencesBridge } from '../preferences';
import type { EditorState } from './state';
import type { EditorStore } from './store';
const UI_KEYS = ['castPanelOpen', 'selectionLabelsOnly', 'view', 'showLabels', 'showPaths', 'showNextPaths', 'showGrid', 'snap', 'zoom', 'formation', 'formationWidth', 'formationHeight', 'formationRotation', 'formationColumns', 'printMode'] as const;
const KEYS = Object.keys(defaultPreferences()) as (keyof Preferences)[];
const sameValue = (a: Preferences, b: Preferences, key: keyof Preferences) => key === 'snapDefaults' || key === 'workspaceLayout' || key === 'shortcutBindings' ? JSON.stringify(a[key]) === JSON.stringify(b[key]) : a[key] === b[key];
const equal = (a: Preferences, b: Preferences) => KEYS.every(key => sameValue(a, b, key));
export const preferencesSnapshot = (state: EditorState) => validatePreferences({ ...state.preferences.value, ...Object.fromEntries(UI_KEYS.map(key => [key, state.ui[key]])) });
function apply(store: EditorStore, value: Preferences) {
  store.setValue('preferences', 'value', value);
  for (const key of UI_KEYS) store.setValue('ui', key, value[key]);
}
const mergeIntervening = (before: Preferences, current: Preferences, loaded: Preferences) => validatePreferences({ ...loaded, ...Object.fromEntries(KEYS.filter(key => !sameValue(current, before, key)).map(key => [key, current[key]])) });

export function startPreferencesController(store: EditorStore, bridge: PreferencesBridge) {
  let active = true; let scheduled = false; let submitted: Preferences | undefined;
  let last = preferencesSnapshot(store.getState()); let sequence = 0; let durableSequence = 0;
  const unsubscribers: (() => void)[] = [];
  async function flush() {
    await ready;
    if (!active) return;
    const value = preferencesSnapshot(store.getState());
    if (equal(value, submitted ?? last) && store.getState().preferences.status !== 'unavailable') return;
    const request = ++sequence;
    submitted = value;
    store.setValue('preferences', 'status', 'saving');
    try { await bridge.savePreferences(value); if (!active) return; if (request >= durableSequence) { last = value; durableSequence = request; } if (request === sequence) { submitted = undefined; store.setValue('preferences', 'status', 'saved'); store.setValue('preferences', 'error', ''); schedule(); } }
    catch (error) { if (active && request === sequence) { submitted = undefined; store.setValue('preferences', 'status', 'unavailable'); store.setValue('preferences', 'error', (error as Error).message); } }
  }
  function schedule() {
    if (equal(preferencesSnapshot(store.getState()), submitted ?? last)) return;
    store.setValue('preferences', 'status', 'pending');
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; void flush(); });
  }
  const before = preferencesSnapshot(store.getState());
  const ready = bridge.readPreferences().then(result => {
    if (!active) return;
    last = validatePreferences(result.preferences);
    apply(store, mergeIntervening(before, preferencesSnapshot(store.getState()), last));
    store.setValue('preferences', 'status', result.readOnly ? 'unavailable' : 'saved');
    store.setValue('preferences', 'error', result.warning ?? '');
  }).catch(error => { if (active) { store.setValue('preferences', 'status', 'unavailable'); store.setValue('preferences', 'error', (error as Error).message); } }).then(() => {
    if (!active) return;
    unsubscribers.push(store.subscribeSelector(state => state.ui, () => {
      const value = preferencesSnapshot(store.getState());
      if (!equal(value, store.getState().preferences.value)) store.setValue('preferences', 'value', value);
      schedule();
    }), store.subscribeSelector(state => state.preferences.value, schedule));
    schedule();
  });
  return {
    ready, flush,
    update(update: Partial<Preferences>) { apply(store, validatePreferences({ ...preferencesSnapshot(store.getState()), ...update })); },
    async reset() {
      await ready;
      if (!active) return false;
      const request = ++sequence;
      submitted = undefined;
      const before = preferencesSnapshot(store.getState());
      store.setValue('preferences', 'status', 'saving');
      try { const defaults = validatePreferences(await bridge.resetPreferences()); if (!active) return false; if (request >= durableSequence) { last = defaults; durableSequence = request; } apply(store, mergeIntervening(before, preferencesSnapshot(store.getState()), defaults)); store.setValue('preferences', 'error', ''); store.setValue('preferences', 'status', 'saved'); schedule(); return true; }
      catch (error) { if (active) { store.setValue('preferences', 'status', 'unavailable'); store.setValue('preferences', 'error', (error as Error).message); } return false; }
    },
    stop() { active = false; unsubscribers.forEach(unsubscribe => unsubscribe()); },
  };
}

export function browserPreferences(storage: Pick<Storage, 'getItem' | 'setItem'>): PreferencesBridge {
  const key = 'squidware.preferences.v1'; let original: string | null = null; let readOnly = false;
  return {
    async readPreferences() { try { original = storage.getItem(key); if (original && original.length > 32768) throw new Error('Preferences exceed the 32 KiB limit.'); return { preferences: original ? validatePreferences(JSON.parse(original)) : defaultPreferences() }; } catch (error) { readOnly = /newer|unsupported/.test((error as Error).message); return { preferences: defaultPreferences(), warning: (error as Error).message, readOnly }; } },
    async savePreferences(value) { if (readOnly) throw new Error('Update Squidware or reset the newer preferences before saving changes.'); const content = JSON.stringify(validatePreferences(value)); if (original) { storage.setItem(`${key}.preserved`, original); original = null; } storage.setItem(key, content); },
    async resetPreferences() { const value = defaultPreferences(); const previous = storage.getItem(key); if (previous) storage.setItem(`${key}.preserved`, previous); storage.setItem(key, JSON.stringify(value)); original = null; readOnly = false; return value; },
  };
}
