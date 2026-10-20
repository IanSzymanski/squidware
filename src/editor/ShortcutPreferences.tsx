import { useState } from 'react';
import { Keycaps } from '../components/Tooltip';
import { bindingError, bindingFor, bindingFromEvent, bindingKeycaps, defaultShortcuts, shortcutConflict, shortcutIds, type ShortcutId } from '../shortcuts';
import { commandRegistry } from './commands';
import { shortcutPlatform } from './shortcutDisplay';
import type { EditorController } from './useEditorController';
import './commands.css';

export function ShortcutPreferences({ preferences }: { preferences: EditorController['preferences'] }) {
  const [query, setQuery] = useState(''); const [recording, setRecording] = useState<ShortcutId | null>(null); const [error, setError] = useState('');
  const bindings = preferences.value.shortcutBindings; const platform = shortcutPlatform();
  function assign(id: ShortcutId, value: string | null) {
    const invalid = bindingError(id, value); const conflict = shortcutConflict(id, value, bindings);
    if (invalid || conflict) { setError(invalid ?? `Already used by ${commandRegistry[conflict!].name}. Clear that binding first.`); setRecording(null); return; }
    const next = { ...bindings, [id]: value };
    if (value === defaultShortcuts[id]) delete next[id];
    preferences.update({ shortcutBindings: next }); setRecording(null); setError('');
  }
  return <details className="shortcut-preferences"><summary>Keyboard shortcuts</summary>
    <p className="microcopy">Choose a binding, then press its new keys. Clear removes it; Reset restores it. Navigation keys, Alt+arrows, text editing and reserved browser/OS shortcuts are protected. Tab keeps normal focus navigation. Native menu commands require Ctrl/Cmd.</p>
    <label className="form-label">Find a shortcut<input type="search" aria-label="Find a shortcut" value={query} onChange={e => setQuery(e.target.value)} /></label>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="shortcut-bindings">{shortcutIds.filter(id => commandRegistry[id].name.toLowerCase().includes(query.toLowerCase())).map(id => <div className="shortcut-binding" key={id}>
      <span>{commandRegistry[id].name}</span>
      <button className="button subtle shortcut-record" aria-label={`Change shortcut: ${commandRegistry[id].name}`} aria-pressed={recording === id} onClick={() => { setRecording(recording === id ? null : id); setError(''); }} onBlur={() => { if (recording === id) setRecording(null); }} onKeyDown={event => {
        if (recording !== id || event.nativeEvent.isComposing) return;
        if (event.key === 'Tab') { setRecording(null); return; }
        event.preventDefault(); event.stopPropagation();
        if (event.key === 'Escape') { setRecording(null); return; }
        const binding = bindingFromEvent(event, platform); if (binding) assign(id, binding);
      }}>{recording === id ? 'Press new keys…' : bindingFor(id, bindings) ? <Keycaps groups={bindingKeycaps(bindingFor(id, bindings), platform)} /> : 'Unbound'}</button>
      <button className="button subtle" aria-label={`Clear shortcut: ${commandRegistry[id].name}`} onClick={() => assign(id, null)}>Clear</button>
      <button className="button subtle" aria-label={`Reset shortcut: ${commandRegistry[id].name}`} onClick={() => assign(id, defaultShortcuts[id])}>Reset</button>
    </div>)}</div>
    <button className="button subtle" onClick={() => { preferences.update({ shortcutBindings: {} }); setRecording(null); setError(''); }}>Reset all shortcuts</button>
  </details>;
}
