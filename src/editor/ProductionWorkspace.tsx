import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { ArrowRight, AudioLines, ClipboardPaste, Music, Plus, Timer, WrapText } from 'lucide-react';
import { countToSeconds, PROJECT_LIMITS } from '../domain';
import { Modal } from '../components/Modal';
import { Tooltip } from '../components/Tooltip';
import { HelpButton, useShowHints } from './ControlHelp';
import { parseSheetText, reviewSheetRange, sheetLabels, sheetValue, type SheetEdit } from './productionSheet';
import type { EditorController } from './useEditorController';
import './productionSheet.css';
import { compileScore, scoreLabel, scorePosition } from '../score';
import { meterText } from '../meter';

type Cell = { row: number; column: number };
type Draft = Cell & { text: string; revision: number; epoch: number };
type Paste = Cell & { text: string; revision: number; epoch: number };
const same = (a: Cell | null, b: Cell) => a?.row === b.row && a.column === b.column;
const numeric = (column: number) => column === 1 || column === 2;
/** One line per column, shared by the header tooltip and the status line while a cell is being edited. */
const columnHints = (tempoMap: boolean) => [
  'The name printed on field charts and dot books.',
  'Counts of the move into the set. The opening set has no move, so it stays 0.',
  tempoMap ? 'Written tempo of the move into the set. The tempo map plays its ramps and fermatas over these base values.' : 'Tempo of the move into the set, in beats per minute.',
  'Rehearsal notes, printed under the set’s field chart. Shift+Enter adds a line.',
  'Blank keeps the meter above. Enter a time signature such as 4/4, 6/8 or 7/8:2+2+3 where it changes.',
  'A rehearsal mark at the count where the set arrives.',
];

