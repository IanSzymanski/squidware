import { useRef, useState } from 'react';
import type { PointerEvent, KeyboardEvent } from 'react';
import { FieldDrawing } from '../components/Field2D';
import { movementSvg, movementTravels } from '../movementPaths';
import { moveSelection } from '../snapping';
import type { PerformerPath, Point, Project, Move } from '../types';
import { DRAW_LIMIT, travelTicks, type TravelHandle } from './pathAuthoring';
import { HelpButton } from './ControlHelp';

interface Props {
  project: Project; positions: Record<string, Point>; performerId: string;
  from: Point; to: Point; path?: PerformerPath; original?: PerformerPath;
  counts: number; transition: Move['transition']; handles: TravelHandle[];
  selectedRow?: string; onSelectRow?: (id: string) => void;
  onHandle: (handle: TravelHandle, point: Point) => void;
  captureFrom?: Point; captureTo?: Point;
  capture?: 'stroke' | 'anchors' | null; stroke?: Point[]; onStroke?: (points: Point[]) => void;
  onCancelCapture?: () => void;
  onError?: (message: string) => void; onGesture?: (active: boolean) => void;
  label?: string;
}
type Gesture = { pointer: number; handle?: TravelHandle; before: Point[]; points: Point[] };

/** One field tab stop. Internal handle navigation never changes cast selection.
 * Screen CTM inversion makes capture/drag independent of zoom and letterboxing. */
