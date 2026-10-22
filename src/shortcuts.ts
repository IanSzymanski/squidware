/** Portable bindings shared by the renderer, preferences codec and native menus. */
export const defaultShortcuts = {
  'palette.open': 'Primary+K',
  'file.new': 'Primary+N', 'file.open': 'Primary+O', 'file.save': 'Primary+S',
  'file.save-as': 'Primary+Shift+S', 'file.export': 'Primary+P',
  'history.undo': 'Primary+Z', 'history.redo': 'Primary+Shift+Z',
  'selection.all': 'Primary+A', 'layout.focus': 'Primary+Shift+F', 'help.open': 'F1',
  'preferences.open': 'Primary+,',
  'tool.box': 'V', 'tool.pan': 'H', 'tool.lasso': 'L',
  'performers.add-dialog': 'A', 'set.new': 'N', 'set.duplicate': 'D', 'set.insert-before': 'Shift+N', 'set.hold': 'Shift+D', 'transform.mirror': 'M',
  'view.toggle': 'T', 'display.paths': 'P', 'display.labels': 'J',
  'field.zoom-in': '=', 'field.zoom-out': '-', 'field.fit': '0',
  'set.previous': '[', 'set.next': ']',
  'playback.toggle': 'Space', 'playback.count-previous': ',', 'playback.count-next': '.',
} as const;
export type ShortcutId = keyof typeof defaultShortcuts;
export type ShortcutBindings = Partial<Record<ShortcutId, string | null>>;
export type ShortcutPlatform = 'mac' | 'other';
export const nativeMenuCommands = {
  new: 'file.new', open: 'file.open', save: 'file.save', 'save-as': 'file.save-as',
  undo: 'history.undo', redo: 'history.redo', 'select-all': 'selection.all',
  'export-pdf': 'file.export', about: 'help.open', shortcuts: 'help.open',
  commands: 'palette.open', preferences: 'preferences.open',
} as const satisfies Record<string, ShortcutId>;
const nativeIds = new Set<string>(Object.values(nativeMenuCommands));
export const shortcutIds = Object.keys(defaultShortcuts) as ShortcutId[];
export function bindingFor(id: ShortcutId, bindings: ShortcutBindings = {}): string | null {
  return Object.hasOwn(bindings, id) ? bindings[id]! : defaultShortcuts[id];
}
export function bindingKeycaps(binding: string | null, platform: ShortcutPlatform): string[][] {
  return binding ? [binding.split('+').map(key => key === 'Primary' ? platform === 'mac' ? 'Cmd' : 'Ctrl' : key)] : [];
}
export function nativeAccelerator(id: ShortcutId, bindings: ShortcutBindings = {}): string | undefined {
  return bindingFor(id, bindings)?.replace('Primary', 'CmdOrCtrl');
}
export function nativeRedoAlias(bindings: ShortcutBindings = {}): string | undefined {
  return bindingFor('history.redo', bindings) === defaultShortcuts['history.redo'] ? 'Ctrl+Y' : undefined;
}
const reserved = new Set([
  'F3', 'F5', 'F6', 'F7', 'F10', 'Primary+Space', 'Primary+Shift+Space', 'Shift+Space',
  ...['Q', 'W', 'T', 'R', 'L', 'D', 'F', 'G', 'H', 'M', 'B', 'J', 'U', 'E', '=', '-', '0'].map(key => `Primary+${key}`),
  ...['Q', 'W', 'T', 'R', 'N', 'B', 'O', 'Delete', 'Escape', 'I', 'J', 'C'].map(key => `Primary+Shift+${key}`),
  ...['C', 'X', 'V'].flatMap(key => [`Primary+${key}`, `Primary+Shift+${key}`]),
]);
const standardOwners: Record<string, ShortcutId> = {
  'Primary+A': 'selection.all', 'Primary+Z': 'history.undo', 'Primary+Shift+Z': 'history.redo',
  'Primary+S': 'file.save', 'Primary+Shift+S': 'file.save-as', 'Primary+O': 'file.open',
  'Primary+N': 'file.new', 'Primary+P': 'file.export', 'Primary+K': 'palette.open',
  'Primary+Y': 'history.redo',
};
export function bindingError(id: ShortcutId, binding: string | null): string | null {
  if (binding === null) return null;
  if (typeof binding !== 'string' || binding.length > 40 || !/^(?:Primary\+)?(?:Shift\+)?(?:[A-Z0-9\[\],.=-]|Space|F(?:[1-9]|10))$/.test(binding))
    return 'Use a letter, digit, punctuation key or F1–F10, optionally with Ctrl/Cmd and Shift. Tab, Enter, Escape, arrows and Alt remain available for navigation and editing.';
  if (reserved.has(binding)) return 'This shortcut is reserved for the browser, operating system or text editing.';
  if (standardOwners[binding] && standardOwners[binding] !== id) return 'This standard shortcut is reserved for its original command.';
  if (nativeIds.has(id) && !binding.startsWith('Primary+') && !(id === 'help.open' && binding === 'F1')) return 'Native menu commands require Ctrl/Cmd so they cannot intercept ordinary typing.';
  return null;
}
export function shortcutConflict(id: ShortcutId, binding: string | null, bindings: ShortcutBindings): ShortcutId | undefined {
  return binding === null ? undefined : shortcutIds.find(other => other !== id && bindingFor(other, bindings) === binding);
}
export function validateShortcutBindings(input: unknown): ShortcutBindings {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length > shortcutIds.length) throw new Error('Invalid shortcut bindings.');
  const result: ShortcutBindings = {};
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(defaultShortcuts, key)) throw new Error(`Unknown shortcut command: ${key}.`);
    const id = key as ShortcutId;
    const error = bindingError(id, value as string | null);
    if (error) throw new Error(error);
    if (value !== defaultShortcuts[id]) result[id] = value as string | null;
  }
  // These defaults were added after shortcut customization shipped. Keep an
  // older user's explicit binding rather than rejecting their preferences.
  for (const id of ['set.new', 'set.insert-before', 'set.hold'] as const) {
    if (!Object.hasOwn(input, id) && Object.entries(result).some(([other, value]) => other !== id && value === defaultShortcuts[id])) result[id] = null;
  }
  for (const id of shortcutIds) if (shortcutConflict(id, bindingFor(id, result), result)) throw new Error(`Shortcut conflict: ${id}. Clear the other binding first.`);
  return result;
}
export interface ShortcutEvent { key: string; code?: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }
export type TextEditAction = 'cut' | 'copy' | 'paste' | 'undo' | 'redo' | 'select-all';
export function textEditAction(event: ShortcutEvent, platform: ShortcutPlatform): TextEditAction | undefined {
  const actions: Record<string, TextEditAction> = { 'Primary+X': 'cut', 'Primary+C': 'copy', 'Primary+V': 'paste', 'Primary+Z': 'undo', 'Primary+Shift+Z': 'redo', 'Primary+A': 'select-all' };
  return actions[bindingFromEvent(event, platform) ?? ''];
}
export function bindingFromEvent(event: ShortcutEvent, platform: ShortcutPlatform): string | null {
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)) return null;
  const primary = platform === 'mac' ? event.metaKey : event.ctrlKey;
  if (event.altKey || (platform === 'mac' ? event.ctrlKey : event.metaKey)) return 'Unsupported modifier';
  // Shift changes the printed punctuation; keep its unshifted key identity.
  const punctuation: Record<string, string> = { BracketLeft: '[', BracketRight: ']', Comma: ',', Period: '.', Minus: '-', Equal: '=' };
  const key = punctuation[event.code ?? ''] ?? (event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key);
  return `${primary ? 'Primary+' : ''}${event.shiftKey ? 'Shift+' : ''}${key}`;
}
export function shortcutForEvent(event: ShortcutEvent, bindings: ShortcutBindings, platform: ShortcutPlatform, desktop: boolean): ShortcutId | undefined {
  const chord = bindingFromEvent(event, platform);
  if (platform === 'other' && chord === 'Primary+Y' && nativeRedoAlias(bindings)) return 'history.redo';
  // Preserve browser printing. A different export binding still opens the app's export dialog.
  return shortcutIds.find(id => bindingFor(id, bindings) === chord && (desktop || id !== 'file.export' || chord !== 'Primary+P'));
}
