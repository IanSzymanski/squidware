import { useEffect, useRef } from 'react';
import { useEditorSelector, useEditorStore } from './react';
import { browserPreferences, startPreferencesController } from './preferencesController';
import type { Preferences } from '../preferences';
export function usePreferencesController() {
  const store = useEditorStore();
  const state = useEditorSelector(state => state.preferences);
  const controller = useRef<ReturnType<typeof startPreferencesController> | null>(null);
  useEffect(() => {
    const unavailable = { getItem() { throw new Error('Browser preferences storage is unavailable.'); }, setItem() { throw new Error('Browser preferences storage is unavailable.'); } };
    let storage; try { storage = localStorage; } catch { storage = unavailable; }
    const current = startPreferencesController(store, window.squidware ?? browserPreferences(storage)); controller.current = current;
    return () => { current.stop(); if (controller.current === current) controller.current = null; };
  }, [store]);
  return { ...state, update: (value: Partial<Preferences>) => controller.current?.update(value), reset: () => controller.current?.reset(), flush: () => controller.current?.flush() };
}
