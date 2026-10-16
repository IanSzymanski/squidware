import { useEffect, useRef } from 'react';
import type { PointerEvent } from 'react';
import type { FormationOptions, Point, Project } from '../types';
import { formationHandleValue, formationPoint } from '../formationPreview';
import type { FormationHandle, FormationResult, FormationSession } from '../formationPreview';

export interface FieldFormationPreview {
  session: FormationSession; result: FormationResult; original: Record<string, Point>; invalidInput: boolean;
  onUpdate: (options: FormationOptions) => void; onCancel: () => void; onApply: () => void;
}

export function FormationHandles({ preview, field, scale }: { preview: FieldFormationPreview; field: Project['field']; scale: number }) {
  const geometry = useRef<SVGGElement>(null);
  const { session, result, original, onUpdate } = preview;
  const drag = useRef<{ handle: FormationHandle; start: Point; options: FormationOptions } | null>(null);
  const callback = useRef(onUpdate); callback.current = onUpdate;
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !drag.current) return;
      event.preventDefault(); event.stopPropagation(); callback.current(drag.current.options); drag.current = null;
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, []);
  const options = session.options;
  const at = (x: number, y: number) => formationPoint(options, x, y);
  function pointAt(event: PointerEvent<SVGGElement>) {
    const matrix = geometry.current?.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }
  function finish(event: PointerEvent<SVGGElement>, cancel = false) {
    event.stopPropagation(); const previous = drag.current; drag.current = null;
    if (cancel && previous) onUpdate(previous.options);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  const handle = (kind: FormationHandle, point: Point, label: string) => <g key={kind} data-formation-handle={kind} transform={`translate(${point.x} ${point.y})`}
    style={{ cursor: preview.invalidInput ? 'not-allowed' : kind === 'center' ? 'move' : 'crosshair', touchAction: 'none' }}
    onPointerDown={event => {
      event.preventDefault(); event.stopPropagation(); if (event.button !== 0 || preview.invalidInput) return;
      const start = pointAt(event); if (!start) return;
      drag.current = { handle: kind, start, options }; event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={event => {
      event.stopPropagation(); const active = drag.current; const current = pointAt(event);
      if (active && current) onUpdate(formationHandleValue(session.kind,active.options,active.handle,active.start,current,field));
    }} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event,true)} onLostPointerCapture={event => { if (drag.current) finish(event,true); }}>
    <title>{label} · drag to preview; Inspector numbers provide keyboard entry</title>
    <circle r={13/scale} fill="transparent" stroke="none" />
    <circle r={kind === 'center' ? 7/scale : 6/scale} fill={kind === 'center' ? '#d4e6ff' : '#fff'} strokeWidth={2/scale} />
    {kind === 'center' && <path d={`M${-10/scale},0h${20/scale}M0,${-10/scale}v${20/scale}`} strokeWidth={1.5/scale} />}
  </g>;
  const endpoints = session.kind === 'line' || session.kind === 'arc';
  const baseline = session.kind === 'arc' ? -options.height/2 : 0;
  const start = at(-options.width/2,baseline); const end = at(options.width/2,baseline);
  const rotation = at(0, -(session.kind === 'line' ? 0 : options.height/2)-30/scale);
  const outline = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y]) => at(x*options.width/2,y*options.height/2));
  return <g ref={geometry} className="formation-handles" aria-hidden="true" stroke={result.error ? '#ffb6aa' : '#8dc8ff'}>
    <g pointerEvents="none" fill="none" strokeWidth={1.5/scale} strokeDasharray={`${4/scale} ${3/scale}`}>
      {session.ids.map(id => <g key={id}><circle cx={original[id].x} cy={original[id].y} r={6/scale} /><path d={`M${original[id].x},${original[id].y}L${result.positions[id].x},${result.positions[id].y}`} /></g>)}
      {endpoints ? <path d={`M${start.x},${start.y}L${end.x},${end.y}`} /> : <polygon points={outline.map(p => `${p.x},${p.y}`).join(' ')} />}
      <path d={`M${options.center.x},${options.center.y}L${rotation.x},${rotation.y}`} />
    </g>
    {endpoints ? <>{handle('start',start,'Move start endpoint')}{handle('end',end,'Move end endpoint')}</> : handle('width',at(options.width/2,0),'Change width')}
    {session.kind !== 'line' && handle(session.kind === 'arc' ? 'bulge' : 'depth',at(0,options.height/2),session.kind === 'arc' ? 'Change arc bulge' : 'Change depth')}
    {handle('rotate',rotation,'Rotate formation')}{handle('center',options.center,'Move formation center')}
  </g>;
}
