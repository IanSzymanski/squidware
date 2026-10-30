import { useRef } from 'react';
import { FieldDrawing } from '../components/Field2D';
import { DEFAULT_SNAPPING, moveSelection } from '../snapping';
import type { Point, Project } from '../types';

/** Uses the same field artwork and destinations as the editor; no project mutation. */
export function TemplatePreview({ project, positions, ids = [], original, center, onCenter, snap = false, disabled = false }: {
  project: Project; positions: Record<string, Point>; ids?: string[]; original?: Record<string, Point>;
  center?: Point; onCenter?: (point: Point) => void; snap?: boolean; disabled?: boolean;
}) {
  const drag = useRef<{ id: number; center: Point } | null>(null);
  const height = project.field.height;
  const update = (point: Point, advance = false) => {
    if (!center || !onCenter || disabled) return;
    const after = moveSelection({ center }, ['center'], { x: point.x - center.x, y: point.y - center.y }, project.field,
      project.snapping ?? DEFAULT_SNAPPING, snap, 'center', { x: point.x !== center.x, y: point.y !== center.y, advance }).center;
    onCenter(after);
  };
  return <svg className="template-preview" viewBox={`-7 -8 ${project.field.width + 14} ${height + 16}`} role="group" aria-label="Template field preview"
    onPointerDown={event => {
      if (disabled || !center || !(event.target as Element).closest('[data-template-center]') || event.button !== 0) return;
      event.preventDefault(); drag.current = { id: event.pointerId, center }; event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      if (drag.current?.id !== event.pointerId) return;
      const matrix = event.currentTarget.getScreenCTM();
      if (matrix) update(new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()));
    }}
    onPointerUp={event => { if (drag.current?.id === event.pointerId) { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); } }}
    onPointerCancel={() => { if (drag.current) onCenter?.(drag.current.center); drag.current = null; }}>
    <title>Field preview in yards. Selected destinations have rings; dashed lines show travel from the current set.</title>
    <FieldDrawing project={project} positions={positions} selectedIds={ids} showLabels={false} />
    {original && <g className="template-travel" aria-hidden="true">{ids.map(id => original[id] && positions[id] && <path key={id} d={`M${original[id].x} ${original[id].y}L${positions[id].x} ${positions[id].y}`} />)}</g>}
    {center && onCenter && <g data-template-center tabIndex={disabled ? -1 : 0} role="button" aria-label="Move formation center" aria-disabled={disabled || undefined}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || disabled) return;
        event.preventDefault(); event.stopPropagation();
        const step = event.shiftKey ? .1 : 1;
        update({ x: center.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), y: center.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0) }, true);
      }}>
      <title>Drag the center or use arrow keys for 1 yard; Shift for 0.1 yard. Numeric center fields give exact placement. Field snapping applies to the handle.</title>
      <circle cx={center.x} cy={center.y} r="2.2" fill="var(--on-accent)" stroke="var(--accent)" strokeWidth=".4" />
      <path d={`M${center.x - 1} ${center.y}h2M${center.x} ${center.y - 1}v2`} stroke="var(--accent)" strokeWidth=".3" />
    </g>}
  </svg>;
}
