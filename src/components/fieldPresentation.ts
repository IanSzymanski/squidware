import type { Point } from '../types';

/** CSS pixels, independent of drill yards, zoom and device-pixel ratio. */
export interface FieldPresentation {
  colorMode: 'section' | 'selection' | 'custom';
  customColor: string;
  dotRadiusPx: number;
  pointerRadiusPx: number;
  touchRadiusPx: number;
  labelSizePx: number;
  /** Width and height in pixels of what floats over the view's right corners, where labels are not placed. */
  labelKeepOut?: { topRight?: readonly [number, number]; bottomRight?: readonly [number, number] };
  labelMode: 'all' | 'selected' | 'none';
}
export const DEFAULT_FIELD_PRESENTATION: Readonly<FieldPresentation> = {
  colorMode: 'section', customColor: '#b9ed85', dotRadiusPx: 3.5, pointerRadiusPx: 10, touchRadiusPx: 22, labelSizePx: 11, labelMode: 'all',
};
export interface ScreenDot extends Point { id: string }
export interface ScreenBox { left: number; top: number; right: number; bottom: number }
export const stableIdOrder = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Return only the nearest candidates, with deterministic ties independent of roster/SVG order. */
export function nearestFieldDots(dots: ScreenDot[], pointer: Point, radius: number): string[] {
  const candidates = dots.map(dot => ({ id: dot.id, distance: Math.hypot(dot.x - pointer.x, dot.y - pointer.y) }))
    .filter(dot => dot.distance <= radius);
  const nearest = Math.min(...candidates.map(dot => dot.distance));
  return candidates.filter(dot => dot.distance <= nearest + 1e-6).sort(stableIdOrder).map(dot => dot.id);
}

export interface HitCycle { ids: string[]; pointer: Point; index: number }
export function cycleFieldHit(ids: string[], pointer: Point, previous: HitCycle | null): HitCycle {
  const repeated = previous && Math.hypot(pointer.x - previous.pointer.x, pointer.y - previous.pointer.y) <= 3
    && ids.length === previous.ids.length && ids.every((id, i) => id === previous.ids[i]);
  return { ids, pointer, index: repeated ? (previous.index + 1) % Math.max(1, ids.length) : 0 };
}

const overlaps = (a: ScreenBox, b: ScreenBox) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
/** Small screen-space index keeps label placement local, including during playback. */
class Occupancy {
  cells = new Map<string, ScreenBox[]>();
  keys(box: ScreenBox) {
    const keys: string[] = [];
    for (let x = Math.floor(box.left / 32); x <= Math.floor(box.right / 32); x++)
      for (let y = Math.floor(box.top / 32); y <= Math.floor(box.bottom / 32); y++) keys.push(`${x},${y}`);
    return keys;
  }
  add(box: ScreenBox) { for (const key of this.keys(box)) { const cell = this.cells.get(key) ?? []; cell.push(box); this.cells.set(key, cell); } }
  intersects(box: ScreenBox) { return this.keys(box).some(key => this.cells.get(key)?.some(other => overlaps(box, other))); }
}

export interface LabelDot extends ScreenDot {
  labelWidth: number; selected: boolean; focused: boolean;
  /** The side to try first, for a dot on a sideline whose label belongs outside the field. */
  prefer?: 'above' | 'below';
}
/**
 * Prioritize focus, then selection, then stable IDs. A label goes to the dot's right when it fits, then left, above or
 * below. An unselected label that fits nowhere is left out; a selected or focused performer is always named, on the
 * first side that stays in view.
 */
export function layoutFieldLabels(dots: LabelDot[], bounds: ScreenBox, presentation: FieldPresentation): Map<string, ScreenBox> {
  const result = new Map<string, ScreenBox>();
  if (presentation.labelMode === 'none') return result;
  const occupied = new Occupancy();
  const radius = presentation.dotRadiusPx + 3;
  for (const dot of dots) occupied.add({ left: dot.x - radius, top: dot.y - radius, right: dot.x + radius, bottom: dot.y + radius });
  const { topRight, bottomRight } = presentation.labelKeepOut ?? {};
  if (topRight) occupied.add({ left: bounds.right - topRight[0], top: bounds.top, right: bounds.right, bottom: bounds.top + topRight[1] });
  if (bottomRight) occupied.add({ left: bounds.right - bottomRight[0], top: bounds.bottom - bottomRight[1], right: bounds.right, bottom: bounds.bottom });
  const ordered = dots.filter(dot => presentation.labelMode === 'all' || dot.selected || dot.focused)
    .sort((a, b) => Number(b.focused) - Number(a.focused) || Number(b.selected) - Number(a.selected) || stableIdOrder(a, b));
  const height = presentation.labelSizePx + 4;
  for (const dot of ordered) {
    const width = dot.labelWidth + 4;
    const gap = presentation.dotRadiusPx + 4;
    // Away from the usual right side a label sits a little farther out, leaving room for the leader that ties it to its dot.
    const far = gap + LABEL_LEADER_ROOM;
    const sides = {
      right: { x: dot.x + gap, y: dot.y - height / 2 },
      left: { x: dot.x - width - far, y: dot.y - height / 2 },
      above: { x: dot.x - width / 2, y: dot.y - height - far },
      below: { x: dot.x - width / 2, y: dot.y + far },
    };
    const order = dot.prefer === 'below' ? ['below', 'right', 'left', 'above'] as const : dot.prefer === 'above' ? ['above', 'right', 'left', 'below'] as const : ['right', 'left', 'above', 'below'] as const;
    const boxes = order.map(side => ({ left: sides[side].x, top: sides[side].y, right: sides[side].x + width, bottom: sides[side].y + height }))
      .filter(box => box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom);
    const box = boxes.find(candidate => !occupied.intersects(candidate)) ?? (dot.selected || dot.focused ? boxes[0] : undefined);
    if (box) { result.set(dot.id, box); occupied.add(box); }
  }
  return result;
}
const LABEL_LEADER_ROOM = 3;
/**
 * The short line from a dot to a label that is not on its usual right side, so the label cannot be read as a
 * neighbor's. Null for a label on the right, where adjacency already says whose it is.
 */
export function labelLeader(dot: Point, box: ScreenBox, dotRadius: number): { x1: number; y1: number; x2: number; y2: number } | null {
  if (box.left >= dot.x + dotRadius) return null;
  const x = Math.min(box.right, Math.max(box.left, dot.x)), y = Math.min(box.bottom - 3, Math.max(box.top + 3, dot.y));
  const dx = x - dot.x, dy = y - dot.y, length = Math.hypot(dx, dy);
  if (length <= dotRadius + 2) return null;
  return { x1: dot.x + dx / length * (dotRadius + 1.5), y1: dot.y + dy / length * (dotRadius + 1.5), x2: x, y2: y };
}
