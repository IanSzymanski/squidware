import type { Point } from '../types';

/** CSS pixels, independent of drill yards, zoom and device-pixel ratio. #42 owns persistence. */
export interface FieldPresentation {
  dotRadiusPx: number;
  pointerRadiusPx: number;
  touchRadiusPx: number;
  labelSizePx: number;
  labelMode: 'all' | 'selected' | 'none';
}
export const DEFAULT_FIELD_PRESENTATION: Readonly<FieldPresentation> = {
  dotRadiusPx: 3, pointerRadiusPx: 10, touchRadiusPx: 22, labelSizePx: 12, labelMode: 'all',
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

export interface LabelDot extends ScreenDot { labelWidth: number; selected: boolean; focused: boolean }
/** Prioritize focus, then selection, then stable IDs. Try four sides; suppress if none fits. */
export function layoutFieldLabels(dots: LabelDot[], bounds: ScreenBox, presentation: FieldPresentation): Map<string, ScreenBox> {
  const result = new Map<string, ScreenBox>();
  if (presentation.labelMode === 'none') return result;
  const occupied = new Occupancy();
  const radius = presentation.dotRadiusPx + 3;
  for (const dot of dots) occupied.add({ left: dot.x - radius, top: dot.y - radius, right: dot.x + radius, bottom: dot.y + radius });
  const ordered = dots.filter(dot => presentation.labelMode === 'all' || dot.selected || dot.focused)
    .sort((a, b) => Number(b.focused) - Number(a.focused) || Number(b.selected) - Number(a.selected) || stableIdOrder(a, b));
  const height = presentation.labelSizePx + 4;
  for (const dot of ordered) {
    const width = dot.labelWidth + 4;
    const gap = presentation.dotRadiusPx + 4;
    const starts = [
      { x: dot.x + gap, y: dot.y - height / 2 },
      { x: dot.x - width - gap, y: dot.y - height / 2 },
      { x: dot.x - width / 2, y: dot.y - height - gap },
      { x: dot.x - width / 2, y: dot.y + gap },
    ];
    for (const start of starts) {
      const box = { left: start.x, top: start.y, right: start.x + width, bottom: start.y + height };
      if (box.left < bounds.left || box.right > bounds.right || box.top < bounds.top || box.bottom > bounds.bottom || occupied.intersects(box)) continue;
      result.set(dot.id, box); occupied.add(box); break;
    }
  }
  return result;
}
