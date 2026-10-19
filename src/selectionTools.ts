import type { Point } from './types';

export type SelectionSpec = { kind: 'rank' | 'file'; anchorId: string; tolerance: number } | { kind: 'lasso'; points: Point[]; tolerance: number };
export interface SelectionCandidate { id: string; distance: number; boundary: boolean }
export interface SelectionReview {
  spec: SelectionSpec; candidates: SelectionCandidate[]; ids: string[]; additive: boolean;
  initialIds: string[]; revision: number; setId: string; query: string; section: string;
}

export function invertSelection(current: readonly string[], scope: readonly string[]): string[] {
  const visible = new Set(scope), selected = new Set(current);
  return [...current.filter(id => !visible.has(id)), ...scope.filter(id => !selected.has(id))];
}

export function parseLassoPoints(text: string): Point[] {
  return text.trim().split(/\n|;/).map(line => {
    const values = line.trim().split(/[ ,]+/);
    if (values.length !== 2 || values.some(value => !value.trim() || !Number.isFinite(Number(value)))) throw new Error('Enter one x, y pair in yards per line.');
    return { x: Number(values[0]), y: Number(values[1]) };
  });
}

function segmentDistance(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = dx || dy ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

/** Even-odd fill, including the closing edge; screen orientation never changes membership. */
function polygonDistance(point: Point, polygon: readonly Point[]): { inside: boolean; distance: number } {
  let inside = false, distance = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    distance = Math.min(distance, segmentDistance(point, a, b));
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return { inside, distance };
}

/** Inclusive yard tolerance, stable roster order, and explicit near-boundary candidates. */
export function previewSelection(positions: Readonly<Record<string, Point>>, scope: readonly string[], spec: SelectionSpec): { candidates: SelectionCandidate[]; ids: string[] } {
  if (!Number.isFinite(spec.tolerance) || spec.tolerance < 0 || spec.tolerance > 5) throw new Error('Selection tolerance must be from 0 to 5 yards.');
  if (spec.kind !== 'rank' && spec.kind !== 'file' && spec.kind !== 'lasso') throw new Error('Choose rank, file or lasso selection.');
  if (spec.kind === 'lasso') {
    if (!Array.isArray(spec.points) || spec.points.length < 3 || spec.points.length > 512 || spec.points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 1000 || Math.abs(p.y) > 1000)) throw new Error('A lasso needs 3–512 finite points within 1000 yards of the field.');
    const a = spec.points[0], b = spec.points.find(p => Math.hypot(p.x - a.x, p.y - a.y) > 1e-6);
    if (!b || !spec.points.some(p => Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) > 1e-6)) throw new Error('Draw an area with at least three non-collinear points.');
  } else if (!scope.includes(spec.anchorId) || !positions[spec.anchorId]) throw new Error('Choose an anchor in the current Cast filters.');
  const band = Math.max(.05, spec.tolerance * .15), candidates: SelectionCandidate[] = [], ids: string[] = [];
  for (const id of new Set(scope)) {
    const point = positions[id]; if (!point) continue;
    const { inside, distance } = spec.kind === 'lasso' ? polygonDistance(point, spec.points)
      : { inside: false, distance: Math.abs(point[spec.kind === 'rank' ? 'y' : 'x'] - positions[spec.anchorId][spec.kind === 'rank' ? 'y' : 'x']) };
    const included = inside || distance <= spec.tolerance + 1e-9;
    const boundary = spec.kind === 'lasso' ? distance <= spec.tolerance + band : Math.abs(distance - spec.tolerance) <= band + 1e-9;
    if (included || boundary) candidates.push({ id, distance, boundary });
    if (included) ids.push(id);
  }
  return { candidates, ids };
}