export function ProductionWorkspace({ controller }: { controller: EditorController }) {
  const { project, duration, dispatch, store, setPendingDraft } = controller;
  const [cursor, setCursor] = useState<Cell>({ row: controller.index, column: 0 });
  const [draft, setDraftState] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const [paste, setPaste] = useState<Paste | null>(null);
  const [error, setError] = useState('');
  const [wrap, setWrap] = useState(false);
  const table = useRef<HTMLDivElement>(null);
  function setDraft(value: Draft | null) { draftRef.current = value; setDraftState(value); }
  useEffect(() => () => { setPendingDraft(false, 'sheet-cell'); setPendingDraft(false, 'sheet-preview'); }, [setPendingDraft]);
  const score = useMemo(()=>compileScore(project),[project]);
  // The count each set arrives on, for its score position and musical anchors.
  const starts = useMemo(() => { let count = 0; return project.sets.map((_, row) => row ? count += project.moves[row - 1]?.counts ?? 0 : 0); }, [project.sets, project.moves]);
  const showHints = useShowHints();
  const hints = columnHints(!!project.tempoMap);
  const seconds = Math.round(countToSeconds(project, duration));
  const current = { row: Math.min(cursor.row, project.sets.length - 1), column: cursor.column };
  function focus(cell: Cell) {
    setCursor(cell);
    requestAnimationFrame(() => {
      const input = table.current?.querySelector<HTMLElement>(`[data-row="${cell.row}"][data-column="${cell.column}"]`);
      input?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); input?.focus({ preventScroll: true });
    });
  }
  function commit() {
    const d = draftRef.current;
    if (!d) return true;
    const p = store.getState().project.present;
    if (d.row < p.sets.length && d.text === sheetValue(p, d.row, d.column)) {
      setDraft(null); setError(''); setPendingDraft(false, 'sheet-cell'); return true;
    }
    const range: SheetEdit = { row: d.row, column: d.column, cells: [[d.text]], revision: d.revision, epoch: d.epoch };
    const review = reviewSheetRange(p, range, controller.preferences.value.newSetCounts);
    if (review.errors.length) { setError(review.errors.join(' ')); return false; }
    setPendingDraft(false, 'sheet-cell');
    if (dispatch('sheet.apply', range) !== true) {
      setPendingDraft(true, 'sheet-cell'); setError('The production changed. Copy your draft or press Escape, then retry.'); return false;
    }
    setDraft(null); setError(''); return true;
  }
  function begin(cell: Cell) {
    if (same(draftRef.current, cell)) return;
    if (!commit()) return;
    if (store.getState().ui.pendingDraft) { setError('Finish or cancel the other pending input before editing the sheet.'); return; }
    setCursor(cell); dispatch('set.select', { index: cell.row });
    const s = store.getState();
    setDraft({ ...cell, text: sheetValue(s.project.present, cell.row, cell.column), revision: s.project.revision, epoch: s.ui.projectEpoch });
  }
  function move(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, cell: Cell) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); setPendingDraft(false, 'sheet-cell'); setDraft(null); setError(''); return;
    }
    const step = event.shiftKey ? -1 : 1;
    let target: Cell | undefined;
    if (event.key === 'Tab') {
      const next = cell.row * sheetLabels.length + cell.column + step;
      if (next >= 0 && next < project.sets.length * sheetLabels.length) target = { row: Math.floor(next / sheetLabels.length), column: next % sheetLabels.length };
    } else if (event.key === 'Enter' && !(cell.column === 3 && event.shiftKey)) target = { ...cell, row: Math.max(0, Math.min(project.sets.length - 1, cell.row + step)) };
    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') target = { ...cell, row: Math.max(0, Math.min(project.sets.length - 1, cell.row + (event.key === 'ArrowUp' ? -1 : 1))) };
    else if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) target = { ...cell, column: Math.max(0, Math.min(sheetLabels.length - 1, cell.column + (event.key === 'ArrowLeft' ? -1 : 1))) };
    else return;
    if (!commit()) { event.preventDefault(); event.stopPropagation(); return; }
    if (target) { event.preventDefault(); event.stopPropagation(); focus(target); }
  }
  function openPaste(text = '', cell = current) {
    if (!commit() || store.getState().ui.pendingDraft) { setError('Finish or cancel the pending input before pasting a range.'); return; }
    const s = store.getState();
    if (dispatch('dialog.open', { dialog: 'sheet-paste' }) !== true) return;
    setPaste({ ...cell, text, revision: s.project.revision, epoch: s.ui.projectEpoch });
    setPendingDraft(true, 'sheet-preview'); setError('');
  }
  function closePaste() {
    setPendingDraft(false, 'sheet-preview'); setPaste(null); dispatch('dialog.open', { dialog: null }); focus(current);
  }
  let review: ReturnType<typeof reviewSheetRange> | null = null, parseError = '';
  if (paste) {
    try { review = reviewSheetRange(project, { ...paste, cells: parseSheetText(paste.text) }, controller.preferences.value.newSetCounts); }
    catch (e) { parseError = (e as Error).message; }
  }
  const stale = !!paste && (paste.revision !== store.getState().project.revision || paste.epoch !== controller.projectEpoch);
  function applyPaste() {
    if (!paste || !review || review.errors.length || stale) return;
    setPendingDraft(false, 'sheet-preview');
    if (dispatch('sheet.apply', { ...paste, cells: parseSheetText(paste.text) }) !== true) {
      setPendingDraft(true, 'sheet-preview'); setError(store.getState().ui.toast || 'Finish the current edit before applying.'); return;
    }
    closePaste();
  }
  return <section className="production-workspace sheet-workspace" aria-label="Editable production sheet">
    <div className="sheet-toolbar">
      <p className="sheet-summary">
        <span><strong>{project.sets.length}</strong> {project.sets.length === 1 ? 'set' : 'sets'}</span>
        <span><strong>{duration}</strong> {duration === 1 ? 'count' : 'counts'}</span>
        <Tooltip name="Running time" description={project.tempoMap ? 'The length of the show with the tempo map’s ramps and fermatas.' : 'The length of the show at the written tempos.'}><span><strong>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</strong> <span className="sheet-summary-unit">running time</span></span></Tooltip>
      </p>
      <HelpButton command="sheet.append" title="Append sheet row" disabled={controller.pendingDraft || project.sets.length >= PROJECT_LIMITS.sets} disabledReason={`Finish the pending input first. The sheet supports at most ${PROJECT_LIMITS.sets} sets.`} className="button" onClick={() => { if (dispatch('sheet.append') === true) focus({ row: store.getState().project.present.sets.length - 1, column: 0 }); }}><Plus size={14} />Add set</HelpButton>
      <HelpButton title="Paste spreadsheet range" description="Review CSV or TSV starting at the focused cell. Use Name, Counts, BPM, Notes, Meter, Mark without a header row." className="button subtle sheet-tool sheet-tool--compact" onClick={() => openPaste()}><ClipboardPaste size={14} /><span className="sheet-tool-label">Paste range</span></HelpButton>
      <span className="divider-vertical" />
      <HelpButton command="score.open" title="Score map" className="button subtle sheet-tool sheet-tool--optional" onClick={() => dispatch('score.open')}><Music size={14} /><span className="sheet-tool-label">Score map</span></HelpButton>
      <HelpButton command="tempo.open" title="Tempo map" className="button subtle sheet-tool sheet-tool--optional" onClick={() => dispatch('tempo.open')}><Timer size={14} /><span className="sheet-tool-label">Tempo map</span></HelpButton>
      <HelpButton command="audio.align-open" title="Align recording" className="button subtle sheet-tool sheet-tool--optional" onClick={() => dispatch('audio.align-open')}><AudioLines size={14} /><span className="sheet-tool-label">Align recording</span></HelpButton>
      <span className="divider-vertical" />
      <HelpButton title="Wrap notes" description="Show every line of the notes, or keep one line per set so more sets fit." className="button subtle sheet-tool sheet-tool--compact" aria-pressed={wrap} onClick={() => setWrap(!wrap)}><WrapText size={14} /><span className="sheet-tool-label">Wrap notes</span></HelpButton>
      <HelpButton title="Open sheet set on field" description="Open the active sheet row on the field in Write mode." disabled={controller.pendingDraft} disabledReason="Apply or cancel the pending input first." className="button subtle" onClick={() => dispatch('workspace.show', { workspace: 'design' })}>Open on field<ArrowRight size={14} /></HelpButton>
    </div>
    <p id="sheet-help" className="sr-only">Tab moves across. Enter or Up and Down move rows. Alt+Left and Alt+Right move columns. Shift+Enter adds a line to Notes. Escape cancels input. Counts arrive at each set; opening counts stay 0. Paste has a review step.</p>
    <p id="sheet-meter-help" className="sr-only">Meter is a time signature such as 4/4 or 6/8. Accents fall on each bar, or in threes for 6/8, 9/8 and 12/8; write other accent groups after a colon, as in 7/8:2+2+3. A blank Meter cell inherits the meter before it.</p>
    {error && <div className="sheet-error" role="alert">{error}{draft && <><button className="button subtle" onClick={() => { const d = draftRef.current; if (d) focus(d); }}>Return to input</button><button className="button subtle" onClick={() => { setDraft(null); setPendingDraft(false, 'sheet-cell'); setError(''); }}>Cancel input</button></>}</div>}
    <div className={`production-table sheet-scroll${wrap ? '' : ' sheet-scroll--dense'}`} ref={table}>
      <table aria-label="Production sheet cells" aria-describedby="sheet-help" style={{ '--sheet-digits': Math.max(2, String(project.sets.length).length) } as CSSProperties}><thead><tr>
        <th scope="col"><Tooltip name="Set / score" description="The set’s number and the measure it arrives on. The beat shows when a set lands off the downbeat."><span>Set / score</span></Tooltip></th>
        {sheetLabels.map((label, column) => <th scope="col" key={label} className={numeric(column) ? 'sheet-num' : undefined}><Tooltip name={label} description={hints[column]}><span>{label}</span></Tooltip></th>)}
      </tr></thead><tbody>
        {project.sets.map((set, row) => {
          const start = starts[row], active = controller.index === row;
          // scoreLabel is "M9 · beat 1"; the beat is shown only when the set lands off the downbeat.
          const [measure, ...beat] = scoreLabel(score, start).split(' · '), downbeat = scorePosition(score, start).beat === 1;
          return <tr key={set.id} className={active ? 'sheet-active' : ''}>
          <th scope="row" aria-current={active ? 'step' : undefined}><span className="sheet-set-number">{String(row + 1).padStart(2, '0')}</span><span className="sheet-score-position">{measure}{beat.length > 0 && <span className={downbeat ? 'sheet-score-beat sheet-score-beat--downbeat' : 'sheet-score-beat'}> · {beat.join(' · ')}</span>}</span>{active && <span className="sheet-current">Current</span>}</th>
          {sheetLabels.map((label, column) => {
            const cell = { row, column }, editing = same(draft, cell), value = sheetValue(project, row, column);
            const opening = row === 0 && column === 1, inherits = column === 4 && row > 0 && !value;
            // A tempo that repeats the set before it reads quietly, so the changes stand out.
            const repeats = column === 2 && row > 0 && value === sheetValue(project, row - 1, column);
            const props = {
              'aria-label': `${label} for set ${row + 1}`, 'aria-invalid': editing && !!error || undefined,
              'aria-describedby': column === 4 ? 'sheet-help sheet-meter-help' : 'sheet-help', 'data-row': row, 'data-column': column,
              tabIndex: same(current, cell) ? 0 : -1,
              value: editing ? draft!.text : value,
              // Empty Notes/Mark cells announce they are editable only in the active row, keeping 128 rows quiet.
              placeholder: column === 4 && row > 0 ? `inherit ${meterText(scorePosition(score,start).meter)}` : active && (column === 3 || column === 5) ? (column === 3 ? 'Add note' : 'Add mark') : undefined,
              readOnly: opening,
              onFocus: () => begin(cell), onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { if (event.currentTarget.closest('[hidden]') || event.relatedTarget instanceof Element && event.relatedTarget.closest('[data-preserve-drafts]')) return; commit(); },
              onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                if (draftRef.current && !same(draftRef.current, cell) && !commit()) return;
                if (!draftRef.current && store.getState().ui.pendingDraft) { setError('Finish or cancel the other pending input before editing the sheet.'); return; }
                const s = store.getState();
                const next = { ...cell, text: e.target.value, revision: draftRef.current?.revision ?? s.project.revision, epoch: draftRef.current?.epoch ?? s.ui.projectEpoch };
                setDraft(next); setPendingDraft(next.text !== sheetValue(s.project.present, row, column), 'sheet-cell'); setError('');
              },
              onPaste: (e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                const text = e.clipboardData.getData('text/plain');
                if (/[\t\r\n]/.test(text)) { e.preventDefault(); openPaste(text, cell); }
              },
            };
            const classes = [numeric(column) && 'sheet-num', inherits && 'sheet-inherit', repeats && !editing && 'sheet-repeat'].filter(Boolean).join(' ');
            return <td key={label} className={classes || undefined}>{column === 3 ? <textarea {...props} rows={1} onKeyDown={e => move(e, cell)} /> : <input {...props} inputMode={numeric(column) ? 'decimal' : 'text'} onKeyDown={e => move(e, cell)} />}</td>;
          })}
        </tr>; })}
      </tbody></table>
    </div>
    {showHints && <footer className="sheet-status" data-hint="">
      <p className="sheet-status-hint">{draft ? <><strong>{sheetLabels[draft.column]}</strong>{draft.row === 0 && draft.column === 1 ? 'The opening set has no move into it, so its counts stay 0.' : hints[draft.column]}</> : 'Click a cell to edit it. Changes apply when you leave the cell.'}</p>
      <p className="sheet-status-keys"><span><kbd>Tab</kbd>Next cell</span><span><kbd>Enter</kbd>Next row</span><span><kbd>Esc</kbd>Cancel</span></p>
    </footer>}
    {paste && controller.dialog === 'sheet-paste' && <Modal title="Review spreadsheet paste" onClose={closePaste} wide className="sheet-paste-modal">
      <p className="modal-intro">Starts at set {paste.row + 1} · {sheetLabels[paste.column]}. Columns: {sheetLabels.slice(paste.column).join(', ')}. No header row. Rows past the sheet become holds with the preceding positions and default timing. Only supplied cells change; blank notes clear notes.</p>
      <label className="form-label">CSV or TSV data<textarea autoFocus aria-label="Spreadsheet data" rows={4} value={paste.text} onChange={e => setPaste({ ...paste, text: e.target.value })} /></label>
      <p role="status">{review ? `${review.cells.length} cells · ${review.added} new sets · ${review.errors.length} errors` : 'Paste data to review.'}</p>
      {(parseError || stale) && <p className="field-error" role="alert">{stale ? 'The production changed after review. Cancel and paste again.' : parseError}</p>}
      {review?.errors.length ? <ul className="sheet-error-list" aria-label="Paste errors">{review.errors.map((message, i) => <li key={i}>{message}</li>)}</ul> : null}
      {!!review?.cells.length && <div className="sheet-preview-scroll"><table className="sheet-preview"><thead><tr><th>Set / column</th><th>Before</th><th>After</th></tr></thead><tbody>{review.cells.map((cell, i) => <tr key={i} className={cell.error ? 'sheet-invalid' : ''}><th scope="row">{cell.row + 1} · {sheetLabels[cell.column]}{cell.row >= project.sets.length ? ' (new)' : ''}</th><td>{cell.before || '—'}</td><td>{cell.after || '(empty)'}{cell.error && <strong> · Error: {cell.error}</strong>}</td></tr>)}</tbody></table></div>}
      <div className="modal-actions"><button className="button subtle" onClick={closePaste}>Cancel paste</button><button className="button primary" aria-label="Apply spreadsheet paste" disabled={!review || !!review.errors.length || !!parseError || stale || !review.changed && !review.added} onClick={applyPaste}>Apply paste · one undo</button></div>
    </Modal>}
  </section>;
}
