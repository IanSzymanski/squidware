import { useEffect, useRef } from 'react';
import type { PointerEvent } from 'react';
import type { Point, Project } from '../types';
import { affinePoint, transformHandleValue } from '../transforms';
import type { ExactTransform, TransformHandle, TransformResult, TransformSession } from '../transforms';

export interface FieldTransformPreview {
  session: TransformSession; result: TransformResult; original: Record<string, Point>;
  onUpdate: (options: ExactTransform) => void; onCancel: () => void; invalidInput: boolean;
}

export function TransformHandles({ preview, field, scale }: { preview: FieldTransformPreview; field: Project['field']; scale: number }) {
  const geometry = useRef<SVGGElement>(null);
  const { session, result, original, onUpdate } = preview;
  const drag = useRef<{ handle: TransformHandle; start: Point; pivot: Point; options: ExactTransform } | null>(null);
  const callback = useRef(onUpdate); callback.current = onUpdate;
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !drag.current) return;
      event.preventDefault(); event.stopPropagation(); callback.current(drag.current.options); drag.current = null;
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, []);
  const pivot = result.pivot;
  if (!pivot) return null;
  const pointAt = (event: PointerEvent<SVGGElement>) => {
    const matrix = geometry.current?.getScreenCTM();
    if (!matrix) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: p.x, y: p.y };
  };
  const selected = session.ids.map(id => original[id]);
  const farthest = selected.reduce((best, p) => Math.hypot(p.x-pivot.x,p.y-pivot.y) > Math.hypot(best.x-pivot.x,best.y-pivot.y) ? p : best, selected[0]);
  const distance = Math.hypot(farthest.x-pivot.x,farthest.y-pivot.y);
  const anchor = distance < 1 ? { x: pivot.x + 6, y: pivot.y } : farthest;
  const endpoint = affinePoint(anchor, pivot, session.options.angle, session.options.scale);
  const radial = Math.max(1e-6, Math.hypot(endpoint.x-pivot.x, endpoint.y-pivot.y));
  const rotate = { x: endpoint.x + (endpoint.y-pivot.y) / radial * 28 / scale, y: endpoint.y - (endpoint.x-pivot.x) / radial * 28 / scale };
  function start(event: PointerEvent<SVGGElement>, handle: TransformHandle) {
    event.preventDefault(); event.stopPropagation();
    if (event.button !== 0 || preview.invalidInput || session.options.operation !== 'rotate-scale') return;
    const point = pointAt(event); if (!point || !pivot) return;
    drag.current = { handle, start: point, pivot, options: session.options };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function finish(event: PointerEvent<SVGGElement>, canceled = false) {
    event.stopPropagation(); const previous = drag.current; drag.current = null;
    if (canceled && previous) onUpdate(previous.options);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  const handle = (kind: TransformHandle, point: Point, label: string) => <g key={kind} data-transform-handle={kind}
    transform={`translate(${point.x} ${point.y})`} style={{ cursor: preview.invalidInput ? 'not-allowed' : kind === 'pivot' ? 'move' : 'crosshair', touchAction: 'none' }}
    onPointerDown={event => start(event, kind)} onPointerMove={event => {
      event.stopPropagation(); const active = drag.current; const current = pointAt(event);
      if (active && current) onUpdate(transformHandleValue(active.options, active.handle, active.pivot, active.start, current, field));
    }} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => { if (drag.current) finish(event, true); }}>
    <title>{label} · drag to preview; use Inspector numbers for keyboard entry</title>
    <circle r={13/scale} fill="transparent" stroke="none" />
    {kind === 'scale' ? <rect x={-6/scale} y={-6/scale} width={12/scale} height={12/scale} fill="#fff" strokeWidth={2/scale} />
      : <circle r={kind === 'pivot' ? 7/scale : 6/scale} fill={kind === 'pivot' ? '#d4e6ff' : '#fff'} strokeWidth={2/scale} />}
    {kind === 'pivot' && <path d={`M${-10/scale},0h${20/scale}M0,${-10/scale}v${20/scale}`} strokeWidth={1.5/scale} />}
  </g>;
  return <g ref={geometry} className={`transform-handles${result.error ? ' transform-handles--invalid' : ''}`} aria-hidden="true" stroke={result.error ? '#ffb6aa' : '#8dc8ff'}>
    <g pointerEvents="none" fill="none" strokeWidth={1.5/scale} strokeDasharray={`${4/scale} ${3/scale}`}>
      {session.ids.map(id => <circle key={id} cx={original[id].x} cy={original[id].y} r={6/scale} />)}
      {session.options.operation === 'rotate-scale' ? <><path d={`M${pivot.x},${pivot.y}L${endpoint.x},${endpoint.y}L${rotate.x},${rotate.y}`} /><circle cx={pivot.x} cy={pivot.y} r={radial} /></>
        : session.options.operation === 'across-50' ? <path d={`M${field.width/2},0v${field.height}`} /> : <path d={`M0,${field.height/2}h${field.width}`} />}
    </g>
    {session.options.operation === 'rotate-scale' && <>{handle('rotate', rotate, 'Rotate selection')}{handle('scale', endpoint, 'Scale selection')}{handle('pivot', pivot, 'Move pivot')}</>}
  </g>;
}
