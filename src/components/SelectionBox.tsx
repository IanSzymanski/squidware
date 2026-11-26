import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { Point, Project } from '../types';
import { transformHandleValue } from '../transforms';
import type { ExactTransform } from '../transforms';
import type { FieldTransformPreview } from './TransformHandles';

export interface FieldSelectionBox {
  /** Begin a rotate-and-scale preview of the selection. Returns false when the editor cannot start one. */
  onStart: () => boolean;
  /** Commit the preview a handle drag produced, as one undoable edit. */
  onApply: () => void;
  onCancel: () => void;
  /** The box's width and height in the production's working unit, such as "12 × 8 steps". */
  size: (width: number, height: number) => string;
}

type BoxHandle = 'rotate' | 'scale';
interface Drag { handle: BoxHandle; start: Point; moved: boolean; base?: { options: ExactTransform; pivot: Point } }

/**
 * The frame around a multiple selection: its extent, its size in steps, and handles that rotate and scale it in
 * place. A handle drag runs the same transform preview as the Rotate tool and applies it on release.
 */
export function SelectionBox({ ids, positions, box, preview, field, scale, flipped, radius, onDragChange }: {
  ids: string[]; positions: Record<string, Point>; box: FieldSelectionBox; preview?: FieldTransformPreview;
  field: Project['field']; scale: number; flipped: boolean; radius: number; onDragChange: (active: boolean) => void;
}) {
  const geometry = useRef<SVGGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<BoxHandle | null>(null);
  const live = useRef(preview); live.current = preview;
  const actions = useRef(box); actions.current = box;
  const notify = useRef(onDragChange); notify.current = onDragChange;

  const end = (apply: boolean) => {
    const active = drag.current; drag.current = null;
    if (!active) return;
    setDragging(null); notify.current(false);
    if (apply && active.moved) actions.current.onApply(); else actions.current.onCancel();
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !drag.current) return;
      event.preventDefault(); event.stopPropagation(); end(false);
    };
    window.addEventListener('keydown', escape, true);
    return () => { window.removeEventListener('keydown', escape, true); if (drag.current) { drag.current = null; notify.current(false); } };
  }, []);

  const points = ids.map(id => positions[id]).filter(Boolean);
  if (points.length < 2) return null;
  const px = (value: number) => value / scale;
  const pad = px(radius + 9);
  const left = Math.min(...points.map(p => p.x)), right = Math.max(...points.map(p => p.x));
  const top = Math.min(...points.map(p => p.y)), bottom = Math.max(...points.map(p => p.y));
  const x = left - pad, y = top - pad, width = right - left + pad * 2, height = bottom - top + pad * 2;
  // "Above" and "below" are as the writer sees them, whichever way the field is turned.
  const above = flipped ? y + height : y, below = flipped ? y : y + height, up = flipped ? 1 : -1;
  const middle = x + width / 2;
  const rotateAt = { x: middle, y: above + up * px(22) };

  const pointAt = (event: PointerEvent<SVGGElement>) => {
    const matrix = geometry.current?.getScreenCTM();
    if (!matrix) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: p.x, y: p.y };
  };
  const handle = (kind: BoxHandle, at: Point, key: string, cursor: string, title: string) => <g key={key} data-selection-handle={key}
    transform={`translate(${at.x} ${at.y})`} style={{ cursor, touchAction: 'none' }}
    onPointerDown={event => {
      event.preventDefault(); event.stopPropagation();
      const start = pointAt(event);
      if (event.button !== 0 || !start) return;
      // Claim the drag before the preview starts, so the render that first sees the preview keeps this box mounted.
      drag.current = { handle: kind, start, moved: false };
      setDragging(kind); onDragChange(true);
      if (!box.onStart()) { drag.current = null; setDragging(null); onDragChange(false); return; }
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const active = drag.current, current = pointAt(event), session = live.current;
      if (!active) return;
      event.stopPropagation();
      if (!current || !session?.result.pivot) return;
      active.base ??= { options: session.session.options, pivot: session.result.pivot };
      if (!active.moved && Math.hypot(current.x - active.start.x, current.y - active.start.y) * scale < 3) return;
      active.moved = true;
      const next = transformHandleValue(active.base.options, kind, active.base.pivot, active.start, current, field);
      // Shift turns in 15° steps.
      session.onUpdate(kind === 'rotate' && event.shiftKey ? { ...next, angle: Math.round(next.angle / 15) * 15 } : next);
    }}
    onPointerUp={event => { event.stopPropagation(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); end(true); }}
    onPointerCancel={event => { event.stopPropagation(); end(false); }}
    onLostPointerCapture={() => { if (drag.current) end(false); }}>
    <title>{title}</title>
    <circle r={px(12)} fill="transparent" stroke="none" />
    {kind === 'rotate'
      ? <circle r={px(4.5)} fill="#fff" stroke="#10161b" strokeWidth={px(1.5)} />
      : <rect x={px(-4)} y={px(-4)} width={px(8)} height={px(8)} rx={px(1.5)} fill="#fff" stroke="#10161b" strokeWidth={px(1.5)} />}
  </g>;

  const options = preview?.session.options;
  const text = dragging === 'rotate' && options ? `${options.angle > 0 ? '+' : ''}${Math.round(options.angle)}°`
    : dragging === 'scale' && options ? `${Math.round(options.scale * 100)}%`
    : box.size(right - left, bottom - top);
  const chip = { width: px(text.length * 6.1 + 14), height: px(18), y: below - up * px(7 + 9) };

  return <g ref={geometry} className="selection-box" data-selection-box="" data-dragging={dragging ?? undefined}>
    <g pointerEvents="none" fill="none">
      <rect x={x} y={y} width={width} height={height} rx={px(6)} stroke="#10161b" strokeOpacity=".55" strokeWidth={px(3)} />
      <rect x={x} y={y} width={width} height={height} rx={px(6)} stroke="#fff" strokeOpacity=".8" strokeWidth={px(1)} strokeDasharray={`${px(5)} ${px(4)}`} />
      <path d={`M${middle},${above}V${rotateAt.y}`} stroke="#fff" strokeOpacity=".8" strokeWidth={px(1)} />
    </g>
    <g pointerEvents="none" transform={flipped ? `rotate(180 ${middle} ${chip.y})` : undefined}>
      <rect x={middle - chip.width / 2} y={chip.y - chip.height / 2} width={chip.width} height={chip.height} rx={px(5)} fill="#10151a" fillOpacity=".92" stroke="#fff" strokeOpacity=".16" strokeWidth={px(1)} />
      <text x={middle} y={chip.y + px(3.6)} textAnchor="middle" fill="#eef2f6" fontFamily="Inter, Arial, sans-serif" fontSize={px(10.5)} fontWeight={600} style={{ fontVariantNumeric: 'tabular-nums' }}>{text}</text>
    </g>
    {handle('rotate', rotateAt, 'rotate', 'grab', 'Drag to rotate the selection · Shift turns in 15° steps')}
    {([[x, y, 'nw', 'nwse-resize'], [x + width, y, 'ne', 'nesw-resize'], [x + width, y + height, 'se', 'nwse-resize'], [x, y + height, 'sw', 'nesw-resize']] as const)
      .map(([hx, hy, corner, cursor]) => handle('scale', { x: hx, y: hy }, `scale-${corner}`, cursor, 'Drag to scale the selection about its center'))}
  </g>;
}
