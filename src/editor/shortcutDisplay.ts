import type { CommandId } from './commands';
import { bindingFor, bindingKeycaps, defaultShortcuts, nativeRedoAlias, type ShortcutBindings, type ShortcutId, type ShortcutPlatform } from '../shortcuts';
export type { ShortcutPlatform } from '../shortcuts';
export function shortcutPlatform(platform = navigator.platform): ShortcutPlatform {
  return /Mac|iPhone|iPad/.test(platform) ? 'mac' : 'other';
}
/** Parameterized controls display the bindings of their concrete command variants. */
export function commandKeycaps(id: CommandId, variant?: number, platform = shortcutPlatform(), desktop = !!window.squidware, bindings: ShortcutBindings = {}): string[][] {
  let groups: string[][];
  if (id === 'selection.nudge') groups = [['Alt', 'Arrow'], ['Shift', 'Alt', 'Arrow']];
  else if (id === 'selection.clear') groups = [['Esc']];
  else {
    const ids: ShortcutId[] = id === 'tool.select' ? ['tool.box', 'tool.pan', 'tool.lasso'] : id === 'set.select' ? ['set.previous', 'set.next'] : Object.hasOwn(defaultShortcuts, id) ? [id as ShortcutId] : [];
    // Preserve variant indices when an earlier variant is unbound.
    groups = ids.map(key => key === 'file.export' && !desktop && bindingFor(key, bindings) === 'Primary+P' ? [] : bindingKeycaps(bindingFor(key, bindings), platform)[0] ?? []);
  }
  if (id === 'history.redo' && platform === 'other' && nativeRedoAlias(bindings)) groups.push(['Ctrl', 'Y']);
  return (variant === undefined ? groups : groups[variant] ? [groups[variant]] : []).filter(keys => keys.length);
}
