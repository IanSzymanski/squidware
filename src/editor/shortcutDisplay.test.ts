import { describe, expect, it } from 'vitest';
import { commandKeycaps, shortcutPlatform } from './shortcutDisplay';
import { commandRegistry } from './commands';

describe('current shortcut presentation', () => {
  it('uses the platform modifier in each command’s keycaps', () => {
    expect(shortcutPlatform('MacIntel')).toBe('mac');
    expect(shortcutPlatform('Win32')).toBe('other');
    expect(commandKeycaps('file.save', undefined, 'mac', true)).toEqual([['Cmd', 'S']]);
    expect(commandKeycaps('history.redo', undefined, 'other', true)).toEqual([['Ctrl', 'Shift', 'Z']]);
    expect(commandKeycaps('selection.nudge', undefined, 'mac', true)).toEqual([['Alt', 'Arrow'], ['Shift', 'Alt', 'Arrow']]);
  });
  it('only advertises existing bindings and the appropriate tool/navigation variant', () => {
    expect(commandKeycaps('file.export', undefined, 'other', false)).toEqual([]);
    expect(commandKeycaps('file.export', undefined, 'mac', true)).toEqual([['Cmd', 'P']]);
    expect(commandKeycaps('formation.apply', undefined, 'other', true)).toEqual([]);
    expect(commandKeycaps('tool.select', 0, 'other', true)).toEqual([['V']]);
    expect(commandKeycaps('tool.select', 1, 'other', true)).toEqual([['H']]);
    expect(commandKeycaps('tool.select', 2, 'other', true)).toEqual([['L']]);
    expect(commandKeycaps('set.select', 1, 'other', true)).toEqual([[']']]);
  });
  it('reads the registry rather than maintaining a second help/tooltip key map', () => {
    const original = commandRegistry['file.save'].shortcut;
    try {
      commandRegistry['file.save'].shortcut = 'Ctrl / ⌘ Shift S';
      expect(commandKeycaps('file.save', undefined, 'mac', true)).toEqual([['Cmd', 'Shift', 'S']]);
    } finally { commandRegistry['file.save'].shortcut = original; }
  });
});
