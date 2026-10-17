import type { Point, Project } from './types';

export interface SnapSettings {
  steps: 8 | 6 | 12;
  subdivision: 1 | 2 | 4;
  target: 'grid' | 'markings';
  group: 'anchor' | 'individual';
}
export const DEFAULT_SNAPPING: Readonly<SnapSettings> = { steps: 8, subdivision: 1, target: 'grid', group: 'anchor' };

export function validateSnapSettings(input: unknown): SnapSettings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid snapping settings: expected an object.');
  const value = input as Record<string, unknown>;
  if (![8, 6, 12].includes(value.steps as number) || ![1, 2, 4].includes(value.subdivision as number)
    || !['grid', 'markings'].includes(value.target as string) || !['anchor', 'individual'].includes(value.group as string)) {
    throw new Error('Invalid snapping settings: choose 8, 6 or 12 steps per 5 yards, whole/half/quarter steps, grid/markings and anchor/individual mode.');
  }
  return { steps: value.steps, subdivision: value.subdivision, target: value.target, group: value.group } as SnapSettings;
}
export const gridInterval = (settings: SnapSettings) => 5 / settings.steps / settings.subdivision;
export function snapDescription(settings: SnapSettings, enabled = true): string {
  if (!enabled) return 'Snap off · Unquantized moves';
  const target = settings.target === 'markings' ? 'Yard lines / hashes' : `${settings.steps}-to-5 · ${settings.subdivision === 1 ? 'whole' : settings.subdivision === 2 ? 'half' : 'quarter'} steps`;
  return `${target} · ${settings.group === 'anchor' ? 'Keep group spacing' : 'Individual dots (spacing changes)'}`;
}
export const hashLines = (field: Project['field']) => {
  const inset = field.preset === 'college' ? 20 : field.height / 3;
  return [0, inset, field.height - inset, field.height];
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Ties choose the smaller physical coordinate, independent of view orientation.
 * Bounds have priority when a rigid group's legal interval contains no target. */
function snapAxis(value: number, min: number, max: number, spacing: number, targets?: number[]): number {
  if (targets) {
    const legal = targets.filter(target => target >= min - 1e-9 && target <= max + 1e-9).sort((a, b) => a - b);
    if (!legal.length) return clamp(value, min, max);
    return clamp(legal.reduce((best, next) => Math.abs(next - value) < Math.abs(best - value) - 1e-9 ? next : best), min, max);
  }
  const first = Math.ceil(min / spacing - 1e-9);
  const last = Math.floor(max / spacing + 1e-9);
  if (first > last) return clamp(value, min, max);
  const index = clamp(Math.ceil(value / spacing - .5 - 1e-9), first, last);
  return clamp(index * spacing, min, max);
}

/** One physical-coordinate implementation for drag, keyboard, Inspector and numeric placement.
 * Callers commit these exact updates; they must not snap a preview for a second time. */
export function moveSelection(positions: Record<string, Point>, ids: readonly string[], delta: Point, field: Project['field'],
  settings: SnapSettings = DEFAULT_SNAPPING, enabled = true, anchorId?: string, axes: { x: boolean; y: boolean; advance?: boolean } = { x: true, y: true }): Record<string, Point> {
  if (![delta.x, delta.y].every(Number.isFinite)) throw new Error('Movement must use finite coordinates.');
  const selected = [...new Set(ids)].filter(id => Object.hasOwn(positions, id)).sort();
  if (!selected.length) return {};
  const first = [...selected].sort((a, b) => positions[a].x - positions[b].x || positions[a].y - positions[b].y || (a < b ? -1 : a > b ? 1 : 0))[0];
  const anchor = positions[anchorId && selected.includes(anchorId) ? anchorId : first];
  const points = selected.map(id => positions[id]);
  const spacing = settings.target === 'grid' ? gridInterval(settings) : 5;
  const snap = (value: number, min: number, max: number, axis: 'x' | 'y', from: number) => {
    if (!enabled || !axes[axis]) return clamp(value, min, max);
    const targets = settings.target === 'markings' && axis === 'y' ? hashLines(field) : undefined;
    let result = snapAxis(value, min, max, spacing, targets);
    // A short nudge advances to the next target instead of getting stuck on the current one.
    // Once a rigid group reaches an off-grid edge, another nudge must stay there,
    // rather than snapping backward and alternating between the edge and grid.
    if (axes.advance && delta[axis] > 0 && max <= from + 1e-9) return clamp(from, min, max);
    if (axes.advance && delta[axis] < 0 && min >= from - 1e-9) return clamp(from, min, max);
    if (axes.advance && delta[axis] > 0 && result <= from + 1e-9 && max > from + 1e-9) result = snapAxis(value, Math.min(max, from + 1e-7), max, spacing, targets);
    if (axes.advance && delta[axis] < 0 && result >= from - 1e-9 && min < from - 1e-9) result = snapAxis(value, min, Math.max(min, from - 1e-7), spacing, targets);
    return result;
  };
  if (enabled && settings.group === 'individual') {
    return Object.fromEntries(selected.map(id => [id, {
      x: snap(positions[id].x + delta.x, 0, field.width, 'x', positions[id].x),
      y: snap(positions[id].y + delta.y, 0, field.height, 'y', positions[id].y),
    }]));
  }
  const dx = snap(anchor.x + delta.x, anchor.x - Math.min(...points.map(p => p.x)), anchor.x + field.width - Math.max(...points.map(p => p.x)), 'x', anchor.x) - anchor.x;
  const dy = snap(anchor.y + delta.y, anchor.y - Math.min(...points.map(p => p.y)), anchor.y + field.height - Math.max(...points.map(p => p.y)), 'y', anchor.y) - anchor.y;
  return Object.fromEntries(selected.map(id => [id, { x: clamp(positions[id].x + dx, 0, field.width), y: clamp(positions[id].y + dy, 0, field.height) }]));
}
