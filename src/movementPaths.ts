import type { Move, PathSegment, PerformerPath, Point } from './types';

export const hasCurvedPaths = (move: Move): boolean => Object.values(move.paths).some(path => path.segments.some(s => s.kind === 'cubic'));
export const isScheduledPath = (path: PerformerPath | undefined, counts: number): boolean => !!path && (path.segments.length !== 1 || path.segments.some(s => s.kind === 'hold' || s.startCount !== 0 || s.endCount !== counts || s.to !== undefined));
export const hasScheduledPaths = (move: Move): boolean => Object.values(move.paths).some(path => isScheduledPath(path, move.counts));
export const hasDetailedPaths = (move: Move): boolean => hasCurvedPaths(move) || hasScheduledPaths(move);
const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function travel(from: Point, to: Point, segment: PathSegment | undefined, progress: number, transition: Move['transition'], exact = false): Point {
  const u = transition === 'ease' ? progress * progress * (3 - 2 * progress) : progress;
  // Retain legacy line arithmetic, including its floating-point arrival result.
  if ((!segment || segment.kind === 'line') && !exact) return mix(from, to, u);
  if (progress === 0) return { ...from };
  if (progress === 1) return { ...to };
  if (!segment || segment.kind !== 'cubic') return mix(from, to, u);
  const a = mix(from, segment.control1, u), b = mix(segment.control1, segment.control2, u), c = mix(segment.control2, to, u);
  return mix(mix(a, b, u), mix(b, c, u), u);
}

/** Gaps hold the preceding position; the last travel arrives at the destination
 * picture. Easing applies within each travel, never across its hold time.
 * The owning move duration includes trailing hold time. */
export function sampleMovement(from: Point, to: Point, path: PerformerPath | undefined, localCount: number, counts: number, transition: Move['transition'] = 'linear'): Point {
  const count = Math.max(0, Math.min(counts, Number.isFinite(localCount) ? localCount : 0));
  const t = count / counts;
  if (!isScheduledPath(path, counts)) return travel(from, to, path?.segments[0], t, transition);
  let position = from;
  for (const segment of path!.segments) {
    if (count < segment.startCount) return { ...position };
    if (segment.kind === 'hold') {
      if (count <= segment.endCount) return { ...position };
    } else {
      const arrival = segment.to ?? to;
      if (count <= segment.endCount) return travel(position, arrival, segment, (count - segment.startCount) / (segment.endCount - segment.startCount), transition, true);
      position = arrival;
    }
  }
  return { ...position };
}

/** Resolve the same endpoint chain for geometry/output consumers. */
export function movementTravels(from: Point, to: Point, path?: PerformerPath) {
  let position = from;
  return (path?.segments ?? [{ id: 'implicit', kind: 'line' as const, startCount: 0, endCount: 1 }]).flatMap(segment => {
    if (segment.kind === 'hold') return [];
    const arrival = segment.to ?? to, result = { segment, from: position, to: arrival };
    position = arrival;
    return [result];
  });
}

/** Exact vector geometry, with holds/gaps contributing no distance. */
export function movementSvg(from: Point, to: Point, path?: PerformerPath): string {
  return `M ${from.x} ${from.y}` + movementTravels(from, to, path).map(({ segment: s, to: end }) => s.kind === 'cubic'
    ? ` C ${s.control1.x} ${s.control1.y} ${s.control2.x} ${s.control2.y} ${end.x} ${end.y}` : ` L ${end.x} ${end.y}`).join('');
}

/** Travel segments share a total 0.001 yd chord/control-polygon bound-gap
 * budget; the midpoint estimate errs <= 0.0005 yd when subdivision converges. */
export function movementLength(from: Point, to: Point, path?: PerformerPath): number {
  const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
  function length(a: Point, b: Point, c: Point, d: Point, tolerance: number, depth: number): number {
    const lower = distance(a, d), upper = distance(a, b) + distance(b, c) + distance(c, d);
    if (upper - lower <= tolerance || depth === 20) return (lower + upper) / 2;
    const ab = mix(a, b, .5), bc = mix(b, c, .5), cd = mix(c, d, .5), abc = mix(ab, bc, .5), bcd = mix(bc, cd, .5), middle = mix(abc, bcd, .5);
    return length(a, ab, abc, middle, tolerance / 2, depth + 1) + length(middle, bcd, cd, d, tolerance / 2, depth + 1);
  }
  const travels = movementTravels(from, to, path);
  return travels.reduce((sum, { segment: s, from: start, to: end }) => sum + (s.kind === 'cubic'
    ? length(start, s.control1, s.control2, end, .001 / travels.length, 0) : distance(start, end)), 0);
}

export function movementSchedule(path: PerformerPath, counts: number): string {
  let at = 0;
  const parts: string[] = [];
  for (const segment of path.segments) {
    if (segment.startCount > at) parts.push(`Hold ${at}–${segment.startCount}`);
    parts.push(`${segment.kind === 'hold' ? 'Hold' : segment.kind === 'cubic' ? 'Curve' : 'Travel'} ${segment.startCount}–${segment.endCount}`);
    at = segment.endCount;
  }
  if (at < counts) parts.push(`Hold ${at}–${counts}`);
  return parts.join('; ');
}
