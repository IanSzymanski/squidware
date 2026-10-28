import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ArrowRight, ClipboardPaste, Plus } from 'lucide-react';
import { countToSeconds, PROJECT_LIMITS } from '../domain';
import { Modal } from '../components/Modal';
import { HelpButton } from './ControlHelp';
import { parseSheetText, reviewSheetRange, sheetLabels, sheetValue, type SheetEdit } from './productionSheet';
import type { EditorController } from './useEditorController';
import './productionSheet.css';
import { useMemo } from 'react';
import { compileScore, scoreLabel, scorePosition } from '../score';

type Cell = { row: number; column: number };
type Draft = Cell & { text: string; revision: number; epoch: number };
type Paste = Cell & { text: string; revision: number; epoch: number };
const same = (a: Cell | null, b: Cell) => a?.row === b.row && a.column === b.column;

export function ProductionWorkspace({ controller }: { controller: EditorController }) {
  const { project, duration, dispatch, store, setPendingDraft } = controller;
  const [cursor, setCursor] = useState<Cell>({ row: controller.index, column: 0 });
  const [draft, setDraftState] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const [paste, setPaste] = useState<Paste | null>(null);
  const [error, setError] = useState('');
  const table = useRef<HTMLDivElement>(null);
  function setDraft(value: Draft | null) { draftRef.current = value; setDraftState(value); }
  useEffect(() => () => { setPendingDraft(false, 'sheet-cell'); setPendingDraft(false, 'sheet-preview'); }, [setPendingDraft]);
  const score = useMemo(()=>compileScore(project),[project]);
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
      <p><strong>{project.sets.length} sets · {duration} counts</strong><span>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')} at written tempos</span></p>
      <HelpButton command="score.open" title="Score map" className="button subtle" onClick={() => dispatch('score.open')}>Score map</HelpButton>
      <HelpButton title="Paste spreadsheet range" description="Review CSV or TSV starting at the focused cell. Use Name, Counts, BPM, Notes, Meter, Mark without a header row." className="button subtle" onClick={() => openPaste()}><ClipboardPaste size={16} />Paste range</HelpButton>
      <HelpButton command="sheet.append" title="Append sheet row" disabled={controller.pendingDraft || project.sets.length >= PROJECT_LIMITS.sets} disabledReason={`Finish the pending input first. The sheet supports at most ${PROJECT_LIMITS.sets} sets.`} className="button subtle" onClick={() => { if (dispatch('sheet.append') === true) focus({ row: store.getState().project.present.sets.length - 1, column: 0 }); }}><Plus size={16} />Add row</HelpButton>
      <HelpButton title="Open sheet set on field" description="Open the active sheet row in Design." disabled={controller.pendingDraft} disabledReason="Apply or cancel the pending input first." className="button subtle" onClick={() => dispatch('workspace.show', { workspace: 'design' })}><ArrowRight size={16} />Field</HelpButton>
    </div>
    <details className="sheet-help"><summary>Keyboard and paste help</summary><p id="sheet-help">Tab moves across · Enter or ↑ ↓ moves rows · Alt+← → moves columns · Shift+Enter adds a line to Notes · Escape cancels input. Counts arrive at each set; opening counts stay 0. Paste has a review step.</p></details>
    {error && <div className="sheet-error" role="alert">{error}{draft && <><button className="button subtle" onClick={() => { const d = draftRef.current; if (d) focus(d); }}>Return to input</button><button className="button subtle" onClick={() => { setDraft(null); setPendingDraft(false, 'sheet-cell'); setError(''); }}>Cancel input</button></>}</div>}
    <div className="production-table sheet-scroll" ref={table}>
      <table aria-label="Production sheet cells" aria-describedby="sheet-help"><thead><tr><th scope="col">Set / score</th>{sheetLabels.map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>
        {project.sets.map((set, row) => <tr key={set.id} className={controller.index === row ? 'sheet-active' : ''}>
          <th scope="row" aria-current={controller.index === row ? 'step' : undefined}>{String(row + 1).padStart(2, '0')}<span className="sheet-score-position">{scoreLabel(score,project.moves.slice(0,row).reduce((n,m)=>n+m.counts,0))}</span>{controller.index === row && <span className="sheet-current">Current</span>}</th>
          {sheetLabels.map((label, column) => {
            const cell = { row, column }, editing = same(draft, cell);
            const props = {
              'aria-label': `${label} for set ${row + 1}`, 'aria-invalid': editing && !!error || undefined,
              'aria-describedby': 'sheet-help', 'data-row': row, 'data-column': column,
              tabIndex: same(current, cell) ? 0 : -1,
              value: editing ? draft!.text : sheetValue(project, row, column),
              placeholder: column === 4 && row > 0 ? `inherit ${scorePosition(score,project.moves.slice(0,row).reduce((n,m)=>n+m.counts,0)).meter.numerator}/${scorePosition(score,project.moves.slice(0,row).reduce((n,m)=>n+m.counts,0)).meter.denominator}` : undefined,
              readOnly: row === 0 && column === 1,
              onFocus: () => begin(cell), onBlur: () => { commit(); },
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
            return <td key={label}>{column === 3 ? <textarea {...props} rows={1} onKeyDown={e => move(e, cell)} /> : <input {...props} inputMode={column === 1 || column === 2 ? 'decimal' : 'text'} onKeyDown={e => move(e, cell)} />}</td>;
          })}
        </tr>)}
      </tbody></table>
    </div>
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
