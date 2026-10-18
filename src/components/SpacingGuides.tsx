import { useEffect, useRef } from 'react';
import type { PointerEvent } from 'react';
import type { Point, Project } from '../types';
import { spacingAxis, spacingHandleValue, type SpacingOptions, type SpacingResult, type SpacingSession } from '../spacing';

export interface FieldSpacingPreview {
  session: SpacingSession; result: SpacingResult; original: Record<string, Point>; invalidInput: boolean;
  onUpdate: (options: SpacingOptions) => void;
  onApply: () => void; onCancel: () => void;
}
export function SpacingGuides({ preview, project, scale, flipped }: { preview: FieldSpacingPreview; project: Project; scale: number; flipped: boolean }) {
  const geometry = useRef<SVGGElement>(null);
  const drag = useRef<{ start: Point; options: SpacingOptions; group: SpacingResult['groups'][number] } | null>(null);
  const callback = useRef(preview.onUpdate); callback.current = preview.onUpdate;
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !drag.current) return;
      event.preventDefault(); event.stopPropagation(); callback.current(drag.current.options); drag.current = null;
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, []);
  const { session, result, original, onUpdate } = preview;
  const axis = spacingAxis(session.options.angle); const normal = { x: -axis.y, y: axis.x };
  const group = result.groups.reduce<SpacingResult['groups'][number] | null>((best, next) => !best || next.ids.length > best.ids.length ? next : best, null);
  const pointAt = (event: PointerEvent<SVGGElement>) => {
    const matrix = geometry.current?.getScreenCTM(); if (!matrix) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()); return { x: p.x, y: p.y };
  };
  function finish(event: PointerEvent<SVGGElement>, canceled = false) {
    event.stopPropagation(); const before = drag.current; drag.current = null;
    if (canceled && before) onUpdate(before.options);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  const handle = group && (session.options.anchor === 'end' ? group.start : group.end);
  return <g ref={geometry} className="spacing-guides" aria-hidden="true" stroke={result.error ? '#ffb6aa' : '#8dc8ff'}>
    <g pointerEvents="none" fill="none" strokeWidth={1.5 / scale}>
      {session.ids.map(id => <g key={id}><circle cx={original[id].x} cy={original[id].y} r={6 / scale} strokeDasharray={`${3 / scale} ${3 / scale}`} /><path data-spacing-path={id} d={`M${original[id].x},${original[id].y}L${result.positions[id].x},${result.positions[id].y}`} strokeDasharray={`${4 / scale} ${3 / scale}`} /></g>)}
      {result.groups.map((g, i) => <g key={i} data-spacing-guide={i}>
        <path d={`M${g.start.x},${g.start.y}L${g.end.x},${g.end.y}`} />
        {session.options.operation !== 'align' && g.ids.map((id, index) => {
          const p = { x: g.start.x + axis.x * g.interval * index, y: g.start.y + axis.y * g.interval * index };
          return <path key={id} d={`M${p.x - normal.x * 4 / scale},${p.y - normal.y * 4 / scale}L${p.x + normal.x * 4 / scale},${p.y + normal.y * 4 / scale}`} />;
        })}
        {g.ids.length > 1 && session.options.operation !== 'align' && <text x={(g.start.x + g.end.x) / 2} y={(g.start.y + g.end.y) / 2} transform={`translate(${normal.x * 14 / scale} ${normal.y * 14 / scale})${flipped ? ` rotate(180 ${(g.start.x + g.end.x) / 2} ${(g.start.y + g.end.y) / 2})` : ''}`} textAnchor="middle" fill="#e5f1ff" stroke="#16231c" strokeWidth={3 / scale} paintOrder="stroke" fontSize={11 / scale}>{Number(g.interval.toFixed(3))} yd</text>}
      </g>)}
    </g>
    {handle && group && group.ids.length > 1 && session.options.operation === 'interval' && <g data-spacing-handle="interval" transform={`translate(${handle.x} ${handle.y})`} style={{ cursor: preview.invalidInput ? 'not-allowed' : 'ew-resize', touchAction: 'none' }}
      onPointerDown={event => { event.preventDefault(); event.stopPropagation(); if (event.button !== 0 || preview.invalidInput) return; const start = pointAt(event); if (!start) return; drag.current = { start, options: session.options, group }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { event.stopPropagation(); const current = pointAt(event); if (current && drag.current) onUpdate(spacingHandleValue(drag.current.options, drag.current.group, drag.current.start, current, project)); }}
      onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => { if (drag.current) finish(event, true); }}>
      <title>Change exact interval · drag to preview; Inspector interval provides keyboard entry</title>
      <circle r={14 / scale} fill="transparent" stroke="none" /><rect x={-6 / scale} y={-6 / scale} width={12 / scale} height={12 / scale} fill="#fff" strokeWidth={2 / scale} />
    </g>}
  </g>;
}
