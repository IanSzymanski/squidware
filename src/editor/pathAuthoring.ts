import { uid } from '../domain';
import { movementTravels, sampleMovement } from '../movementPaths';
import { PROJECT_LIMITS } from '../projectValidation';
import type { Move, PerformerPath, Point } from '../types';
import { pathFromRows, type ScheduleRow } from './movementScheduleEditing';

export const DRAW_LIMIT = 2048;
export const DRAW_TOLERANCE = .15;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export interface TravelHandle { id: string; rowId: string; kind: 'arrival' | 'control1' | 'control2'; point: Point; label: string }

export function travelHandles(from: Point, to: Point, path?: PerformerPath): TravelHandle[] {
  const travels = movementTravels(from, to, path);
  return travels.flatMap(({ segment, to: end }, i): TravelHandle[] => [
    ...(segment.kind === 'cubic' ? [1, 2].map(n => ({ id: `${segment.id}-control${n}`, rowId: segment.id, kind: `control${n}` as 'control1' | 'control2', point: n === 1 ? segment.control1 : segment.control2, label: `Travel ${i + 1} control ${n}` })) : []),
    ...(i < travels.length - 1 ? [{ id: `${segment.id}-arrival`, rowId: segment.id, kind: 'arrival' as const, point: end, label: `Travel ${i + 1} arrival` }] : []),
  ]);
}
export function moveTravelHandle(rows: ScheduleRow[], handle: TravelHandle, point: Point): ScheduleRow[] {
  const keys = handle.kind === 'arrival' ? ['x', 'y'] : handle.kind === 'control1' ? ['c1x', 'c1y'] : ['c2x', 'c2y'];
  return rows.map(row => row.id === handle.rowId ? { ...row, [keys[0]]: String(point.x), [keys[1]]: String(point.y) } : row);
}

/** At most 97 ticks, sampled from the playback evaluator, including fractional
 * arrivals/departures and holds. Duplicate held positions remain explicit counts. */
export function travelTicks(from: Point, to: Point, path: PerformerPath | undefined, counts: number, transition: Move['transition']) {
  const times = new Set<number>([0, counts]);
  const step = Math.max(1, Math.ceil(counts / 32));
  for (let count = step; count < counts; count += step) times.add(count);
  for (const s of path?.segments ?? []) { times.add(s.startCount); times.add(s.endCount); }
  const sorted = [...times].sort((a, b) => a - b);
  // A maximum 32-interval path may have 64 fractional boundaries; retain those
  // before adding optional regular ticks so work stays bounded at 97 samples.
  return sorted.map(count => ({ count, point: sampleMovement(from, to, path, count, counts, transition) }));
}

function chordDistance(point: Point, a: Point, b: Point): number {
  const length2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = length2 ? Math.max(0, Math.min(1, ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / length2)) : 0;
  return distance(point, mix(a, b, t));
}

/** Deterministic, bounded RDP. No zoom-dependent sampling or tolerance changes.
 * Straight chords retain intentional corners and self-crossings. A cubic fit
 * uses collinear 1/3 and 2/3 handles, so its locus is exactly the reviewed chord;
 * handles can then be refined independently. No unverified smoothing is applied. */
export function simplifyStroke(input: readonly Point[], tolerance = DRAW_TOLERANCE): Point[] {
  if (!Number.isFinite(tolerance) || tolerance < .01 || tolerance > 1) throw new Error('Use a fitting tolerance from 0.01 to 1 yard.');
  if (input.length > DRAW_LIMIT) throw new Error(`Use at most ${DRAW_LIMIT} captured points; draw a shorter stroke.`);
  if (input.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error('Draw finite field coordinates.');
  const points = input.filter((p, i) => !i || distance(p, input[i - 1]) > 1e-9).map(p => ({ ...p }));
  if (points.length < 2 || points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p), 0) < .01) throw new Error('Draw at least 0.01 yard of travel.');
  const keep = new Set([0, points.length - 1]), pending = [[0, points.length - 1]];
  while (pending.length) {
    const [start, end] = pending.pop()!;
    let furthest = -1, deviation = tolerance;
    for (let i = start + 1; i < end; i++) {
      const d = chordDistance(points[i], points[start], points[end]);
      if (d > deviation) { deviation = d; furthest = i; }
    }
    if (furthest >= 0) {
      keep.add(furthest);
      if (keep.size > PROJECT_LIMITS.pathSegments + 1) throw new Error('The stroke needs more than 32 segments. Increase tolerance or draw a simpler stroke.');
      pending.push([start, furthest], [furthest, end]);
    }
  }
  return [...keep].sort((a, b) => a - b).map(i => points[i]);
}

/** Replace one travel only, keeping its fixed endpoints, outer counts, every
 * hold and every unrelated interval. Interior time is allocated by chord length.
 * Easing is still the move's per-segment easing, visible in the tick preview. */
export function drawTravel(rows: ScheduleRow[], rowId: string, from: Point, to: Point, input: readonly Point[], tolerance: number, curved: boolean): ScheduleRow[] {
  const index = rows.findIndex(r => r.id === rowId), row = rows[index];
  if (!row || row.kind === 'hold') throw new Error('Select a travel interval before drawing. Holds have no travel geometry.');
  if (input.length < 2 || distance(input[0], from) > tolerance || distance(input.at(-1)!, to) > tolerance) throw new Error(`Start and end within ${tolerance} yard of the fixed interval endpoints, or reverse the captured stroke.`);
  // Endpoint attachment consumes part of the error budget; reject if it exceeds it.
  const attachment = Math.max(distance(input[0], from), distance(input.at(-1)!, to));
  const fitted = simplifyStroke(input, Math.max(.01, tolerance - attachment));
  fitted[0] = { ...from }; fitted[fitted.length - 1] = { ...to };
  if (attachment > tolerance - .01) throw new Error('Draw closer to the fixed endpoints to leave room for fitting.');
  if (rows.length - 1 + fitted.length - 1 > PROJECT_LIMITS.pathSegments) throw new Error('The fitted path and existing holds exceed 32 intervals. Simplify the stroke or increase tolerance.');
  const lengths = fitted.slice(1).map((p, i) => distance(fitted[i], p)), total = lengths.reduce((a, b) => a + b, 0);
  const start = Number(row.start), end = Number(row.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || total < .01) throw new Error('Choose a positive travel duration and a nonzero route.');
  let accumulated = 0;
  const replacement = lengths.map((length, i): ScheduleRow => {
    const a = fitted[i], b = fitted[i + 1], c1 = mix(a, b, 1 / 3), c2 = mix(a, b, 2 / 3), previous = accumulated;
    accumulated += length;
    const departure = i === 0 ? start : start + (end - start) * previous / total;
    const arrival = i === lengths.length - 1 ? end : start + (end - start) * accumulated / total;
    if (!(arrival > departure)) throw new Error('The fitted interval is too short for representable count timing. Simplify the stroke.');
    return { ...row, id: i === 0 ? row.id : uid(), kind: curved ? 'cubic' : 'line', start: String(departure), end: String(arrival), x: String(b.x), y: String(b.y), c1x: String(c1.x), c1y: String(c1.y), c2x: String(c2.x), c2y: String(c2.y) };
  });
  return [...rows.slice(0, index), ...replacement, ...rows.slice(index + 1)];
}

export function selectedTravel(rows: ScheduleRow[], rowId: string, from: Point, to: Point) {
  return movementTravels(from, to, pathFromRows(rows) ?? undefined).find(t => t.segment.id === rowId);
}

