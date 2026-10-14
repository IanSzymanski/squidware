import { commandRegistry } from './commands';
import type { CommandId } from './commands';

export type ShortcutPlatform = 'mac' | 'other';
export function shortcutPlatform(platform = navigator.platform): ShortcutPlatform {
  return /Mac|iPhone|iPad/.test(platform) ? 'mac' : 'other';
}

/** Presentation of the current registry bindings; #65 owns persisted rebinding. */
export function commandKeycaps(id: CommandId, variant?: number, platform = shortcutPlatform(), desktop = !!window.squidware): string[][] {
  const definition = commandRegistry[id];
  // Export is currently a native menu accelerator, not a browser binding.
  if ('shortcutScope' in definition && definition.shortcutScope === 'desktop' && !desktop) return [];
  if (!('shortcut' in definition) || !definition.shortcut) return [];
  const text = definition.shortcut.replace('Ctrl / ⌘', platform === 'mac' ? 'Cmd' : 'Ctrl');
  const groups = text.split(' / ').map(group => group.split(/\s*\+\s*|\s+/).filter(Boolean));
  return variant === undefined ? groups : groups[variant] ? [groups[variant]] : [];
}
