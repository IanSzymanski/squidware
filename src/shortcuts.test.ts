import { describe, expect, it } from 'vitest';
import { bindingFor, bindingFromEvent, bindingKeycaps, defaultShortcuts, nativeAccelerator, shortcutForEvent, textEditAction, validateShortcutBindings } from './shortcuts';
import { validatePreferences } from './preferences';

const event = (key: string, extra = {}) => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...extra });
describe('portable shortcut bindings', () => {
  it('migrates old preferences and rejects collisions against defaults or other overrides', () => {
    expect(validatePreferences({ version: 1 }).shortcutBindings).toEqual({});
    expect(validateShortcutBindings({ 'tool.box': 'V' })).toEqual({});
    expect(() => validateShortcutBindings({ 'tool.box': 'H' })).toThrow(/conflict/);
    expect(() => validateShortcutBindings({ 'tool.box': 'F2', 'tool.pan': 'F2' })).toThrow(/conflict/);
    const bindings = validateShortcutBindings({ 'tool.box': null, 'tool.pan': 'V' });
    expect(bindingFor('tool.box', bindings)).toBeNull(); expect(bindingFor('tool.pan', bindings)).toBe('V');
  });
  it('protects navigation, text editing and reserved OS/browser chords including native single-letter accelerators', () => {
    for (const chord of ['Tab', 'Enter', 'Escape', 'ArrowLeft', 'Alt+F4', 'Primary+Q', 'Primary+W', 'Primary+R', 'Primary+V', 'Primary+Shift+V', 'Primary+Shift+I', 'F11', 'F12', 'Primary+S']) expect(() => validateShortcutBindings({ 'tool.box': chord })).toThrow();
    expect(() => validateShortcutBindings({ 'file.save': 'S' })).toThrow(/typing/);
    for (const input of [null, [], 3, { invented: 'F2' }, { 'tool.box': 1 }, { 'tool.box': undefined }]) expect(() => validateShortcutBindings(input)).toThrow();
  });
  it('normalizes platform modifiers and shifted punctuation, leaving AltGraph and unsupported modifiers alone', () => {
    expect(bindingFromEvent(event('k', { metaKey: true }), 'mac')).toBe('Primary+K');
    expect(bindingFromEvent(event('k', { ctrlKey: true }), 'other')).toBe('Primary+K');
    expect(bindingFromEvent(event('+', { code: 'Equal', shiftKey: true }), 'other')).toBe('Shift+=');
    expect(shortcutForEvent(event('k', { ctrlKey: true }), {}, 'mac', true)).toBeUndefined();
    expect(shortcutForEvent(event('v', { altKey: true }), {}, 'other', true)).toBeUndefined();
    expect(shortcutForEvent(event('Tab'), {}, 'other', true)).toBeUndefined();
  });
  it('moves key dispatch, keycaps and native accelerators together; clearing removes the old chord', () => {
    const bindings = validateShortcutBindings({ 'file.save': 'Primary+Shift+U', 'tool.box': null });
    expect(shortcutForEvent(event('s', { ctrlKey: true }), bindings, 'other', true)).toBeUndefined();
    expect(shortcutForEvent(event('U', { ctrlKey: true, shiftKey: true }), bindings, 'other', true)).toBe('file.save');
    expect(nativeAccelerator('file.save', bindings)).toBe('CmdOrCtrl+Shift+U');
    expect(bindingKeycaps(bindingFor('file.save', bindings), 'mac')).toEqual([['Cmd', 'Shift', 'U']]);
    expect(shortcutForEvent(event('v'), bindings, 'other', true)).toBeUndefined();
    expect(shortcutForEvent(event('p', { ctrlKey: true }), {}, 'other', false)).toBeUndefined();
    expect(shortcutForEvent(event('p', { ctrlKey: true }), {}, 'other', true)).toBe('file.export');
    expect(validateShortcutBindings(Object.fromEntries(Object.entries(defaultShortcuts)))).toEqual({});
  });
  it('keeps native text editing on standard keys independently of rebindings', () => {
    expect(textEditAction(event('c', { metaKey: true }), 'mac')).toBe('copy');
    expect(textEditAction(event('A', { metaKey: true }), 'mac')).toBe('select-all');
    expect(textEditAction(event('Z', { metaKey: true, shiftKey: true }), 'mac')).toBe('redo');
    expect(textEditAction(event('c', { ctrlKey: true }), 'mac')).toBeUndefined();
    expect(textEditAction(event('v'), 'mac')).toBeUndefined();
    expect(textEditAction(event('v', { metaKey: true, shiftKey: true }), 'mac')).toBeUndefined();
  });
});
