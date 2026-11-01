import { spacingRuleText, strideRuleText } from './rules';
import type { AnalysisInput, Track } from './input';
import type { Point, TransitionIssue } from '../types';

export const PATH_DISTANCE_TOLERANCE = .001;
export const PATH_STRIDE_TOLERANCE = .001;
export const PATH_COUNT_TOLERANCE = 1 / 1024;
const MAX_REFINEMENTS = 2048, MAX_DEPTH = 32;
export interface Curve { start: number; end: number; points: Point[]; velocity?: Point[] }
export interface SweptBounds { minX: number; maxX: number; minY: number; maxY: number }
export interface CompiledTrack { parts: Curve[]; bounds: SweptBounds }
const length = (p: Point) => Math.hypot(p.x, p.y);
const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x * (1 - t) + b.x * t, y: a.y * (1 - t) + b.y * t });
const choose = (n: number, k: number) => { let v = 1; for (let i = 1; i <= k; i++) v = v * (n - i + 1) / i; return v; };

/** Bernstein product weights are positive. Composing a cubic with smoothstep
 * gives an exact degree-nine time curve, without a count-sampling grid. */
function polynomialMix(a: Point[], b: Point[], u: number[]): Point[] {
  const m = a.length - 1, n = u.length - 1;
  const result = Array.from({ length: m + n + 1 }, () => ({ x: 0, y: 0 }));
  for (let i = 0; i <= m; i++) for (let j = 0; j <= n; j++) {
    const w = choose(m, i) * choose(n, j) / choose(m + n, i + j), p = mix(a[i], b[i], u[j]);
    result[i + j].x += p.x * w; result[i + j].y += p.y * w;
  }
  return result;
}
function timeCurve(points: Point[], ease: boolean): { points: Point[]; local: Point[] } {
  // Derive velocity before adding the field origin back. Subtracting nearly
  // equal absolute polynomial controls can invent speed in a tiny time window.
  const origin = points[0];
  let rows = points.map(p => [{ x: p.x - origin.x, y: p.y - origin.y }]);
  const u = ease ? [0, 0, 1, 1] : [0, 1];
  while (rows.length > 1) rows = rows.slice(1).map((row, i) => polynomialMix(rows[i], row, u));
  return { points: rows[0].map(p => ({ x: origin.x + p.x, y: origin.y + p.y })), local: rows[0] };
}
export function splitCurve(points: Point[], t: number): [Point[], Point[]] {
  const left = [points[0]], right = [points.at(-1)!];
  let row = points;
  while (row.length > 1) { row = row.slice(1).map((p, i) => mix(row[i], p, t)); left.push(row[0]); right.unshift(row.at(-1)!); }
  return [left, right];
}
export function curvePoint(points: Point[], t: number): Point { return splitCurve(points, t)[0].at(-1)!; }
function crop(curve: Curve, start: number, end: number): Point[] {
  const a = (start - curve.start) / (curve.end - curve.start), b = (end - curve.start) / (curve.end - curve.start);
  let points = b === 1 ? curve.points : splitCurve(curve.points, b)[0];
  if (a > 0) points = splitCurve(points, a / b)[1];
  return points;
}
function elevate(points: Point[], degree: number): Point[] {
  while (points.length <= degree) {
    const n = points.length;
    points = [points[0], ...points.slice(1).map((p, i) => mix(p, points[i], (i + 1) / n)), points.at(-1)!];
  }
  return points;
}
export function derivative(points: Point[], duration: number): Point[] {
  const n = points.length - 1;
  return n ? points.slice(1).map((p, i) => ({ x: (p.x - points[i].x) / duration * n, y: (p.y - points[i].y) / duration * n })) : [{ x: 0, y: 0 }];
}
function box(points: Point[]): SweptBounds {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  return { minX, maxX, minY, maxY };
}
export function compileTrack(track: Track, counts: number, transition: AnalysisInput['transition']): CompiledTrack {
  const parts: Curve[] = []; let at = 0, position = track.from;
  const add = (start: number, end: number, points: Point[], velocity?: Point[]) => { if (end > start) parts.push({ start, end, points, velocity }); };
  for (const s of track.path?.segments ?? [{ id: 'implicit', kind: 'line' as const, startCount: 0, endCount: counts }]) {
    add(at, s.startCount, [position]);
    if (s.kind === 'hold') add(s.startCount, s.endCount, [position]);
    else {
      const end = s.to ?? track.to;
      const curve = timeCurve(s.kind === 'cubic' ? [position, s.control1, s.control2, end] : [position, end], transition === 'ease');
      add(s.startCount, s.endCount, curve.points, derivative(curve.local, s.endCount - s.startCount));
      position = end;
    }
    at = s.endCount;
  }
  add(at, counts, [position]);
  for (const part of parts) part.points = part.points.map(p => ({ ...p }));
  const bounds = box(parts.flatMap(p => p.points));
  // Guard the broad phase against polynomial/crop arithmetic rounding too.
  const pad = 1e-8 * Math.max(1, ...Object.values(bounds).map(Math.abs));
  return { parts, bounds: { minX: bounds.minX - pad, maxX: bounds.maxX + pad, minY: bounds.minY - pad, maxY: bounds.maxY + pad } };
}
function* relativeCurves(a: CompiledTrack, b: CompiledTrack): Generator<Curve> {
  let i = 0, j = 0;
  while (i < a.parts.length && j < b.parts.length) {
    const x = a.parts[i], y = b.parts[j], start = Math.max(x.start, y.start), end = Math.min(x.end, y.end);
    if (end > start) {
      const degree = Math.max(x.points.length, y.points.length) - 1;
      const ap = elevate(crop(x, start, end), degree), bp = elevate(crop(y, start, end), degree);
      yield { start, end, points: ap.map((p, k) => ({ x: p.x - bp[k].x, y: p.y - bp[k].y })) };
    }
    if (x.end <= y.end) i++; if (y.end <= x.end) j++;
  }
}
interface Node extends Curve { lower: number; upper: number; sample: number; at: number; depth: number }
function node(curve: Curve, maximum: boolean, depth = 0): Node {
  const constant = curve.points.every(p => p.x === curve.points[0].x && p.y === curve.points[0].y);
  const values = (constant ? [0] : [0, .5, 1]).map(t => {
    const at = t === 0 ? curve.start : t === 1 ? curve.end : curve.start + (curve.end - curve.start) * t;
    const represented = (at - curve.start) / (curve.end - curve.start);
    return { sample: constant ? length(curve.points[0]) : length(curvePoint(curve.points, represented)), at };
  });
  const best = values.reduce((a, b) => maximum ? b.sample > a.sample ? b : a : b.sample < a.sample ? b : a);
  const hull = box(curve.points), norm = Math.max(...curve.points.map(length)), pad = 1e-8 * Math.max(1, norm);
  if (![norm, best.sample, norm + pad, best.sample + pad].every(Number.isFinite)) throw Error('Movement timing is too small to bound numerically. This move has not been checked.');
  const dx = Math.max(0, hull.minX, -hull.maxX), dy = Math.max(0, hull.minY, -hull.maxY);
  return { ...curve, ...best, depth, lower: maximum ? Math.max(0, best.sample - pad) : Math.max(0, Math.hypot(dx, dy) - pad), upper: maximum ? norm + pad : best.sample + pad };
}
class Heap {
  values: Node[] = [];
  constructor(private maximum: boolean) {}
  private before(a: Node, b: Node) { return this.maximum ? a.upper > b.upper : a.lower < b.lower; }
  push(n: Node) { const a = this.values; a.push(n); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!this.before(a[i], a[p])) break; [a[i], a[p]] = [a[p], a[i]]; i = p; } }
  remove(i: number) {
    const a = this.values, removed = a[i], end = a.pop()!;
    if (i < a.length) {
      a[i] = end;
      while (i > 0) { const p = (i - 1) >> 1; if (!this.before(a[i], a[p])) break; [a[i], a[p]] = [a[p], a[i]]; i = p; }
      while (true) { let k = i; for (const j of [i * 2 + 1, i * 2 + 2]) if (j < a.length && this.before(a[j], a[k])) k = j; if (k === i) break; [a[i], a[k]] = [a[k], a[i]]; i = k; }
    }
    return removed;
  }
  pop() { return this.remove(0); }
}
interface Extremum { lower: number; upper: number; witness: Node; leaves: Node[]; converged: boolean; refinements: number }
function* extremum(curves: Iterable<Curve>, maximum: boolean, threshold: number): Generator<void, Extremum> {
  const heap = new Heap(maximum); let witness: Node | undefined;
  const add = (n: Node) => { heap.push(n); if (!witness || (maximum ? n.lower > witness.lower : n.upper < witness.upper)) witness = n; };
  for (const c of curves) {
    add(node(c, maximum)); yield;
    // Distance is globally nonnegative, so a near-zero sampled witness already
    // brackets the minimum, including all time pieces not yet visited.
    if (!maximum && witness!.upper <= PATH_DISTANCE_TOLERANCE) return { lower: 0, upper: witness!.upper, witness: witness!, leaves: heap.values, converged: true, refinements: 0 };
  }
  let refinements = 0;
  const gap = () => maximum ? heap.values[0].upper - witness!.lower : witness!.upper - heap.values[0].lower;
  const tolerance = maximum ? PATH_STRIDE_TOLERANCE : PATH_DISTANCE_TOLERANCE;
  while (gap() > tolerance && refinements < MAX_REFINEMENTS) {
    const top = heap.values[0], mid = top.start + (top.end - top.start) / 2;
    if (top.depth >= MAX_DEPTH || mid === top.start || mid === top.end) break;
    heap.pop(); const [left, right] = splitCurve(top.points, (mid - top.start) / (top.end - top.start));
    add(node({ start: top.start, end: mid, points: left }, maximum, top.depth + 1));
    add(node({ start: mid, end: top.end, points: right }, maximum, top.depth + 1));
    refinements++; yield;
  }
  // A tight spatial bound can still straddle the rule at a tangency. Localize
  // its candidate time window too; a constant quantity remains uncertain over
  // its entire interval rather than expanding into thousands of identical leaves.
  while (refinements < MAX_REFINEMENTS && (maximum ? witness!.lower <= threshold && heap.values[0].upper > threshold : witness!.upper >= threshold && heap.values[0].lower < threshold)) {
    let index = -1, width = PATH_COUNT_TOLERANCE;
    heap.values.forEach((n, i) => {
      if ((maximum ? n.upper > threshold : n.lower < threshold) && n.end - n.start > width && n.depth < MAX_DEPTH && !n.points.every(p => p.x === n.points[0].x && p.y === n.points[0].y)) { index = i; width = n.end - n.start; }
    });
    if (index < 0) break;
    const top = heap.values[index], mid = top.start + (top.end - top.start) / 2;
    if (mid === top.start || mid === top.end) break;
    heap.remove(index); const [left, right] = splitCurve(top.points, (mid - top.start) / (top.end - top.start));
    add(node({ start: top.start, end: mid, points: left }, maximum, top.depth + 1));
    add(node({ start: mid, end: top.end, points: right }, maximum, top.depth + 1));
    refinements++; yield;
  }
  return { lower: maximum ? witness!.lower : Math.min(heap.values[0].lower, witness!.upper), upper: maximum ? Math.max(heap.values[0].upper, witness!.lower) : witness!.upper,
    witness: witness!, leaves: heap.values, converged: gap() <= tolerance, refinements };
}
function reviewRange(result: Extremum, threshold: number, maximum: boolean): [number, number] {
  const w = result.witness, margin = maximum ? w.lower - threshold : threshold - w.upper;
  if (margin > 0) {
    const rate = Math.max(...derivative(w.points, w.end - w.start).map(length));
    const radius = rate > 0 ? margin / (2 * rate) : w.end - w.start;
    return [Math.max(w.start, w.at - radius), Math.min(w.end, w.at + radius)];
  }
  const possible = result.leaves.filter(n => maximum ? n.upper > threshold : n.lower < threshold);
  return [Math.min(...possible.map(n => n.start)), Math.max(...possible.map(n => n.end))];
}
function adjacent(value: number, up: boolean): number {
  if (value === 0) return up ? Number.MIN_VALUE : -Number.MIN_VALUE;
  const view = new DataView(new ArrayBuffer(8)); view.setFloat64(0, value);
  view.setBigUint64(0, view.getBigUint64(0) + ((value > 0) === up ? 1n : -1n));
  return view.getFloat64(0);
}
function findingTiming(input: AnalysisInput, result: Extremum, threshold: number, maximum: boolean) {
  const certainty = (maximum ? result.lower > threshold : result.upper < threshold) ? 'confirmed' as const : 'possible' as const;
  const range = reviewRange(result, threshold, maximum);
  const candidate = certainty === 'confirmed' ? result.witness : result.leaves.filter(n => maximum ? n.upper > threshold : n.lower < threshold)
    .reduce((a, b) => maximum ? b.upper > a.upper ? b : a : b.lower < a.lower ? b : a);
  let atCount = input.startCount + candidate.at;
  if (certainty === 'confirmed') {
    const fits = (n: number) => n - input.startCount >= range[0] && n - input.startCount <= range[1];
    if (!fits(atCount)) {
      const represented = [adjacent(atCount, false), adjacent(atCount, true)].find(fits);
      if (represented === undefined) throw Error('Movement timing is too small to represent the flagged show count. This move has not been checked.');
      atCount = represented;
    }
  }
  let a = input.startCount + range[0], b = input.startCount + range[1];
  if (certainty === 'confirmed') {
    if (a - input.startCount < range[0]) a = adjacent(a, true);
    if (b - input.startCount > range[1]) b = adjacent(b, false);
  } else {
    if (a - input.startCount > range[0]) a = adjacent(a, false);
    if (b - input.startCount < range[1]) b = adjacent(b, true);
  }
  return { certainty, countRange: [a, b] as [number, number], atCount };
}
/** Display rounding widens a bound; it must never exclude the true quantity. */
function displayBound(value: number, upper: boolean): string {
  const round = upper ? Math.ceil : Math.floor;
  if (value < 1e12) return (round(value * 1000) / 1000).toFixed(3);
  const scale = 10 ** (Math.floor(Math.log10(value)) - 5);
  return (round(value / scale) * scale).toExponential(5);
}
export function* detailedStride(input: AnalysisInput, track: Track, compiled: CompiledTrack): Generator<void, TransitionIssue | undefined> {
  const result = yield* extremum(compiled.parts.map(c => ({ ...c, points: c.velocity ?? derivative(c.points, c.end - c.start) })), true, track.maximumStride);
  if (result.upper <= track.maximumStride) return;
  const { certainty, countRange: range, atCount } = findingTiming(input, result, track.maximumStride, true);
  return { type: 'stride', performerIds: [track.id], severity: result.lower > track.maximumStride * 4 / 3 ? 'danger' : 'warning', atCount,
    certainty, countRange: range, measurement: { lower: result.lower, upper: result.upper, tolerance: PATH_STRIDE_TOLERANCE, unit: 'yd/count', converged: result.converged },
    message: `${track.label}: ${certainty === 'possible' ? 'possible ' : ''}peak stride bounded ${displayBound(result.lower, false)}–${displayBound(result.upper, true)} yd/count.${strideRuleText(track)}` };
}
export function* detailedCollision(input: AnalysisInput, a: Track, b: Track, ac: CompiledTrack, bc: CompiledTrack): Generator<void, TransitionIssue | undefined> {
  const threshold = Math.max(a.minimumSpacing, b.minimumSpacing), result = yield* extremum(relativeCurves(ac, bc), false, threshold);
  if (result.lower >= threshold) return;
  const { certainty, countRange: range, atCount } = findingTiming(input, result, threshold, false);
  return { type: 'collision', performerIds: [a.id, b.id], severity: result.upper < threshold / 2 ? 'danger' : 'warning', atCount,
    certainty, countRange: range, measurement: { lower: result.lower, upper: result.upper, tolerance: PATH_DISTANCE_TOLERANCE, unit: 'yd', converged: result.converged },
    message: `${a.label} / ${b.label}: ${certainty === 'possible' ? 'possible ' : ''}minimum spacing bounded ${displayBound(result.lower, false)}–${displayBound(result.upper, true)} yd.${spacingRuleText(a, b)}` };
}
