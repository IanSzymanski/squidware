import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { Point, Project } from '../types';
import { transformPositions } from '../domain';
import { affinePoint } from '../transforms';
import { formationBody } from '../formationGeometry';

export interface FieldSelectionBox {
  /** Commit a handle drag as one undoable edit: degrees clockwise and a scale factor about the selection's center. */
  onCommit: (transform: { rotation: number; scale: number }) => void;
}

type BoxHandle = 'rotate' | 'scale';
interface Drag { handle: BoxHandle; start: Point; pivot: Point; base: Record<string, Point>; rotation: number; scale: number; moved: boolean }

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * The frame around a multiple selection, with handles that rotate and scale it in place. A drag previews on the field
 * with the same arithmetic the edit uses and applies on release; nothing else in the window changes while it runs.
 */
export function SelectionBox({ ids, positions, original, box, field, scale, flipped, radius, onPreview }: {
  ids: string[];
  /** Where the dots are drawn now, including this box's own preview. */
  positions: Record<string, Point>;
  /** The saved positions a drag starts from. */
  original: Record<string, Point>;
  box: FieldSelectionBox; field: Project['field']; scale: number; flipped: boolean; radius: number;
  onPreview: (updates: Record<string, Point> | null) => void;
}) {
  const geometry = useRef<SVGGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [live, setLive] = useState<{ handle: BoxHandle; rotation: number; scale: number; pivot: Point; frame: { left: number; top: number; right: number; bottom: number } } | null>(null);
  const actions = useRef(box); actions.current = box;
  const preview = useRef(onPreview); preview.current = onPreview;

  const end = (apply: boolean) => {
    const active = drag.current; drag.current = null;
    if (!active) return;
    setLive(null);
    if (apply && active.moved && (active.rotation !== 0 || active.scale !== 1)) actions.current.onCommit({ rotation: active.rotation, scale: active.scale });
    preview.current(null);
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !drag.current) return;
      event.preventDefault(); event.stopPropagation(); end(false);
    };
    window.addEventListener('keydown', escape, true);
    return () => { window.removeEventListener('keydown', escape, true); if (drag.current) { drag.current = null; preview.current(null); } };
  }, []);

  const px = (value: number) => value / scale;
  const pad = px(radius + 9);
  // The frame holds the group: a performer standing well apart (a soloist offstage) neither stretches it nor moves its center.
  const bounds = (source: Record<string, Point>) => {
    const points = formationBody(source, ids.filter(id => source[id])).map(id => source[id]);
    return points.length < 2 ? null : {
      left: Math.min(...points.map(p => p.x)) - pad, right: Math.max(...points.map(p => p.x)) + pad,
      top: Math.min(...points.map(p => p.y)) - pad, bottom: Math.max(...points.map(p => p.y)) + pad,
    };
  };
  // At rest the frame is the selection's extent. During a drag it is the starting frame, turned and scaled with the dots.
  const frame = live?.frame ?? bounds(positions);
  if (!frame) return null;
  const turn = (point: Point) => live ? affinePoint(point, live.pivot, live.rotation, live.scale) : point;
  // "Above" is as the writer sees it, whichever way the field is turned.
  const above = flipped ? frame.bottom : frame.top, up = flipped ? 1 : -1;
  const middle = (frame.left + frame.right) / 2;
  const corners = ([[frame.left, frame.top, 'nw'], [frame.right, frame.top, 'ne'], [frame.right, frame.bottom, 'se'], [frame.left, frame.bottom, 'sw']] as const)
    .map(([x, y, name]) => ({ name, at: turn({ x, y }) }));
  const stemFrom = turn({ x: middle, y: above });
  // The stem keeps its on-screen length when the frame is scaled.
  const stemTo = turn({ x: middle, y: above + up * px(22) / (live?.scale ?? 1) });

  const pointAt = (event: PointerEvent<SVGGElement>) => {
    const matrix = geometry.current?.getScreenCTM();
    if (!matrix) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: p.x, y: p.y };
  };
  const handle = (kind: BoxHandle, at: Point, key: string, cursor: string, title: string) => <g key={key} data-selection-handle={key}
    transform={`translate(${at.x} ${at.y})`} style={{ cursor: live ? 'grabbing' : cursor, touchAction: 'none' }}
    onPointerDown={event => {
      event.preventDefault(); event.stopPropagation();
      const start = pointAt(event), from = bounds(original);
      const base = Object.fromEntries(ids.filter(id => original[id]).map(id => [id, original[id]]));
      const members = Object.values(base);
      if (event.button !== 0 || !start || !from || members.length < 2) return;
      // The same center the edit turns about: the mean of the group, leaving out anyone standing well apart.
      const body = formationBody(base, Object.keys(base)).map(id => base[id]);
      const pivot = body.reduce((sum, point) => ({ x: sum.x + point.x / body.length, y: sum.y + point.y / body.length }), { x: 0, y: 0 });
      drag.current = { handle: kind, start, pivot, base, rotation: 0, scale: 1, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
      setLive({ handle: kind, rotation: 0, scale: 1, pivot, frame: from });
    }}
    onPointerMove={event => {
      const active = drag.current, current = pointAt(event);
      if (!active) return;
      event.stopPropagation();
      if (!current) return;
      if (!active.moved && Math.hypot(current.x - active.start.x, current.y - active.start.y) * scale < 3) return;
      active.moved = true;
      const { pivot, start } = active;
      if (kind === 'rotate') {
        const delta = Math.atan2(current.y - pivot.y, current.x - pivot.x) - Math.atan2(start.y - pivot.y, start.x - pivot.x);
        const degrees = Math.atan2(Math.sin(delta), Math.cos(delta)) * 180 / Math.PI;
        // Whole degrees; Shift turns in 15° steps.
        active.rotation = event.shiftKey ? Math.round(degrees / 15) * 15 : Math.round(degrees);
      } else {
        const factor = Math.hypot(current.x - pivot.x, current.y - pivot.y) / Math.max(1e-6, Math.hypot(start.x - pivot.x, start.y - pivot.y));
        // Whole percent; Shift scales in 5% steps.
        active.scale = clamp(event.shiftKey ? Math.round(factor * 20) / 20 : Math.round(factor * 100) / 100, .05, 20);
      }
      setLive(state => state && { ...state, rotation: active.rotation, scale: active.scale });
      let updates: Record<string, Point> | null = null;
      try {
        const moved = transformPositions(active.base, Object.keys(active.base), { rotation: active.rotation, scale: active.scale }, field);
        updates = Object.fromEntries(Object.keys(active.base).map(id => [id, moved[id]]));
      } catch { /* An impossible transform keeps the last valid preview. */ }
      if (updates) preview.current(updates);
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

  const outline = corners.map(corner => `${corner.at.x},${corner.at.y}`).join(' ');
  const text = live?.handle === 'rotate' ? `${live.rotation > 0 ? '+' : ''}${live.rotation}°` : live ? `${Math.round(live.scale * 100)}%` : '';
  // The readout sits just past the handle being dragged, clear of the dots inside the frame.
  const chipAt = live ? (live.handle === 'rotate' ? { x: stemTo.x, y: stemTo.y + up * px(18) } : null) : null;
  const center = live?.pivot;
  const chip = { width: px(text.length * 6.6 + 14), height: px(18) };

  return <g ref={geometry} className="selection-box" data-selection-box="" data-dragging={live?.handle}>
    <g pointerEvents="none" fill="none" strokeLinejoin="round">
      <polygon points={outline} stroke="#10161b" strokeOpacity=".55" strokeWidth={px(3)} />
      <polygon points={outline} stroke="#fff" strokeOpacity=".8" strokeWidth={px(1)} strokeDasharray={`${px(5)} ${px(4)}`} />
      <path d={`M${stemFrom.x},${stemFrom.y}L${stemTo.x},${stemTo.y}`} stroke="#fff" strokeOpacity=".8" strokeWidth={px(1)} />
      {center && <path d={`M${center.x - px(5)},${center.y}h${px(10)}M${center.x},${center.y - px(5)}v${px(10)}`} stroke="#fff" strokeOpacity=".8" strokeWidth={px(1)} />}
    </g>
    {live && (() => {
      const at = chipAt ?? { x: center!.x, y: center!.y + up * px(16) };
      return <g pointerEvents="none" data-selection-readout="" transform={flipped ? `rotate(180 ${at.x} ${at.y})` : undefined}>
        <rect x={at.x - chip.width / 2} y={at.y - chip.height / 2} width={chip.width} height={chip.height} rx={px(5)} fill="#10151a" fillOpacity=".94" stroke="#fff" strokeOpacity=".2" strokeWidth={px(1)} />
        <text x={at.x} y={at.y + px(3.8)} textAnchor="middle" fill="#eef2f6" fontFamily="Inter, Arial, sans-serif" fontSize={px(11)} fontWeight={600} style={{ fontVariantNumeric: 'tabular-nums' }}>{text}</text>
      </g>;
    })()}
    {handle('rotate', stemTo, 'rotate', 'grab', 'Drag to rotate the selection · Shift turns in 15° steps')}
    {corners.map(corner => handle('scale', corner.at, `scale-${corner.name}`, corner.name === 'nw' || corner.name === 'se' ? 'nwse-resize' : 'nesw-resize', 'Drag to scale the selection about its center · Shift scales in 5% steps'))}
  </g>;
}
