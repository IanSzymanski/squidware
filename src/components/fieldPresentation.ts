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
  labelMode: 'adaptive' | 'all' | 'selected' | 'none';
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
/** East first: a label's usual place is to the right of its dot. Then west, north, south and the diagonals. */
const SIDES = [[1, 0], [-1, 0], [0, -1], [0, 1], [.7071, -.7071], [.7071, .7071], [-.7071, -.7071], [-.7071, .7071]] as const;
/** The label box whose near edge or corner is `distance` from the dot's center, on the given side. */
function labelBox(dot: Point, side: readonly [number, number], distance: number, width: number, height: number): ScreenBox {
  const [dx, dy] = side;
  const left = dx > .9 ? dot.x + distance : dx < -.9 ? dot.x - distance - width : dx === 0 ? dot.x - width / 2 : dx > 0 ? dot.x + distance * dx : dot.x - distance * -dx - width;
  const top = dy > .9 ? dot.y + distance : dy < -.9 ? dot.y - distance - height : dy === 0 ? dot.y - height / 2 : dy > 0 ? dot.y + distance * dy : dot.y - distance * -dy - height;
  return { left, top, right: left + width, bottom: top + height };
}
/** Which way is "out" for each dot: away from the middle of its neighbors, so labels on a curve or an edge sit outside it. */
function outwardSides(dots: readonly LabelDot[]): Map<string, readonly [number, number]> {
  const cell = 80, cells = new Map<string, LabelDot[]>();
  for (const dot of dots) { const key = `${Math.floor(dot.x / cell)},${Math.floor(dot.y / cell)}`; const list = cells.get(key); if (list) list.push(dot); else cells.set(key, [dot]); }
  const out = new Map<string, readonly [number, number]>();
  for (const dot of dots) {
    let x = 0, y = 0, count = 0;
    const cx = Math.floor(dot.x / cell), cy = Math.floor(dot.y / cell);
    for (let i = cx - 1; i <= cx + 1; i++) for (let j = cy - 1; j <= cy + 1; j++) for (const other of cells.get(`${i},${j}`) ?? []) {
      if (other === dot || Math.hypot(other.x - dot.x, other.y - dot.y) > cell) continue;
      x += other.x; y += other.y; count++;
    }
    if (count < 2) continue;
    const vx = dot.x - x / count, vy = dot.y - y / count, length = Math.hypot(vx, vy);
    // In the middle of a line or a block nothing is "out"; the usual order applies.
    if (length >= 3) out.set(dot.id, [vx / length, vy / length]);
  }
  return out;
}
/**
 * Prioritize focus, then selection, then stable IDs. A label goes to the outside of the form its dot is part of, or to
 * the dot's right where there is no outside, then to the other sides. An unselected label that fits nowhere is left
 * out. A selected or focused performer is always named: farther from its dot if it must be, tied to it by a leader, and
 * clear of other labels wherever that is possible.
 */
export function layoutFieldLabels(dots: LabelDot[], bounds: ScreenBox, presentation: FieldPresentation): Map<string, ScreenBox> {
  const result = new Map<string, ScreenBox>();
  if (presentation.labelMode === 'none') return result;
  const dotSpace = new Occupancy(), labelSpace = new Occupancy();
  const radius = presentation.dotRadiusPx + 3;
  for (const dot of dots) dotSpace.add({ left: dot.x - radius, top: dot.y - radius, right: dot.x + radius, bottom: dot.y + radius });
  const { topRight, bottomRight } = presentation.labelKeepOut ?? {};
  if (topRight) labelSpace.add({ left: bounds.right - topRight[0], top: bounds.top, right: bounds.right, bottom: bounds.top + topRight[1] });
  if (bottomRight) labelSpace.add({ left: bounds.right - bottomRight[0], top: bounds.bottom - bottomRight[1], right: bounds.right, bottom: bounds.bottom });
  const adaptive = presentation.labelMode === 'adaptive';
  const selectedCount = adaptive ? dots.filter(dot => dot.selected).length : 0;
  const showContext = presentation.labelMode === 'all' || (adaptive && selectedCount === 0);
  const ordered = dots.filter(dot => showContext || dot.selected || dot.focused)
    .sort((a, b) => Number(b.focused) - Number(a.focused) || Number(b.selected) - Number(a.selected) || stableIdOrder(a, b));
  const outward = outwardSides(dots);
  const height = presentation.labelSizePx + 4;
  const inView = (box: ScreenBox) => box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom;
  for (const dot of ordered) {
    const width = dot.labelWidth + 4;
    const gap = presentation.dotRadiusPx + 4;
    // Away from the usual right side a label sits a little farther out, leaving room for the leader that ties it to its dot.
    const far = gap + LABEL_LEADER_ROOM;
    const out = dot.prefer === 'below' ? [0, 1] as const : dot.prefer === 'above' ? [0, -1] as const : outward.get(dot.id);
    const sides = out ? [...SIDES].sort((a, b) => (b[0] * out[0] + b[1] * out[1]) - (a[0] * out[0] + a[1] * out[1])) : SIDES;
    const at = (extra: number) => sides.map(side => labelBox(dot, side, (side[0] > .9 ? gap : far) + extra, width, height)).filter(inView);
    const near = at(0);
    let box = near.find(candidate => !dotSpace.intersects(candidate) && !labelSpace.intersects(candidate));
    if (!box && (dot.focused || (dot.selected && (!adaptive || selectedCount === 1)))) {
      const reach = [...near, ...at(10), ...at(22), ...at(36)];
      box = reach.find(candidate => !dotSpace.intersects(candidate) && !labelSpace.intersects(candidate))
        ?? reach.find(candidate => !labelSpace.intersects(candidate)) ?? near[0];
    }
    if (box) {
      result.set(dot.id, box);
      // Screen-space breathing room thins context labels at Fit and reveals more as dots spread under zoom.
      const pad = adaptive ? height * (dot.selected || dot.focused ? 0.8 : 1.5) : 0;
      labelSpace.add({ left: box.left - pad, right: box.right + pad, top: box.top - pad, bottom: box.bottom + pad });
    }
  }
  return result;
}
const LABEL_LEADER_ROOM = 3;
/**
 * The short line from a dot to a label that does not sit right beside it, so the label cannot be read as a
 * neighbor's. Null for a label that touches its dot's margin, where adjacency already says whose it is.
 */
export function labelLeader(dot: Point, box: ScreenBox, dotRadius: number): { x1: number; y1: number; x2: number; y2: number } | null {
  const x = Math.min(box.right, Math.max(box.left, dot.x)), y = Math.min(box.bottom - 3, Math.max(box.top + 3, dot.y));
  const dx = x - dot.x, dy = y - dot.y, length = Math.hypot(dx, dy);
  // Right beside the dot, adjacency already says whose label it is.
  if (length <= dotRadius + 5 || length <= dotRadius + 2) return null;
  return { x1: dot.x + dx / length * (dotRadius + 1.5), y1: dot.y + dy / length * (dotRadius + 1.5), x2: x, y2: y };
}
