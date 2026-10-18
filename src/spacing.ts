import type { Point, Project } from './types';
import { DEFAULT_SNAPPING } from './snapping';

export type SpacingOperation = 'align' | 'distribute' | 'interval';
export interface SpacingOptions {
  operation: SpacingOperation;
  /** Physical coordinate axis, clockwise from X. Display orientation never changes it. */
  angle: number;
  anchor: 'start' | 'center' | 'end';
  interval: number; unit: 'yards' | 'steps';
  lanes: boolean; laneTolerance: number;
}
export interface SpacingSession { revision: number; setId: string; ids: string[]; options: SpacingOptions }
export interface SpacingGroup { ids: string[]; start: Point; end: Point; interval: number }
export interface SpacingResult {
  positions: Record<string, Point>; updates: Record<string, Point>; groups: SpacingGroup[];
  changed: boolean; error: string | null;
}
export const defaultSpacing = (): SpacingOptions => ({ operation: 'align', angle: 90, anchor: 'center', interval: 2, unit: 'steps', lanes: false, laneTolerance: .1 });
export const spacingUnit = (options: SpacingOptions, project: Pick<Project, 'snapping'>) => options.unit === 'steps' ? 5 / (project.snapping ?? DEFAULT_SNAPPING).steps : 1;
export function spacingAxis(angle: number): Point {
  const radians = angle * Math.PI / 180;
  const clean = (n: number) => Math.abs(n) < 1e-12 ? 0 : Math.abs(n - 1) < 1e-12 ? 1 : Math.abs(n + 1) < 1e-12 ? -1 : n;
  return { x: clean(Math.cos(radians)), y: clean(Math.sin(radians)) };
}
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const coordinateKey = (n: number) => Math.round(n * 1e8);
const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** One evaluator for guides, handles, numeric preview and Apply. No grid quantization.
 * Sort by projected coordinate, perpendicular coordinate, then stable ID (1e-8 yd keys).
 * Optional lanes are perpendicular-coordinate bands measured from each band's first dot,
 * rather than chaining adjacent near neighbors into an arbitrarily wide band. */
export function previewSpacing(positions: Record<string, Point>, ids: readonly string[], options: SpacingOptions, field: Project['field'], project: Pick<Project, 'snapping'> = {}): SpacingResult {
  try {
    const selected = [...new Set(ids)];
    if (selected.length < 2 || selected.some(id => !Object.hasOwn(positions, id))) throw new Error('Select at least two performers on this set.');
    if (!['align', 'distribute', 'interval'].includes(options.operation) || !['start', 'center', 'end'].includes(options.anchor)) throw new Error('Choose a supported spacing operation and anchor.');
    if (!Number.isFinite(options.angle) || Math.abs(options.angle) > 3600) throw new Error('Axis angle must be between −3600° and 3600°.');
    if (!['yards', 'steps'].includes(options.unit) || !Number.isFinite(options.interval) || options.interval <= 0 || options.interval > 1000) throw new Error('Interval must be greater than zero and at most 1000 yards or steps.');
    if (typeof options.lanes !== 'boolean' || !Number.isFinite(options.laneTolerance) || options.laneTolerance < 0 || options.laneTolerance > 10) throw new Error('Lane tolerance must be from 0 to 10 yards.');
    const axis = spacingAxis(options.angle); const normal = { x: -axis.y, y: axis.x };
    const at = (a: number, b: number): Point => ({ x: axis.x * a + normal.x * b, y: axis.y * a + normal.y * b });
    const points = selected.map(id => {
      const point = positions[id];
      if (![point.x, point.y].every(Number.isFinite)) throw new Error('Selected positions must be finite.');
      return { id, a: dot(point, axis), b: dot(point, normal) };
    });
    const bands: (typeof points)[] = [];
    if (options.lanes && options.operation !== 'align') {
      points.sort((p, q) => coordinateKey(p.b) - coordinateKey(q.b) || coordinateKey(p.a) - coordinateKey(q.a) || compareId(p.id, q.id));
      for (const point of points) {
        const last = bands.at(-1);
        if (!last || point.b - last[0].b > options.laneTolerance + 1e-8) bands.push([point]);
        else last.push(point);
      }
    } else bands.push(points);
    const updates: Record<string, Point> = {}; const groups: SpacingGroup[] = [];
    let changed = false; let outside = false;
    for (const band of bands) {
      band.sort((p, q) => coordinateKey(p.a) - coordinateKey(q.a) || coordinateKey(p.b) - coordinateKey(q.b) || compareId(p.id, q.id));
      const min = Math.min(...band.map(p => p.a)); const max = Math.max(...band.map(p => p.a));
      const center = (min + max) / 2;
      const fixed = options.anchor === 'start' ? min : options.anchor === 'end' ? max : center;
      const interval = options.operation === 'interval' ? options.interval * spacingUnit(options, project) : band.length > 1 ? (max - min) / (band.length - 1) : 0;
      const extent = interval * (band.length - 1);
      const start = options.operation !== 'interval' ? min : options.anchor === 'start' ? min : options.anchor === 'end' ? max - extent : center - extent / 2;
      for (const [i, p] of band.entries()) {
        const coordinate = options.operation === 'align' ? fixed : start + i * interval;
        // Move only along the chosen axis; preserve the perpendicular coordinate exactly.
        const delta = coordinate - p.a; const before = positions[p.id];
        let point = { x: before.x + axis.x * delta, y: before.y + axis.y * delta };
        if (point.x < -1e-8 || point.y < -1e-8 || point.x > field.width + 1e-8 || point.y > field.height + 1e-8) outside = true;
        else point = { x: Math.max(0, Math.min(field.width, point.x)), y: Math.max(0, Math.min(field.height, point.y)) };
        if (Math.abs(point.x - before.x) > 1e-9 || Math.abs(point.y - before.y) > 1e-9) changed = true;
        updates[p.id] = point;
      }
      if (options.operation === 'align') groups.push({ ids: band.map(p => p.id), start: at(fixed, Math.min(...band.map(p => p.b)) - 1), end: at(fixed, Math.max(...band.map(p => p.b)) + 1), interval: 0 });
      else groups.push({ ids: band.map(p => p.id), start: at(start, (Math.min(...band.map(p => p.b)) + Math.max(...band.map(p => p.b))) / 2), end: at(start + extent, (Math.min(...band.map(p => p.b)) + Math.max(...band.map(p => p.b))) / 2), interval });
    }
    return { positions: { ...positions, ...updates }, updates, groups, changed, error: outside ? 'The preview crosses a field boundary. Reduce the interval or change the axis or anchor. No positions will be clamped to fit.' : null };
  } catch (error) { return { positions, updates: {}, groups: [], changed: false, error: (error as Error).message }; }
}

/** The last endpoint edits interval around the same fixed anchor used by numeric entry. */
export function spacingHandleValue(options: SpacingOptions, group: SpacingGroup, start: Point, current: Point, project: Pick<Project, 'snapping'>): SpacingOptions {
  const gaps = group.ids.length - 1;
  if (options.operation !== 'interval' || gaps < 1) return options;
  const delta = dot({ x: current.x - start.x, y: current.y - start.y }, spacingAxis(options.angle));
  // End anchor uses the first endpoint; center anchor expands both ends equally.
  const factor = options.anchor === 'center' ? 2 : options.anchor === 'end' ? -1 : 1;
  return { ...options, interval: Math.round(Math.max(.001, Math.min(1000, options.interval + factor * delta / gaps / spacingUnit(options, project))) * 1e6) / 1e6 };
}
