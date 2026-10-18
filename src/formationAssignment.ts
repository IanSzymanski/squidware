import type { FormationKind, FormationOptions, Point } from './types';

const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
// Quantized keys make ties transitive, including inverse-rotation roundoff.
const key = (value: number) => Math.round(value * 1e8);

/** Sum in stable identity order so roster shuffles cannot change the center. */
export function formationCenter(positions: Record<string, Point>, ids: readonly string[]): Point {
  return [...ids].sort(compareId).reduce((sum, id) => ({ x: sum.x + positions[id].x / ids.length, y: sum.y + positions[id].y / ids.length }), { x: 0, y: 0 });
}

/** A deterministic assignment plan, separate from destination generation/optimization. */
export function formationAssignmentOrder(positions: Record<string, Point>, ids: readonly string[], kind: FormationKind, options: FormationOptions): string[] {
  if (options.assignment !== undefined && !['position','roster'].includes(options.assignment)) throw new Error('Choose positional or roster assignment.');
  if (!ids.every(id => positions[id] && Number.isFinite(positions[id].x) && Number.isFinite(positions[id].y))) throw new Error('Formation source positions must be finite.');
  if (options.assignment !== 'position') return [...ids];
  const center = formationCenter(positions, ids);
  const radians = options.rotation * Math.PI / 180;
  const cosine = Math.cos(radians), sine = Math.sin(radians);
  const points = ids.map(id => {
    const dx = positions[id].x - center.x, dy = positions[id].y - center.y;
    const x = dx * cosine + dy * sine, y = -dx * sine + dy * cosine;
    const angle = (Math.atan2(y,x) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
    return { id, x: key(x), y: key(y), angle: key(angle) >= key(Math.PI * 2) ? 0 : key(angle), radius: key(Math.hypot(x,y)) };
  });
  type Entry = typeof points[number];
  const across = (a: Entry, b: Entry) => a.x-b.x || a.y-b.y || compareId(a.id,b.id);
  if (kind === 'circle') points.sort((a,b) => a.angle-b.angle || a.radius-b.radius || compareId(a.id,b.id));
  else if (kind === 'block') {
    const columns = Math.max(1, Math.min(ids.length, Math.floor(options.columns) || 1));
    points.sort((a,b) => a.y-b.y || a.x-b.x || compareId(a.id,b.id));
    for (let index=0; index<points.length; index+=columns) points.splice(index,columns,...points.slice(index,index+columns).sort(across));
  } else points.sort(across);
  return points.map(point => point.id);
}
