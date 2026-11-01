import { useEffect, useState } from 'react';
import { Modal } from '../components/Modal';
import { Tooltip } from '../components/Tooltip';
import { FieldDrawing } from '../components/Field2D';
import { PROJECT_LIMITS, sampleProject, setStartCount, validateProject } from '../domain';
import { movementLength, movementSchedule, movementSvg, movementTravels } from '../movementPaths';
import { HelpButton } from './ControlHelp';
import { editMovementSchedule, newScheduleRow, pathFromRows, scheduleRows } from './movementScheduleEditing';
import type { ScheduleEdit, ScheduleRow } from './movementScheduleEditing';
import type { EditorController } from './useEditorController';
import './paths.css';

export function MovementSchedulePanel({ controller: c }: { controller: EditorController }) {
  const [initial] = useState(() => {
    const project = c.project, index = c.index - 1, id = c.selectedIds[0];
    return { project, index, id, rows: scheduleRows(project, index, id), revision: c.store.getState().project.revision, epoch: c.projectEpoch };
  });
  const { project, index, id } = initial, move = project.moves[index];
  const from = project.sets[index].positions[id], to = project.sets[index + 1].positions[id];
  const [rows, setRows] = useState(initial.rows), [count, setCount] = useState(move.counts / 2), [submitError, setSubmitError] = useState('');
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial.rows);
  useEffect(() => { c.setPendingDraft(dirty, 'movement-schedule'); return () => c.setPendingDraft(false, 'movement-schedule'); }, [dirty, c.setPendingDraft]);
  let error = '', path: ScheduleEdit['path'] = null, candidate = project;
  try {
    path = pathFromRows(rows);
    candidate = editMovementSchedule(project, { moveId: move.id, performerId: id, path, revision: initial.revision, epoch: initial.epoch });
    validateProject(candidate);
  } catch (e) {
    error = (e as Error).message.replace(/^Invalid project:.*\.segments\[(\d+)\]/, (_match, n: string) => `Interval ${Number(n) + 1}`)
      .replace(/^Invalid project:.*\.paths\.[A-Za-z0-9_-]+/, 'Movement schedule');
  }
  const state = c.store.getState(), stale = state.project.revision !== initial.revision || c.projectEpoch !== initial.epoch || c.index !== index + 1 || c.selectedIds.length !== 1 || c.selectedIds[0] !== id;
  const changed = dirty && JSON.stringify(path) !== JSON.stringify(move.paths[id] ?? null);
  const lastTravel = rows.reduce((last, row, i) => row.kind !== 'hold' ? i : last, -1);
  const preview = sampleProject(candidate, setStartCount(candidate, index) + count).positions;
  const label = project.performers.find(p => p.id === id)!.label;
  function update(rowId: string, key: keyof ScheduleRow, value: string) { setRows(old => old.map(row => row.id === rowId ? { ...row, [key]: value } : row)); }
  function numeric(row: ScheduleRow, i: number, key: keyof ScheduleRow, title: string, maximum: number) {
    const name = `Interval ${i + 1} ${title}`;
    return <label className="form-label">{title}<Tooltip name={name} description="Change this interval's local written count or field coordinate. Preview updates before Apply."><input type="number" aria-label={name} step={key === 'start' || key === 'end' ? .25 : .1} min={0} max={maximum} value={row[key]} onChange={e => update(row.id, key, e.target.value)} /></Tooltip></label>;
  }
  function close() { c.setPendingDraft(false, 'movement-schedule'); c.setDialog(null); }
  function apply() {
    if (error || stale || !changed) return;
    c.setPendingDraft(false, 'movement-schedule');
    if (c.dispatch('schedule.save', { moveId: move.id, performerId: id, path, revision: initial.revision, epoch: initial.epoch }) !== true) {
      c.setPendingDraft(dirty, 'movement-schedule'); setSubmitError(c.store.getState().ui.toast || 'Cancel and reopen to review the current move.');
    }
  }
  return <Modal title="Edit movement timing" onClose={close} wide className="path-panel movement-schedule-panel">
    <div className="path-fields">
      <p className="modal-intro">{label} · {project.sets[index].name} → {project.sets[index + 1].name} · {move.counts} written counts. Other performers keep their own timing.</p>
      <p className="microcopy">Before departure, in a gap and after the final arrival, hold the preceding position. Each travel begins at the preceding arrival; the last travel ends at the next set. These movement holds do not stop the show clock, recording or other performers.</p>
      <ol className="schedule-rows" aria-label="Movement intervals">{rows.map((row, i) => <li key={row.id} data-schedule-row={i}>
        <div className="schedule-row-header"><strong>Interval {i + 1}</strong><HelpButton title={`Remove interval ${i + 1}`} className="button subtle" onClick={() => setRows(old => old.filter(r => r.id !== row.id))}>Remove</HelpButton></div>
        <div className="schedule-timing">
          <label className="form-label">Movement<Tooltip name={`Interval ${i + 1} movement`} description="Choose straight travel, a cubic curve or a stationary hold at the preceding arrival."><select aria-label={`Interval ${i + 1} movement`} value={row.kind} onChange={e => update(row.id, 'kind', e.target.value)}><option value="line">Straight travel</option><option value="cubic">Cubic curve</option><option value="hold">Hold position</option></select></Tooltip></label>
          {numeric(row, i, 'start', row.kind === 'hold' ? 'Start count' : 'Departure count', move.counts)}
          {numeric(row, i, 'end', row.kind === 'hold' ? 'End count' : 'Arrival count', move.counts)}
        </div>
        {row.kind === 'hold' ? <p className="microcopy">Holds the preceding arrival position. A schedule with only holds requires matching positions in both sets.</p>
          : i === lastTravel ? <p className="microcopy">Final arrival: next set at X {to.x.toFixed(3)}, Y {to.y.toFixed(3)} yd.</p>
          : <div className="form-row">{numeric(row, i, 'x', 'Arrival X yards', project.field.width)}{numeric(row, i, 'y', 'Arrival Y yards', project.field.height)}</div>}
        {row.kind === 'cubic' && <div className="path-controls">{numeric(row, i, 'c1x', 'Control 1 X', project.field.width)}{numeric(row, i, 'c1y', 'Control 1 Y', project.field.height)}{numeric(row, i, 'c2x', 'Control 2 X', project.field.width)}{numeric(row, i, 'c2y', 'Control 2 Y', project.field.height)}</div>}
      </li>)}</ol>
      {!rows.length && <p role="status">Default travel: straight from the previous set to the next set over the whole move.</p>}
      <div className="schedule-actions"><HelpButton title="Add movement interval" description="Append an interval after the preceding end count. Leave room within the move before adding another interval." className="button subtle" disabled={rows.length >= PROJECT_LIMITS.pathSegments} disabledReason={`Use at most ${PROJECT_LIMITS.pathSegments} intervals.`} onClick={() => setRows(old => [...old, newScheduleRow(from, to, move.counts, old.at(-1)?.end ?? '0')])}>Add interval</HelpButton><HelpButton title="Use default straight travel" description="Preview removal of the custom schedule; Apply records the change." className="button subtle" onClick={() => setRows([])}>Use default straight travel</HelpButton></div>
      {(error || stale || submitError) && <p className="field-error" role="alert">{stale ? 'The production or selection changed. Copy your draft, then cancel and reopen.' : error || submitError}</p>}
      {!error && <>
        <svg className="path-preview" viewBox={`-7 -8 114 ${project.field.height + 16}`} role="img" aria-label="Timed movement preview">
          <FieldDrawing project={project} positions={preview} selectedIds={[id]} showLabels={false} />
          <path className="path-original" d={movementSvg(from, to, move.paths[id])} /><path className="path-proposed" d={movementSvg(from, to, path ?? undefined)} />
          <g className="path-polygon">{movementTravels(from, to, path ?? undefined).slice(0, -1).map((part, i) => <g key={part.segment.id}><circle cx={part.to.x} cy={part.to.y} r="1" /><text x={part.to.x + 1.5} y={part.to.y - 1}>{i + 1}</text></g>)}</g>
        </svg>
        <label className="form-label">Preview local count · {count.toFixed(2)}<input type="range" aria-label="Preview movement count" min={0} max={move.counts} step={.01} value={count} onChange={e => setCount(Number(e.target.value))} /></label>
        <p role="status" aria-label="Movement preview position">{label}: X {preview[id].x.toFixed(3)}, Y {preview[id].y.toFixed(3)} yd · travel {movementLength(from, to, path ?? undefined).toFixed(3)} yd.</p>
        <p className="microcopy" aria-label="Movement schedule summary">{path ? movementSchedule(path, move.counts) : `Travel 0–${move.counts}`}. Solid: proposed path. Dashed: saved path. Ring: sampled position.</p>
      </>}
      <p className="microcopy">Intervals must have positive duration, stay in count order and not overlap. Fractional counts are allowed. Easing applies within each travel interval; curves use parameter timing. Problems reports conservative spacing and peak-stride bounds. Count changes uniformly rescale all intervals. Move operations previews resize, reverse and interval copy/paste. Detailed splitting or changing a custom move's preceding set remains guarded.</p>
    </div>
    <div className="modal-actions"><HelpButton title="Cancel movement timing" className="button subtle" onClick={close}>Cancel</HelpButton><HelpButton title="Apply movement timing" description="Validate the complete schedule and apply it as one named undo action." disabled={!changed || !!error || stale} disabledReason={error || (stale ? 'Cancel and reopen after the production changed.' : 'Edit the movement intervals first.')} className="button primary" onClick={apply}>Apply timing · one undo</HelpButton></div>
  </Modal>;
}