export function TravelCanvas(props: Props) {
  const { project, from, to, path, original, positions, performerId, counts, transition, handles, onHandle, capture, stroke = [], onStroke, onError, onGesture, selectedRow, onSelectRow } = props;
  const svg = useRef<SVGSVGElement>(null), gesture = useRef<Gesture | null>(null);
  const [active, setActive] = useState(''), [zoom, setZoom] = useState(1), [snap, setSnap] = useState(false);
  const handle = handles.find(h => h.id === active && (!selectedRow || h.rowId === selectedRow)) ?? handles.find(h => h.rowId === selectedRow) ?? (!selectedRow ? handles[0] : undefined);
  const travels = movementTravels(from, to, path), ticks = travelTicks(from, to, path, counts, transition);
  const center = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const width = (project.field.width + 14) / zoom, height = (project.field.height + 16) / zoom;
  const origin = zoom === 1 ? { x: -7, y: -8 } : { x: Math.max(-7, Math.min(project.field.width + 7 - width, center.x - width / 2)), y: Math.max(-8, Math.min(project.field.height + 8 - height, center.y - height / 2)) };
  function local(event: PointerEvent<SVGSVGElement>): Point {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) throw new Error('Field coordinates are unavailable.');
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    // Capture is never clamped: out-of-field strokes fail validation explicitly.
    return { x: point.x, y: point.y };
  }
  function attached(point: Point): Point {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return point;
    const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    const ends = [props.captureFrom ?? from, props.captureTo ?? to].map(p => ({ point: p, screen: new DOMPoint(p.x, p.y).matrixTransform(matrix) }));
    const nearest = ends.sort((a, b) => Math.hypot(a.screen.x - screen.x, a.screen.y - screen.y) - Math.hypot(b.screen.x - screen.x, b.screen.y - screen.y))[0];
    return Math.hypot(nearest.screen.x - screen.x, nearest.screen.y - screen.y) <= 8 ? { ...nearest.point } : point;
  }
  function tickLabel(i: number): string | null {
    const same = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-8;
    if (i && same(ticks[i].point, ticks[i - 1].point)) return null;
    let end = i; while (end + 1 < ticks.length && same(ticks[i].point, ticks[end + 1].point)) end++;
    const text = (count: number) => String(Number(count.toFixed(2)));
    if (end > i) return `${text(ticks[i].count)}–${text(ticks[end].count)}`;
    return i === 0 || i === ticks.length - 1 || i % Math.max(1, Math.ceil(ticks.length / (zoom * 8))) === 0 ? text(ticks[i].count) : null;
  }
  function move(h: TravelHandle, p: Point, advance = false) {
    const result = moveSelection({ handle: h.point }, ['handle'], { x: p.x - h.point.x, y: p.y - h.point.y }, project.field, project.snapping, snap, 'handle', { x: p.x !== h.point.x, y: p.y !== h.point.y, advance });
    onHandle(h, result.handle);
  }
  function rollback() {
    const g = gesture.current;
    if (!g) return false;
    gesture.current = null;
    if (g.handle) onHandle(g.handle, g.handle.point); else onStroke?.(g.before);
    if (svg.current?.hasPointerCapture(g.pointer)) svg.current.releasePointerCapture(g.pointer);
    onGesture?.(false); return true;
  }
  function start(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || gesture.current) return;
    const target = (event.target as Element).closest('[data-travel-handle]');
    const h = handles.find(item => item.id === target?.getAttribute('data-travel-handle'));
    if (h && !capture) {
      event.preventDefault(); svg.current?.focus(); setActive(h.id); onSelectRow?.(h.rowId);
      gesture.current = { pointer: event.pointerId, handle: { ...h, point: { ...h.point } }, before: [], points: [] };
    } else if (capture) {
      event.preventDefault(); svg.current?.focus();
      const p = local(event);
      if (capture === 'anchors') {
        if (stroke.length >= DRAW_LIMIT) { onError?.(`Use at most ${DRAW_LIMIT} points.`); return; }
        onStroke?.([...stroke, p]); return;
      }
      const first = attached(p);
      gesture.current = { pointer: event.pointerId, before: stroke, points: [first] };
      onStroke?.([first]);
    } else {
      const row = (event.target as Element).closest('[data-travel-segment]')?.getAttribute('data-travel-segment');
      if (row) { onSelectRow?.(row); svg.current?.focus(); }
      return;
    }
    svg.current?.setPointerCapture(event.pointerId); onGesture?.(true);
  }
  function update(event: PointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    if (!g || g.pointer !== event.pointerId) return;
    const p = local(event);
    if (g.handle) move(g.handle, p);
    else {
      const last = g.points.at(-1)!;
      if (Math.hypot(p.x - last.x, p.y - last.y) < .005) return;
      if (g.points.length >= DRAW_LIMIT) { rollback(); onError?.(`Capture exceeded ${DRAW_LIMIT} points. Draw a shorter stroke.`); return; }
      g.points.push(p); onStroke?.([...g.points]);
    }
  }
  function finish(event: PointerEvent<SVGSVGElement>) {
    if (gesture.current?.pointer !== event.pointerId) return;
    const g = gesture.current;
    if (g.handle) update(event);
    else {
      const raw = local(event), end = attached(raw), last = g.points.at(-1)!;
      if (Math.hypot(raw.x - last.x, raw.y - last.y) < .01) g.points[g.points.length - 1] = end;
      else if (g.points.length < DRAW_LIMIT) g.points.push(end);
      else { rollback(); onError?.(`Capture exceeded ${DRAW_LIMIT} points. Draw a shorter stroke.`); return; }
      onStroke?.([...g.points]);
    }
    gesture.current = null;
    if (svg.current?.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId);
    onGesture?.(false);
  }
  function keyboard(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === 'Escape') {
      if (rollback()) { event.preventDefault(); event.stopPropagation(); return; }
      if (capture) { event.preventDefault(); event.stopPropagation(); props.onCancelCapture?.(); return; }
    }
    if (capture || !handle || gesture.current) return;
    if (event.key === '[' || event.key === ']') {
      event.preventDefault(); const available = handles.filter(h => !selectedRow || h.rowId === selectedRow), i = available.findIndex(h => h.id === handle.id), next = available[(i + (event.key === ']' ? 1 : available.length - 1)) % available.length];
      setActive(next.id); onSelectRow?.(next.rowId); return;
    }
    const step = event.shiftKey ? 1 : .1;
    const deltas: Record<string, Point> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
    const delta = deltas[event.key];
    if (delta) { event.preventDefault(); move(handle, { x: handle.point.x + delta.x, y: handle.point.y + delta.y }, true); }
  }
  const description = capture ? 'Draw from the start square to the end square. Stroke endpoints snap within 8 screen pixels. Fit stroke reviews the captured, attached polyline.' : 'Click a segment or handle. Brackets select handles; arrows move 0.1 yard, Shift arrows 1 yard. Numeric coordinates are also available. Escape cancels an active drag.';
  const endpoints = capture ? [props.captureFrom ?? from, props.captureTo ?? to] : [from, to];
  return <div className="travel-canvas">
    <div className="schedule-actions">
      <label className="form-label">Field zoom<select aria-label="Path field zoom" value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[1, 2, 4].map(n => <option key={n} value={n}>{n}×</option>)}</select></label>
      <HelpButton title="Snap path handles" active={snap} description="Snap handle drags and arrow keys using the production's field snapping settings. Numeric entries remain exact." className="button subtle" onClick={() => setSnap(s => !s)}>Snap handles {snap ? 'on' : 'off'}</HelpButton>
    </div>
    <svg ref={svg} className={`path-preview travel-field ${capture ? 'is-drawing' : ''}`} viewBox={`${origin.x} ${origin.y} ${width} ${height}`} tabIndex={0} role="group" aria-label={props.label ?? 'Editable travel field'} aria-describedby="travel-field-help"
      onPointerDown={start} onPointerMove={update} onPointerUp={finish} onPointerCancel={() => rollback()} onLostPointerCapture={() => rollback()} onKeyDown={keyboard}>
      <g pointerEvents="none"><FieldDrawing project={project} positions={positions} selectedIds={[performerId]} showLabels={false} /><path className="path-original" d={movementSvg(from, to, original)} /></g>
      {travels.map(part => <g key={part.segment.id}>
        <path className={`path-proposed ${part.segment.id === selectedRow ? 'is-selected' : ''}`} d={movementSvg(part.from, part.to, { segments: [part.segment] })} pointerEvents="none" />
        {onSelectRow && !capture && <path data-travel-segment={part.segment.id} className="travel-segment-hit" d={movementSvg(part.from, part.to, { segments: [part.segment] })} />}
      </g>)}
      <g className="travel-ticks" pointerEvents="none">{ticks.map(({ count, point }, i) => <g key={count} data-travel-count={count} transform={`translate(${point.x} ${point.y})`}><circle r={.18 / zoom} />{tickLabel(i) && <text x={.45 / zoom} y={-1 / zoom} fontSize={3 / zoom}>{tickLabel(i)}</text>}</g>)}</g>
      {!capture && <g className="path-polygon">{travels.map(({ from: a, to: b, segment: s }) => s.kind === 'cubic' && <path key={s.id} d={`M${a.x} ${a.y}L${s.control1.x} ${s.control1.y}M${b.x} ${b.y}L${s.control2.x} ${s.control2.y}`} pointerEvents="none" />)}
        {handles.filter(h => !selectedRow || h.rowId === selectedRow).map(h => <g key={h.id} data-travel-handle={h.id} className={`travel-handle ${h.id === handle?.id ? 'is-active' : ''}`} aria-label={h.label} transform={`translate(${h.point.x} ${h.point.y})`}>
          <circle className="travel-handle-hit" r={2.5 / zoom} /><circle r={.6 / zoom} /><text x={1 / zoom} y={-1 / zoom} style={{fontSize: `${3 / zoom}px`}}>{h.kind === 'arrival' ? 'A' : h.kind === 'control1' ? '1' : '2'}</text>
        </g>)}
      </g>}
      <g className="travel-endpoints" pointerEvents="none">{endpoints.map((p, i) => <g key={i} transform={`translate(${p.x} ${p.y})`}><rect x={-.6 / zoom} y={-.6 / zoom} width={1.2 / zoom} height={1.2 / zoom} /><text x={1 / zoom} y={2.5 / zoom} fontSize={3 / zoom}>{i ? 'End' : 'Start'}</text></g>)}</g>
      {!!stroke.length && <polyline className="travel-stroke" points={stroke.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)).map(p => `${p.x},${p.y}`).join(' ')} pointerEvents="none" />}
    </svg>
    <p className="microcopy" id="travel-field-help">{description} Zoom centers on the move endpoints. Square endpoints stay attached to the sets.</p>
    {!capture && <p className="microcopy" role="status" aria-label="Active path handle">{handle ? `${handle.label}: X ${handle.point.x.toFixed(3)}, Y ${handle.point.y.toFixed(3)} yd` : 'Straight travel has no control handles. Choose cubic geometry to add them.'}</p>}
    <details><summary>Count tick coordinates · includes holds</summary><div className="travel-tick-table"><table><thead><tr><th>Count</th><th>X yd</th><th>Y yd</th></tr></thead><tbody>{ticks.map(({ count, point }) => <tr key={count}><td>{Number(count.toFixed(4))}</td><td>{point.x.toFixed(3)}</td><td>{point.y.toFixed(3)}</td></tr>)}</tbody></table></div></details>
  </div>;
}
