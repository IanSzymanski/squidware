import { useEffect, useLayoutEffect, useRef } from 'react';
import { useEditorSelector, useEditorStore } from './react';
import { browserPreferences, startPreferencesController } from './preferencesController';
import type { Preferences } from '../preferences';
export function usePreferencesController() {
  const store = useEditorStore();
  const state = useEditorSelector(state => state.preferences);
  const hasSelection = useEditorSelector(state => state.selection.selectedIds.length > 0);
  const hadSelection = useRef(false);
  const controller = useRef<ReturnType<typeof startPreferencesController> | null>(null);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = state.value.theme;
    root.style.setProperty('--ui-scale', String(state.value.uiScale));
    return () => { delete root.dataset.theme; root.style.removeProperty('--ui-scale'); };
  }, [state.value.theme, state.value.uiScale]);
  useEffect(() => {
    const unavailable = { getItem() { throw new Error('Browser preferences storage is unavailable.'); }, setItem() { throw new Error('Browser preferences storage is unavailable.'); } };
    let storage; try { storage = localStorage; } catch { storage = unavailable; }
    const current = startPreferencesController(store, window.squidware ?? browserPreferences(storage)); controller.current = current;
    return () => { current.stop(); if (controller.current === current) controller.current = null; };
  }, [store]);
  useEffect(() => {
    if (hasSelection && !hadSelection.current && !state.value.selectionHintDismissed) controller.current?.update({ selectionHintDismissed: true });
    hadSelection.current = hasSelection;
  }, [hasSelection, state.value.selectionHintDismissed]);
  return { ...state, update: (value: Partial<Preferences>) => controller.current?.update(value), reset: () => controller.current?.reset(), flush: () => controller.current?.flush() };
}
