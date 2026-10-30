import type { Move, PerformerPath, Point } from './types';

export const hasCurvedPaths = (move: Move): boolean => Object.values(move.paths).some(path => path.segments.some(s => s.kind === 'cubic'));
const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** One full-move segment. Endpoints always come from the pictures. Cubics use
 * Bézier parameter time, with the move's smoothstep applied once, globally. */
export function sampleMovement(from: Point, to: Point, path: PerformerPath | undefined, progress: number, transition: Move['transition'] = 'linear'): Point {
  const t = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const u = transition === 'ease' ? t * t * (3 - 2 * t) : t;
  const segment = path?.segments[0];
  if (!segment || segment.kind === 'line') return mix(from, to, u);
  if (t === 0) return { ...from };
  if (t === 1) return { ...to };
  // de Casteljau is stable for coincident points, loops and zero-length handles.
  const a = mix(from, segment.control1, u), b = mix(segment.control1, segment.control2, u), c = mix(segment.control2, to, u);
  return mix(mix(a, b, u), mix(b, c, u), u);
}

/** Exact vector geometry shared by field overlays and the numeric preview. */
export function movementSvg(from: Point, to: Point, path?: PerformerPath): string {
  const s = path?.segments[0];
  return `M ${from.x} ${from.y} ` + (s?.kind === 'cubic'
    ? `C ${s.control1.x} ${s.control1.y} ${s.control2.x} ${s.control2.y} ${to.x} ${to.y}` : `L ${to.x} ${to.y}`);
}

/** Chord/control-polygon bounds enclose the true length. Subdivision halves a
 * total 0.001 yd error budget. The returned midpoint has <= 0.0005 yd error. */
export function movementLength(from: Point, to: Point, path?: PerformerPath): number {
  const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
  const segment = path?.segments[0];
  if (!segment || segment.kind === 'line') return distance(from, to);
  function length(a: Point, b: Point, c: Point, d: Point, tolerance: number, depth: number): number {
    const lower = distance(a, d), upper = distance(a, b) + distance(b, c) + distance(c, d);
    if (upper - lower <= tolerance || depth === 20) return (lower + upper) / 2;
    const ab = mix(a, b, .5), bc = mix(b, c, .5), cd = mix(c, d, .5), abc = mix(ab, bc, .5), bcd = mix(bc, cd, .5), middle = mix(abc, bcd, .5);
    return length(a, ab, abc, middle, tolerance / 2, depth + 1) + length(middle, bcd, cd, d, tolerance / 2, depth + 1);
  }
  return length(from, segment.control1, segment.control2, to, .001, 0);
}
