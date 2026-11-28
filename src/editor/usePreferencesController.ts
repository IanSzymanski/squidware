import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { applyAppearance, clearAppearance, resolveTheme, systemAppearance, watchSystemAppearance } from '../appearance';
import { useEditorSelector, useEditorStore } from './react';
import { showAccentIcon } from '../ui/squidGlyph';
import { browserPreferences, startPreferencesController } from './preferencesController';
import type { Preferences } from '../preferences';
export function usePreferencesController() {
  const store = useEditorStore();
  const state = useEditorSelector(state => state.preferences);
  const hasSelection = useEditorSelector(state => state.selection.selectedIds.length > 0);
  const hadSelection = useRef(false);
  const controller = useRef<ReturnType<typeof startPreferencesController> | null>(null);
  const [system, setSystem] = useState(() => systemAppearance());
  const followsSystem = state.value.theme === 'system';
  // The system is only watched while the theme follows it; switching to it reads the current system first.
  useEffect(() => { if (!followsSystem) return; setSystem(systemAppearance()); return watchSystemAppearance(window, setSystem); }, [followsSystem]);
  const theme = resolveTheme(state.value.theme, system);
  useLayoutEffect(() => {
    const root = document.documentElement;
    applyAppearance(root, theme, state.value.accent, state.value.accentColor);
    root.style.setProperty('--ui-scale', String(state.value.uiScale));
    // The tab icon wears the accent too; the desktop window keeps its packaged icon.
    const restoreIcon = showAccentIcon(document.querySelector('link[rel=icon]'), getComputedStyle(root).getPropertyValue('--accent').trim());
    return () => { restoreIcon(); clearAppearance(root); root.style.removeProperty('--ui-scale'); };
  }, [theme, state.value.accent, state.value.accentColor, state.value.uiScale]);
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
  return { ...state, theme, update: (value: Partial<Preferences>) => controller.current?.update(value), reset: () => controller.current?.reset(), flush: () => controller.current?.flush() };
}
