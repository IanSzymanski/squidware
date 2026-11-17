import { useLayoutEffect, useRef } from 'react';
import { FormattedNumberInput, formattedNumber } from '../components/NumberField';
import { formatYards } from '../coordinates';
import { Tooltip } from '../components/Tooltip';
import { TravelDetails } from './TravelCanvas';
import { DrawTravel } from './DrawTravel';
import { PROJECT_LIMITS } from '../domain';
import { movementLength, movementSchedule } from '../movementPaths';
import { HelpButton } from './ControlHelp';
import { newScheduleRow } from './movementScheduleEditing';
import type { ScheduleRow } from './movementScheduleEditing';
import { formatTimelineCount } from './timelineNavigation';
import type { MovementScheduleSession } from './useMovementSchedule';
import './paths.css';

export function MovementSchedulePanel({ editor: e }: { editor: MovementScheduleSession }) {
  const { project, index, id, move, from, to, rows, count, selectedRow, gesture, capture, stroke, submitError,
    path, error, stale, changed, travel, preview, label, lastTravel, drawInitially, update, close, apply, selectRow, setRows, patch } = e;
  const region = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    region.current?.querySelector<HTMLElement>('[aria-label="Cancel movement timing"]')?.focus();
    return () => { requestAnimationFrame(() => { if (document.activeElement === document.body) document.querySelector<HTMLElement>('.field-container')?.focus(); }); };
  }, []);
  function numeric(row: ScheduleRow, i: number, key: keyof ScheduleRow, title: string, maximum: number) {
    const name = `Interval ${i + 1} ${title}`;
    return <label className="form-label">{title}<Tooltip pointerPassThrough name={name} description="Change this interval's local written count or field coordinate. Preview updates before Apply."><FormattedNumberInput aria-label={name} step={key === 'start' || key === 'end' ? .25 : .1} min={0} max={maximum} value={row[key]} format={key === 'start' || key === 'end' ? formatTimelineCount : formatYards} disabled={!!capture || gesture} onChange={text => update(row.id, key, text)} /></Tooltip></label>;
  }
  return <section ref={region} aria-label={drawInitially ? 'Draw performer path' : 'Edit movement timing'} className="path-panel movement-schedule-panel docked-path-editor"
    onKeyDown={event => { if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <div className="docked-path-heading"><h2>{drawInitially ? 'Draw performer path' : 'Edit movement timing'}</h2></div>
    <div className="docked-path-actions"><HelpButton pointerPassThrough title="Cancel movement timing" className="button subtle" onClick={close}>Cancel</HelpButton><HelpButton pointerPassThrough title="Apply movement timing" description="Validate the complete schedule and apply it as one named undo action." disabled={!changed || !!error || stale || gesture || !!capture} disabledReason={capture ? 'Fit or cancel the drawn stroke before applying.' : error || (stale ? 'Cancel and reopen after the production changed.' : 'Edit the movement intervals first.')} className="button primary" onClick={apply}>Apply timing · one undo</HelpButton></div>
    <div className="path-fields">
      <p className="modal-intro">{label} · {project.sets[index].name} → {project.sets[index + 1].name} · {move.counts} written counts. Other performers keep their own timing.</p>
      <details><summary>Movement timing notes</summary><p className="microcopy">Before departure, in a gap and after the final arrival, hold the preceding position. Each travel begins at the preceding arrival; the last travel ends at the next set. These movement holds do not stop the show clock, recording or other performers.</p></details>
      {(error || stale || submitError) && <p className="field-error" role="alert">{stale ? 'The production or selection changed. Copy your draft, then cancel and reopen.' : error || submitError}</p>}
      {!error && <>
        <label className="form-label">Selected interval<select aria-label="Selected travel interval" value={selectedRow} disabled={!!capture || gesture} onChange={e => selectRow(e.target.value)}>{rows.map((row, i) => <option key={row.id} value={row.id}>{`Interval ${i + 1} · ${row.kind} · ${formattedNumber(row.start, formatTimelineCount)}–${formattedNumber(row.end, formatTimelineCount)}`}</option>)}</select></label>
        {travel ? <DrawTravel docked key={selectedRow} rows={rows} rowId={selectedRow} from={travel.from} to={travel.to} mode={capture} setMode={capture => patch({ capture })} stroke={stroke} setStroke={stroke => patch({ stroke })} onFit={e.fit} disabled={gesture || stale} />
          : <p className="microcopy">Select a travel interval to draw. Holds have no travel handles.</p>}
        <HelpButton pointerPassThrough title="Snap path handles" active={e.snapHandles} description="Snap handle drags and arrow keys using the production's field snapping settings. Numeric entries remain exact." className="button subtle" onClick={() => patch({ snapHandles: !e.snapHandles })}>Snap handles {e.snapHandles ? 'on' : 'off'}</HelpButton>
        <TravelDetails {...e.field} mainField />
        <label className="form-label">Preview local count · {formatTimelineCount(count)}<input type="range" aria-label="Preview movement count" min={0} max={move.counts} step={.01} value={count} onChange={e => patch({ count: Number(e.target.value) })} /></label>
        <p role="status" aria-label="Movement preview position">{label}: X {formatYards(preview[id].x)}, Y {formatYards(preview[id].y)} yd · travel {formatYards(movementLength(from, to, path ?? undefined))} yd.</p>
        <p className="microcopy" aria-label="Movement schedule summary">{path ? movementSchedule(path, move.counts) : `Travel 0–${move.counts}`}. Solid: proposed path. Dashed: saved path. Ring: sampled position.</p>
      </>}
      <ol className="schedule-rows" aria-label="Movement intervals">{rows.map((row, i) => <li key={row.id} data-schedule-row={i}>
        <div className="schedule-row-header"><HelpButton pointerPassThrough title={`Select interval ${i + 1}`} active={row.id === selectedRow} className="button subtle" disabled={!!capture || gesture} onClick={() => selectRow(row.id)}>Interval {i + 1}{row.id === selectedRow ? " · selected" : ""}</HelpButton><HelpButton pointerPassThrough title={`Remove interval ${i + 1}`} className="button subtle" disabled={!!capture || gesture} onClick={() => setRows(old => old.filter(r => r.id !== row.id))}>Remove</HelpButton></div>
        <div className="schedule-timing">
          <label className="form-label">Movement<Tooltip pointerPassThrough name={`Interval ${i + 1} movement`} description="Choose straight travel, a cubic curve or a stationary hold at the preceding arrival."><select aria-label={`Interval ${i + 1} movement`} value={row.kind} disabled={!!capture || gesture} onChange={e => update(row.id, 'kind', e.target.value)}><option value="line">Straight travel</option><option value="cubic">Cubic curve</option><option value="hold">Hold position</option></select></Tooltip></label>
          {numeric(row, i, 'start', row.kind === 'hold' ? 'Start count' : 'Departure count', move.counts)}
          {numeric(row, i, 'end', row.kind === 'hold' ? 'End count' : 'Arrival count', move.counts)}
        </div>
        {row.kind === 'hold' ? <p className="microcopy">Holds the preceding arrival position. A schedule with only holds requires matching positions in both sets.</p>
          : i === lastTravel ? <p className="microcopy">Final arrival: next set at X {formatYards(to.x)}, Y {formatYards(to.y)} yd.</p>
          : <div className="form-row">{numeric(row, i, 'x', 'Arrival X yards', project.field.width)}{numeric(row, i, 'y', 'Arrival Y yards', project.field.height)}</div>}
        {row.kind === 'cubic' && <div className="path-controls">{numeric(row, i, 'c1x', 'Control 1 X', project.field.width)}{numeric(row, i, 'c1y', 'Control 1 Y', project.field.height)}{numeric(row, i, 'c2x', 'Control 2 X', project.field.width)}{numeric(row, i, 'c2y', 'Control 2 Y', project.field.height)}</div>}
      </li>)}</ol>
      {!rows.length && <p role="status">Default travel: straight from the previous set to the next set over the whole move.</p>}
      <div className="schedule-actions"><HelpButton pointerPassThrough title="Add movement interval" description="Append an interval after the preceding end count. Leave room within the move before adding another interval." className="button subtle" disabled={rows.length >= PROJECT_LIMITS.pathSegments || !!capture || gesture} disabledReason={`Use at most ${PROJECT_LIMITS.pathSegments} intervals.`} onClick={() => setRows(old => [...old, newScheduleRow(from, to, move.counts, old.at(-1)?.end ?? '0')])}>Add interval</HelpButton><HelpButton pointerPassThrough title="Use default straight travel" description="Preview removal of the custom schedule; Apply records the change." className="button subtle" disabled={!!capture || gesture} onClick={() => setRows([])}>Use default straight travel</HelpButton></div>
      <p className="microcopy">Intervals must have positive duration, stay in count order and not overlap. Fractional counts are allowed. Easing applies within each travel interval; curves use parameter timing. Problems reports conservative spacing and peak-stride bounds. Count changes uniformly rescale all intervals. Move operations previews resize, reverse and interval copy/paste. Detailed splitting or changing a custom move's preceding set remains guarded.</p>
    </div>
  </section>;
}
