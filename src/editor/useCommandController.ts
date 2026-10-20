import { isNudgeKey } from '../editIncrements';
import { useEffect } from 'react';
import { flushSync } from 'react-dom';
import { bindingFromEvent, defaultShortcuts, nativeMenuCommands, shortcutForEvent } from '../shortcuts';
import { shortcutPlatform } from './shortcutDisplay';
import { useEditorStore } from './react';

export const menuCommands = nativeMenuCommands;
const isInput = (target: Element | null) => target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable);

/** Native menus, browser keys and rebinding use the same concrete command IDs. */
export function useCommandController() {
  const store = useEditorStore();
  useEffect(() => {
    const platform = shortcutPlatform();
    let lastMenuContext: boolean | undefined;
    function updateMenuContext() {
      const state = store.getState();
      // A modal recorder or text input must receive its own keystrokes before native accelerators.
      const enabled = !state.ui.dialog && !state.ui.paletteOpen && !isInput(document.activeElement);
      if (enabled !== lastMenuContext) { lastMenuContext = enabled; window.squidware?.setMenuShortcutsEnabled?.(enabled); }
    }
    function menuAction(action: string) {
      const state = store.getState();
      if (state.ui.paletteOpen) { if (action === 'commands') store.setValue('ui', 'paletteOpen', false); return; }
      const editing = isInput(document.activeElement);
      if (editing && ['undo', 'redo', 'select-all'].includes(action)) {
        document.execCommand(action === 'select-all' ? 'selectAll' : action); return;
      }
      if (state.ui.dialog) return;
      const command = menuCommands[action as keyof typeof menuCommands];
      if (!command) return;
      if (command.startsWith('file.')) flushSync(() => (document.activeElement as HTMLElement | null)?.blur());
      if (!store.dispatch(command) && command === 'palette.open') store.setValue('ui', 'toast', 'Finish or cancel the pending edit before opening commands.');
    }
    function keyboard(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.getModifierState('AltGraph') || !(event.target instanceof Element)) return;
      const state = store.getState(); const target = event.target;
      const input = isInput(target);
      const id = shortcutForEvent(event, state.preferences.value.shortcutBindings, platform, !!window.squidware);
      if (state.ui.dialog) return;
      if (state.ui.paletteOpen) { if (id === 'palette.open') { event.preventDefault(); store.setValue('ui', 'paletteOpen', false); } return; }
      if (id) {
        const standardFile = id.startsWith('file.') && bindingFromEvent(event, platform) === defaultShortcuts[id];
        if (input && id !== 'palette.open' && !standardFile) return;
        if (event.repeat && !['playback.count-previous', 'playback.count-next'].includes(id)) return;
        if ((event.code === 'Space' || event.key === ' ') && target.closest('button, a[href], [role="button"], .field-stage__svg')) return;
        event.preventDefault();
        if (standardFile) flushSync(() => (document.activeElement as HTMLElement | null)?.blur());
        if (!store.dispatch(id) && id === 'palette.open') store.setValue('ui', 'toast', 'Finish or cancel the pending edit before opening commands.');
        return;
      }
      if (input) return;
      if (event.key === 'Escape') {
        if (state.ui.selectionToolsOpen) { event.preventDefault(); store.dispatch(state.ui.selectionPreview ? 'selection.cancel' : 'selection.close'); return; }
        const cancel = state.ui.formationPreview ? 'formation.cancel' : state.ui.spacingPreview ? 'spacing.cancel' : state.ui.coordinatePreview ? 'coordinates.cancel' : state.ui.transformPreview ? 'transform.cancel' : 'selection.clear';
        event.preventDefault(); store.dispatch(cancel); return;
      }
      if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey && !target.closest('button, a[href], [role="button"]')) {
        const apply = state.ui.selectionPreview ? 'selection.apply' : state.ui.formationPreview ? 'formation.apply' : state.ui.spacingPreview ? 'spacing.apply' : state.ui.coordinatePreview ? 'coordinates.apply' : state.ui.transformPreview ? 'transform.apply' : null;
        if (apply) { event.preventDefault(); store.dispatch(apply); return; }
      }
      if (!event.ctrlKey && !event.metaKey && event.altKey && !target.closest('.field-stage__svg') && isNudgeKey(event.key)) {
        event.preventDefault(); store.dispatch('selection.nudge', { key: event.key, fast: event.shiftKey });
      }
    }
    const unsubscribe = window.squidware?.onMenuAction(menuAction);
    const unsubscribeContext = store.subscribeSelector(state => !!state.ui.dialog || state.ui.paletteOpen, updateMenuContext);
    updateMenuContext();
    document.addEventListener('focusin', updateMenuContext);
    document.addEventListener('focusout', updateMenuContext);
    window.addEventListener('keydown', keyboard);
    return () => { unsubscribe?.(); unsubscribeContext(); document.removeEventListener('focusin', updateMenuContext); document.removeEventListener('focusout', updateMenuContext); window.removeEventListener('keydown', keyboard); };
  }, [store]);
}
