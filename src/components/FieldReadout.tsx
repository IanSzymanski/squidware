import { useEffect, useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';
import { coordinateDescription } from '../domain';
import type { Point, Project } from '../types';

interface FieldReadoutProps {
  id: string;
  svgRef: RefObject<SVGSVGElement | null>;
  project: Project;
  positions: Record<string, Point>;
  selectedIds: string[];
  viewport: string;
  readOnly: boolean;
  keyboardFocusedId?: string | null;
}

const performerId = (target: EventTarget | null) => target instanceof Element ? target.closest('[data-performer-id]')?.getAttribute('data-performer-id') ?? null : null;

/** Pointer feedback lives here so moving across empty field does not redraw the dots. */
export function FieldReadout({ id, svgRef, project, positions, selectedIds, viewport, readOnly, keyboardFocusedId }: FieldReadoutProps) {
  const [cursor, setCursor] = useState<{ x: number; y: number; performerId: string | null } | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [sizeVersion, setSizeVersion] = useState(0);
  const [readout, setReadout] = useState<{ title: string; description: string; left: number; top: number } | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    let frame = 0;
    let latest: typeof cursor = null;
    const pointer = (event: PointerEvent) => {
      latest = { x: event.clientX, y: event.clientY, performerId: performerId(event.target) };
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; setCursor(latest); });
    };
    const leave = () => { cancelAnimationFrame(frame); frame = 0; latest = null; setCursor(null); };
    const focus = (event: FocusEvent) => setFocusedId(performerId(event.target));
    const blur = () => setFocusedId(null);
    svg.addEventListener('pointermove', pointer);
    svg.addEventListener('pointerdown', pointer);
    svg.addEventListener('pointerleave', leave);
    svg.addEventListener('focusin', focus);
    svg.addEventListener('focusout', blur);
    const observer = new ResizeObserver(() => setSizeVersion(value => value + 1));
    observer.observe(svg);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      svg.removeEventListener('pointermove', pointer);
      svg.removeEventListener('pointerdown', pointer);
      svg.removeEventListener('pointerleave', leave);
      svg.removeEventListener('focusin', focus);
      svg.removeEventListener('focusout', blur);
    };
  }, [svgRef]);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) { setReadout(null); return; }
    // Re-hit-test after zoom, pan or playback moves a dot beneath a stationary cursor.
    const hoveredId = cursor ? performerId(document.elementFromPoint(cursor.x, cursor.y)) : null;
    const keyboardTarget = keyboardFocusedId === performerId(document.activeElement) ? keyboardFocusedId : null;
    const targetId = keyboardTarget || focusedId || hoveredId || (!cursor && selectedIds.length === 1 ? selectedIds[0] : null);
    const performer = project.performers.find(person => person.id === targetId);
    const point = performer ? positions[performer.id] : cursor ? new DOMPoint(cursor.x, cursor.y).matrixTransform(matrix.inverse()) : null;
    // Only tolerate matrix roundoff at the boundary; clear actual out-of-field points.
    const epsilon = 1e-8;
    if (!point || point.x < -epsilon || point.y < -epsilon || point.x > project.field.width + epsilon || point.y > project.field.height + epsilon) { setReadout(null); return; }
    const position = { x: Math.max(0, Math.min(project.field.width, point.x)), y: Math.max(0, Math.min(project.field.height, point.y)) };
    const bounds = svg.getBoundingClientRect();
    const anchor = new DOMPoint(position.x, position.y).matrixTransform(matrix);
    if (anchor.x < bounds.left || anchor.x > bounds.right || anchor.y < bounds.top || anchor.y > bounds.bottom) { setReadout(null); return; }
    const section = project.sections.find(item => item.id === performer?.sectionId);
    setReadout({
      title: performer ? [performer.label, performer.name, section?.name].filter(Boolean).join(' · ') : 'Cursor',
      description: coordinateDescription(position, project.field),
      left: Math.max(8, Math.min(bounds.width - 308, anchor.x - bounds.left + 14)),
      top: Math.max(readOnly ? 122 : 42, Math.min(bounds.height - 100, anchor.y - bounds.top + 18)),
    });
  }, [cursor, focusedId, keyboardFocusedId, project, positions, selectedIds, viewport, sizeVersion, svgRef, readOnly]);

  return readout && <div id={id} className="field-readout" style={{ left: readout.left, top: readout.top }}><strong>{readout.title}</strong><span>{readout.description}</span></div>;
}
