import { useEffect } from 'react';
import { flushSync } from 'react-dom';
import type { CommandId } from './commands';
import { useEditorStore } from './react';

export const menuCommands = {
  new: 'file.new', open: 'file.open', save: 'file.save', 'save-as': 'file.save-as',
  undo: 'history.undo', redo: 'history.redo', 'select-all': 'selection.all',
  'export-pdf': 'file.export', about: 'help.open', shortcuts: 'help.open',
} as const satisfies Record<string, CommandId>;

/** Native menus and browser shortcuts share the same typed editor command entry point. */
export function useCommandController() {
  const store = useEditorStore();
  useEffect(() => {
    function menuAction(action: string) {
      const focused = document.activeElement as HTMLElement | null;
      const editing = focused && (/^(INPUT|TEXTAREA)$/.test(focused.tagName) || focused.isContentEditable);
      if (editing && ['undo', 'redo', 'select-all'].includes(action)) {
        document.execCommand(action === 'select-all' ? 'selectAll' : action); return;
      }
      if (['new', 'export-pdf', 'about', 'shortcuts'].includes(action)) flushSync(() => (document.activeElement as HTMLElement | null)?.blur());
      const command = menuCommands[action as keyof typeof menuCommands];
      if (command) void store.dispatch(command);
    }
    function keyboard(event: KeyboardEvent) {
      const state = store.getState();
      const target = event.target as HTMLElement;
      const input = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
      if (state.ui.dialog) return;
      const cmd = event.ctrlKey || event.metaKey; const key = event.key.toLowerCase();
      if (cmd && ['s', 'o', 'n'].includes(key)) {
        if (window.squidware) return;
        event.preventDefault(); menuAction(key === 's' ? event.shiftKey ? 'save-as' : 'save' : key === 'o' ? 'open' : 'new'); return;
      }
      if (input) return;
      if (cmd && key === 'z') { event.preventDefault(); if (!window.squidware) menuAction(event.shiftKey ? 'redo' : 'undo'); return; }
      if (cmd && key === 'a') { event.preventDefault(); store.dispatch('selection.all'); }
      else if (event.code === 'Space') {
        if (target.closest('button, a[href], [role="button"]')) return;
        event.preventDefault(); if (!store.dispatch('playback.toggle')) store.setValue('ui', 'toast', 'Add a second set to rehearse a transition.');
      } else if (event.key === 'Escape') store.dispatch(state.ui.transformPreview ? 'transform.cancel' : 'selection.clear');
      else if (key === 'v' || key === 'h') store.dispatch('tool.select', { tool: key === 'v' ? 'select' : 'pan' });
      else if (!cmd && event.altKey && !target.closest('.field-stage__svg') && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && state.selection.selectedIds.length) {
        event.preventDefault(); const step = event.shiftKey ? state.preferences.value.fastNudgeStep : state.preferences.value.nudgeStep;
        store.dispatch('selection.transform', { index: state.selection.activeIndex, ids: state.selection.selectedIds,
          options: { dx: event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, dy: event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0 } });
      } else if (event.key === '[' || event.key === ']') store.dispatch('set.select', { index: state.selection.activeIndex + (event.key === '[' ? -1 : 1) });
    }
    const unsubscribe = window.squidware?.onMenuAction(menuAction);
    window.addEventListener('keydown', keyboard);
    return () => { unsubscribe?.(); window.removeEventListener('keydown', keyboard); };
  }, [store]);
}
