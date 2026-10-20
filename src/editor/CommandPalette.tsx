import { useEffect, useId, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Modal } from '../components/Modal';
import { Keycaps } from '../components/Tooltip';
import { DRILL_ENTRY_LIMIT } from '../drillEntry';
import { DEFAULT_SNAPPING } from '../snapping';
import { drillPlan } from './drillCommands';
import { paletteQuery, commandUnavailable, type PaletteEntry } from './paletteCommands';
import { commandKeycaps } from './shortcutDisplay';
import { useEditorSelector, useEditorStore } from './react';
import './commands.css';

export function CommandPalette() {
  const store = useEditorStore(); const state = useEditorSelector(state => state);
  const [query, setQuery] = useState(''); const [active, setActive] = useState(0); const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null); const list = useId(); const help = useId();
  const { phrase, resolved, entries } = paletteQuery(state, query);
  const current = Math.min(active, Math.max(0, entries.length - 1));
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { document.getElementById(`${list}-${current}`)?.scrollIntoView({ block: 'nearest' }); }, [current, list]);
  const close = () => store.setValue('ui', 'paletteOpen', false);
  function run(entry: PaletteEntry) {
    const reason = commandUnavailable(store.getState(), entry.invocation);
    if (reason) { setError(reason); return; }
    close();
    void store.dispatch(entry.invocation.id, entry.invocation.args);
  }
  function preview() {
    const result = drillPlan(store.getState(), query);
    if (!result.plan) { setError(result.error!); return; }
    close(); void store.dispatch('drill.preview', { text: query });
  }
  return <Modal title="Command palette" onClose={close}>
    <p className="modal-intro">Search an action or type a drill phrase. Drill phrases open a field preview before Apply.</p>
    <label className="palette-search"><Search size={18} aria-hidden="true" /><input ref={input} role="combobox" aria-label="Search commands or drill phrases" placeholder="Search commands or type move 4 forward" aria-expanded={!phrase} aria-controls={phrase ? undefined : list} aria-activedescendant={entries.length ? `${list}-${current}` : undefined} aria-autocomplete="list" aria-describedby={help} autoComplete="off" spellCheck={false} maxLength={DRILL_ENTRY_LIMIT} value={query}
      onChange={event => { setQuery(event.target.value); setActive(0); setError(''); }} onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) && !phrase && entries.length) {
          // Home/End retain normal caret navigation; Ctrl/Cmd+Home/End navigate the result list.
          if (['Home', 'End'].includes(event.key) && !event.ctrlKey && !event.metaKey) return;
          event.preventDefault(); setActive(event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length);
        }
        if (event.key === 'Enter') { event.preventDefault(); if (phrase) preview(); else if (entries[current]) run(entries[current]); }
      }} /></label>
    <p className="microcopy" id={help}>↑ / ↓ explore · Enter runs or previews · Escape closes · Tab moves between controls</p>
    {error && <p className="field-error" role="alert">{error}</p>}
    {phrase ? <div className="palette-phrase">
      <h3>Drill phrase preview</h3><p role="status" className={resolved?.error ? 'field-error' : ''}>{resolved?.error ?? resolved?.plan?.summary}</p>
      <p className="microcopy">Bare distances mean production steps ({(state.project.present.snapping ?? DEFAULT_SNAPPING).steps}-to-5). Forward is toward the front sideline; right is toward Side 2. Interval defaults to a center anchor. Exact moves bypass snapping and reject field crossings.</p>
      <button className="button primary" disabled={!resolved?.plan} onClick={preview}>Preview on field</button>
    </div> : <div role="listbox" aria-label="Commands" id={list} className="palette-results">
      {entries.map((entry, index) => <button key={entry.key} id={`${list}-${index}`} role="option" aria-selected={index === current} aria-disabled={!!entry.disabledReason} className={`palette-result${index === current ? ' palette-result--active' : ''}`} onMouseMove={() => setActive(index)} type="button" tabIndex={index === current ? 0 : -1} aria-label={entry.name} onFocus={() => setActive(index)} onClick={() => run(entry)} onKeyDown={event => {
          if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault(); const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length; setActive(next);
          document.getElementById(`${list}-${next}`)?.focus();
        }}>
          <span><strong>{entry.name}</strong><span className="palette-description">{entry.description}</span>{entry.disabledReason && <span className="palette-unavailable">Unavailable: {entry.disabledReason}</span>}</span>
          <Keycaps groups={commandKeycaps(entry.invocation.id, undefined, undefined, undefined, state.preferences.value.shortcutBindings)} />
      </button>)}
      {!entries.length && <p className="empty-state" role="status">No matching commands. Try an action name or a drill phrase below.</p>}
    </div>}
    <details className="palette-examples"><summary>Drill phrase examples</summary><p>move 4 forward<br />mirror across 50<br />interval 2 steps horizontal<br />place B1 at Side 1: on the 40; on front hash</p><p className="microcopy">Move, mirror and interval use the explicit selection. Place uses an exact performer label. Name both coordinate axes and the side; incomplete phrases leave the production unchanged.</p></details>
  </Modal>;
}
