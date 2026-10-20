import { describe, expect, it } from 'vitest';
import { commandKeycaps, shortcutPlatform } from './shortcutDisplay';
import { nativeAccelerator } from '../shortcuts';

describe('current shortcut presentation', () => {
  it('uses the platform modifier in each command’s keycaps', () => {
    expect(shortcutPlatform('MacIntel')).toBe('mac');
    expect(shortcutPlatform('Win32')).toBe('other');
    expect(commandKeycaps('file.save', undefined, 'mac', true)).toEqual([['Cmd', 'S']]);
    expect(commandKeycaps('history.redo', undefined, 'other', true)).toEqual([['Ctrl', 'Shift', 'Z'], ['Ctrl', 'Y']]);
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
  it('shows persisted bindings in tooltips, variants and native menus without shifting unbound variants', () => {
    const bindings = { 'file.save': 'Primary+Shift+U', 'tool.box': null };
    expect(commandKeycaps('file.save', undefined, 'mac', true, bindings)).toEqual([['Cmd', 'Shift', 'U']]);
    expect(nativeAccelerator('file.save', bindings)).toBe('CmdOrCtrl+Shift+U');
    expect(commandKeycaps('tool.select', 0, 'other', true, bindings)).toEqual([]);
    expect(commandKeycaps('tool.select', 1, 'other', true, bindings)).toEqual([['H']]);
  });
});
