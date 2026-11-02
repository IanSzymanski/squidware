import { useState } from 'react';
import type { Point } from '../types';
import { DRAW_LIMIT, DRAW_TOLERANCE, drawTravel } from './pathAuthoring';
import type { ScheduleRow } from './movementScheduleEditing';
import { HelpButton } from './ControlHelp';

interface Props {
  rows: ScheduleRow[]; rowId: string; from: Point; to: Point;
  mode: 'stroke' | 'anchors' | null; setMode: (mode: 'stroke' | 'anchors' | null) => void;
  stroke: Point[]; setStroke: (points: Point[]) => void;
  onFit: (rows: ScheduleRow[]) => void; disabled: boolean;
}
export function DrawTravel({ rows, rowId, from, to, mode, setMode, stroke, setStroke, onFit, disabled }: Props) {
  const [tolerance, setTolerance] = useState(String(DRAW_TOLERANCE)), [curved, setCurved] = useState(true), [error, setError] = useState('');
  function begin(next: 'stroke' | 'anchors') { setError(''); setStroke(next === 'anchors' ? [{ ...from }] : []); setMode(next); }
  function fit() {
    try {
      const points = mode === 'anchors' ? [...stroke, to] : stroke;
      const result = drawTravel(rows, rowId, from, to, points, Number(tolerance), curved);
      onFit(result); setError(''); setMode(null); setStroke([]);
    } catch (e) { setError((e as Error).message); }
  }
  return <section className="draw-travel" aria-label="Draw travel interval">
    <div className="schedule-actions">
      <HelpButton title="Draw Path" description="Capture a freehand stroke to replace only the selected travel interval. Begin and end at its fixed endpoints." className="button subtle" disabled={disabled} disabledReason="Select a valid travel interval and finish the current gesture." onClick={() => begin('stroke')}>Draw Path</HelpButton>
      <HelpButton title="Place path anchors" description="Click intermediate anchors, or enter exact X/Y coordinates below. The fixed end is added when fitting." className="button subtle" disabled={disabled} disabledReason="Select a valid travel interval and finish the current gesture." onClick={() => begin('anchors')}>Place anchors</HelpButton>
      {mode && <><HelpButton title="Fit drawn path" className="button primary" disabled={disabled || stroke.length < (mode === 'stroke' ? 2 : 1)} onClick={fit}>Fit stroke · preview</HelpButton>
        <HelpButton title="Cancel drawn stroke" className="button subtle" disabled={disabled} onClick={() => { setMode(null); setStroke([]); setError(''); }}>Cancel stroke</HelpButton></>}
    </div>
    {mode && <>
      <p className="microcopy">{mode === 'stroke' ? 'Drag from Start to End, release, then Fit stroke.' : 'Click intermediate anchors, or add numeric anchors below.'} Replaces only this interval; set endpoints and outer counts stay fixed. {stroke.length}/{DRAW_LIMIT} points.</p>
      <details><summary>Fitting options · {tolerance} yd · {curved ? 'cubic chords' : 'straight segments'}</summary>
      <div className="form-row"><label className="form-label">Fitting tolerance · yd<input aria-label="Stroke fitting tolerance" type="number" min=".01" max="1" step=".01" value={tolerance} onChange={e => setTolerance(e.target.value)} /></label>
        <label className="form-label">Fitted geometry<select aria-label="Fitted stroke geometry" value={curved ? 'cubic' : 'line'} onChange={e => setCurved(e.target.value === 'cubic')}><option value="cubic">Editable cubic chords</option><option value="line">Straight segments</option></select></label></div>
      <p className="microcopy">Fits chords within the field-space tolerance; cubic handles start collinear and can be refined after fitting. Corners and crossings above that tolerance are retained. Interior counts divide by chord length. Existing holds remain. No automatic smoothing.</p>
      </details>
      <p className="microcopy">Routes may cross. Review spacing and peak stride in Problems after Apply.</p>
      {mode === 'anchors' && <>
        <ol className="draw-anchors">{stroke.slice(1).map((p, i) => <li key={i}><div className="form-row">{(['x', 'y'] as const).map(axis => <label className="form-label" key={axis}>{`Anchor ${i + 1} ${axis.toUpperCase()} yd`}<input aria-label={`Draw anchor ${i + 1} ${axis.toUpperCase()}`} type="number" step=".1" value={Number.isFinite(p[axis]) ? p[axis] : ''} onChange={e => setStroke(stroke.map((q, j) => j === i + 1 ? { ...q, [axis]: e.target.value === '' ? NaN : Number(e.target.value) } : q))} /></label>)}<HelpButton title={`Remove drawn anchor ${i + 1}`} className="button subtle" onClick={() => setStroke(stroke.filter((_, j) => j !== i + 1))}>Remove</HelpButton></div></li>)}</ol>
        <HelpButton title="Add numeric path anchor" className="button subtle" disabled={stroke.length >= DRAW_LIMIT || disabled} onClick={() => setStroke([...stroke, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }])}>Add numeric anchor</HelpButton>
      </>}
      {mode === 'stroke' && stroke.length >= 2 && <HelpButton title="Reverse captured stroke" description="Reverse capture order so a backwards-drawn stroke attaches to the fixed start and end. This does not reverse the move or change its set pictures." className="button subtle" disabled={disabled} onClick={() => setStroke([...stroke].reverse())}>Reverse stroke direction</HelpButton>}
    </>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </section>;
}
