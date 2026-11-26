import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
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

const GROUPS = ['Selection', 'Shape and arrange', 'Motion', 'Sets', 'Playback and music', 'Checks', 'View', 'Production'] as const;
/** What a writer most likely wants next, given what is selected. Only the ones that can run are shown. */
const suggestions = (selected: number): readonly string[] => selected > 1 ? ['formation.preview', 'spacing.preview', 'transform.preview', 'coordinates.preview']
  : selected === 1 ? ['coordinates.preview', 'path.open', 'path.draw-open', 'schedule.open']
  : ['selection.all', 'set.new', 'playback.toggle', 'cast.add-open', 'file.open'];
const suggestedTitle = (selected: number) => selected > 1 ? `For the ${selected} selected` : selected === 1 ? 'For this performer' : 'Start here';
/** Where a command belongs when the palette is browsed rather than searched. */
function paletteGroup(entry: PaletteEntry): typeof GROUPS[number] {
  const id = entry.invocation.id;
  if (/^(set|sheet)\./.test(id)) return 'Sets';
  if (/^selection\./.test(id) || id === 'group.select' || id === 'group.create') return 'Selection';
  if (/^tool\./.test(id)) return 'View';
  if (/^(formation|transform|spacing|coordinates|live|assignment|drill|positions)\./.test(id)) return 'Shape and arrange';
  if (/^(path|schedule|routes|group|transition|choreography|staging)\./.test(id)) return 'Motion';
  if (/^(playback|metronome|rehearsal|audio|tempo|score)\./.test(id)) return 'Playback and music';
  if (/^analysis\./.test(id)) return 'Checks';
  if (/^(view|display|field|workspace|layout|cast)\./.test(id)) return 'View';
  return 'Production';
}

export function CommandPalette() {
  const store = useEditorStore(); const state = useEditorSelector(state => state);
  const [query, setQuery] = useState(''); const [active, setActive] = useState(0); const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null); const list = useId(); const help = useId(); const detail = useId();
  const { phrase, resolved, entries: matches } = paletteQuery(state, query);
  // With nothing typed, the list is a map of the app: commands grouped by what the writer is doing.
  const browsing = !query.trim();
  // One row per set or section would bury the commands, and so would everything that cannot run right now;
  // typing still finds all of them, with the reason beside any that are unavailable.
  const entries = useMemo(() => {
    if (!browsing) return matches;
    const open = matches.filter(entry => !entry.disabledReason && !['set.select', 'selection.section', 'group.select'].includes(entry.invocation.id));
    const suggested = suggestions(state.selection.selectedIds.length).flatMap(id => open.filter(entry => entry.invocation.id === id)).slice(0, 7);
    const lead = new Set(suggested);
    return [...suggested, ...open.filter(entry => !lead.has(entry))
      .sort((a, b) => GROUPS.indexOf(paletteGroup(a)) - GROUPS.indexOf(paletteGroup(b)) || a.name.localeCompare(b.name))];
  }, [matches, browsing, state.selection.selectedIds.length]);
  const suggestedCount = browsing ? suggestions(state.selection.selectedIds.length).reduce((n, id) => n + entries.filter(entry => entry.invocation.id === id).length, 0) : 0;
  const leading = Math.min(7, suggestedCount);
  const groupOf = (index: number) => index < leading ? 'Suggested' : paletteGroup(entries[index]);
  const current = Math.min(active, Math.max(0, entries.length - 1)), selected = entries[current];
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
  return <Modal title="Command palette" className="command-palette" onClose={close}>
    <label className="palette-search"><Search size={17} aria-hidden="true" /><input ref={input} role="combobox" aria-label="Search commands or drill phrases" placeholder="Search actions, or type a drill phrase like “move 4 forward”" aria-expanded={!phrase} aria-controls={phrase ? undefined : list} aria-activedescendant={entries.length ? `${list}-${current}` : undefined} aria-autocomplete="list" aria-describedby={help} autoComplete="off" spellCheck={false} maxLength={DRILL_ENTRY_LIMIT} value={query}
      onChange={event => { setQuery(event.target.value); setActive(0); setError(''); }} onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) && !phrase && entries.length) {
          // Home/End retain normal caret navigation; Ctrl/Cmd+Home/End navigate the result list.
          if (['Home', 'End'].includes(event.key) && !event.ctrlKey && !event.metaKey) return;
          event.preventDefault(); setActive(event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length);
        }
        if (event.key === 'Enter') { event.preventDefault(); if (phrase) preview(); else if (entries[current]) run(entries[current]); }
      }} /><kbd>Esc</kbd></label>
    <span id={help} className="sr-only">Up and Down explore results. Enter runs or previews. Escape closes. Tab moves between controls.</span>
    {error && <p className="field-error" role="alert">{error}</p>}
    {phrase ? <div className="palette-phrase">
      <h3>Drill phrase preview</h3><p role="status" className={resolved?.error ? 'field-error' : ''}>{resolved?.error ?? resolved?.plan?.summary}</p>
      <p className="microcopy">Bare distances mean production steps ({(state.project.present.snapping ?? DEFAULT_SNAPPING).steps}-to-5). Forward is toward the front sideline; right is toward Side 2. Interval defaults to a center anchor. Exact moves bypass snapping and reject field crossings.</p>
      <button className="button primary" disabled={!resolved?.plan} onClick={preview}>Preview on field</button>
    </div> : <div className="palette-results"><div role="listbox" aria-label="Commands" id={list} className="palette-list">
      {entries.map((entry, index) => <Fragment key={entry.key}>{browsing && (index === 0 || groupOf(index - 1) !== groupOf(index)) && <div className="palette-group" role="presentation">{groupOf(index) === 'Suggested' ? suggestedTitle(state.selection.selectedIds.length) : groupOf(index)}</div>}<button id={`${list}-${index}`} role="option" aria-selected={index === current} aria-disabled={!!entry.disabledReason} aria-describedby={index === current ? detail : undefined} className={`palette-result${index === current ? ' palette-result--active' : ''}`} onMouseMove={() => setActive(index)} type="button" tabIndex={index === current ? 0 : -1} aria-label={entry.name} onFocus={() => setActive(index)} onClick={() => run(entry)} onKeyDown={event => {
          if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault(); const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length; setActive(next);
          document.getElementById(`${list}-${next}`)?.focus();
        }}>
          <strong className="palette-name">{entry.name}</strong>
          <Keycaps groups={commandKeycaps(entry.invocation.id, undefined, undefined, undefined, state.preferences.value.shortcutBindings)} />
      </button></Fragment>)}
      {!entries.length && <p className="empty-state" role="status">No matching commands. Try an action name or a drill phrase below.</p>}
    </div>
      {/* One fixed-height detail region for the active result: rows never expand, so hover cannot shift the list. */}
      {selected && <p className="palette-detail" id={detail}><span className="palette-description">{selected.description}</span>{selected.disabledReason && <> <span className="palette-unavailable"><strong>Unavailable:</strong> {selected.disabledReason}</span></>}</p>}
    </div>}
    <div className="palette-footer"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> run</span><details className="palette-examples"><summary>Drill phrases</summary><p>move 4 forward<br />mirror across 50<br />interval 2 steps horizontal<br />place B1 at Side 1: on the 40; on front hash</p><p className="microcopy">Move, mirror and interval use the selection. Place names one performer, both axes and the side.</p></details></div>
  </Modal>;
}
