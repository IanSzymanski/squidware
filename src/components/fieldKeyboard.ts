import type { Point } from '../types';

export const FIELD_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'] as const;
export type FieldKey = typeof FIELD_KEYS[number];

/** Spatial focus does not select or edit. Roster stepping also reaches overlapping dots. */
export function nextFieldFocus(ids: readonly string[], positions: Record<string, Point>, current: string | null, key: FieldKey): string | null {
  const available = ids.filter(id => positions[id]);
  if (!available.length) return null;
  const index = available.indexOf(current ?? '');
  if (key === 'Home') return available[0];
  if (key === 'End') return available.at(-1)!;
  if (index < 0) return available[0];
  if (key === 'PageUp' || key === 'PageDown') return available[Math.max(0, Math.min(available.length - 1, index + (key === 'PageUp' ? -1 : 1)))];
  const from = positions[current!];
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
  const sign = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
  let closest = current;
  let distance = Infinity;
  for (const id of available) {
    if (id === current) continue;
    const dx = positions[id].x - from.x; const dy = positions[id].y - from.y;
    if ((horizontal ? dx : dy) * sign <= 1e-8) continue;
    const squared = dx * dx + dy * dy;
    if (squared < distance - 1e-8) { closest = id; distance = squared; }
  }
  return closest;
}
