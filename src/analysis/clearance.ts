import { curvePoint, compileTrack, relativeCurves, splitCurve, type CompiledTrack, type Curve } from './detailed';
import { facingAt, performerTurn } from '../performerFacing';
import { sampleMovement } from '../movementPaths';
import { interpolateStagingPose, stagingProgress, stagingTurn, type StagingObject, type StagingPose } from '../staging';
import type { PerformerFacings, Point, TransitionIssue } from '../types';
import type { AnalysisInput } from './input';
import type { ClearanceRules } from './clearanceRules';

export interface ClearanceInput {
  rules: ClearanceRules;
  fromFacings?: PerformerFacings;
  toFacings?: PerformerFacings;
  props: (StagingObject & { from: StagingPose; to: StagingPose })[];
}

export interface Footprint { shape: 'circle' | 'rectangle'; width: number; depth: number; angle: number }
interface Body {
  id: string; label: string; prop: boolean;
  from: Point; to: Point; fromVisible: boolean; toVisible: boolean;
  fromShape: Footprint; toShape: Footprint; radius: number;
  interior: (count: number) => Footprint;
  pointAt: (count: number) => Point;
  motion?: CompiledTrack;
}

const RAD = Math.PI / 180;
const EPS = 1e-6;
const DISTANCE_RESOLUTION = .002;
const COUNT_RESOLUTION = 1 / 1024;
const PAIR_BUDGET = 128;
const MOVE_BUDGET = 100_000;
export const footprintDiameter = (shape: Pick<Footprint, 'width' | 'depth'>) => Math.max(shape.width, shape.depth);
const radius = (shape: Footprint) => shape.shape === 'circle' ? footprintDiameter(shape) / 2 : Math.hypot(shape.width, shape.depth) / 2;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const difference = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });

function axes(angle: number) {
  const sin = Math.sin(angle * RAD), cos = Math.cos(angle * RAD);
  return [{ x: cos, y: -sin }, { x: sin, y: cos }] as const;
}
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;

function rectangleDistance(point: Point, shape: Footprint, basis: ReturnType<typeof axes>) {
  const x = Math.abs(dot(point, basis[0])) - shape.width / 2;
  const y = Math.abs(dot(point, basis[1])) - shape.depth / 2;
  return Math.hypot(Math.max(x, 0), Math.max(y, 0)) + Math.min(Math.max(x, y), 0);
}

/** Signed edge distance. Inside the Minkowski difference, separating axes give penetration depth. */
export function footprintGap(a: Footprint, b: Footprint, centerAFromB: Point): number {
  if (a.shape === 'circle') return b.shape === 'circle' ? Math.hypot(centerAFromB.x, centerAFromB.y) - radius(a) - radius(b)
    : rectangleDistance(centerAFromB, b, axes(b.angle)) - radius(a);
  if (b.shape === 'circle') return rectangleDistance(centerAFromB, a, axes(a.angle)) - radius(b);
  const ax = axes(a.angle), bx = axes(b.angle);
  const extent = (s: Footprint, basis: typeof ax, axis: Point) => (Math.abs(dot(basis[0], axis)) * s.width + Math.abs(dot(basis[1], axis)) * s.depth) / 2;
  let separation = -Infinity;
  for (const axis of [...ax, ...bx]) separation = Math.max(separation, Math.abs(dot(centerAFromB, axis)) - extent(a, ax, axis) - extent(b, bx, axis));
  if (separation <= 0) return separation;
  // The nearest pair on disjoint polygons includes a vertex of at least one polygon.
  let gap = Infinity;
  for (const signX of [-.5, .5]) for (const signY of [-.5, .5]) {
    const vertexA = { x: centerAFromB.x + ax[0].x * a.width * signX + ax[1].x * a.depth * signY,
      y: centerAFromB.y + ax[0].y * a.width * signX + ax[1].y * a.depth * signY };
    const vertexB = { x: -centerAFromB.x + bx[0].x * b.width * signX + bx[1].x * b.depth * signY,
      y: -centerAFromB.y + bx[0].y * b.width * signX + bx[1].y * b.depth * signY };
    gap = Math.min(gap, rectangleDistance(vertexA, b, bx), rectangleDistance(vertexB, a, ax));
  }
  return gap;
}

export function propShape(pose: Pick<StagingPose, 'width' | 'depth' | 'angle'>, footprint?: StagingObject['footprint']): Footprint {
  return { shape: footprint ?? 'rectangle', width: pose.width, depth: pose.depth, angle: footprint ? 0 : pose.angle };
}
export function performerShape(rule: ClearanceRules['performer'], angle = 0): Footprint {
  return rule.shape === 'circle' ? { shape: 'circle', width: rule.diameter, depth: rule.diameter, angle: 0 } : { ...rule, angle };
}

function bodies(input: AnalysisInput, clearance: ClearanceInput, compiled?: CompiledTrack[]) {
  const people = input.tracks.map((track, index): Body => {
    const from = facingAt(clearance.fromFacings, track.id), to = facingAt(clearance.toFacings, track.id);
    const fromShape = performerShape(clearance.rules.performer, from), toShape = performerShape(clearance.rules.performer, to);
    const interior = from === undefined || to === undefined ? performerShape(clearance.rules.performer) : fromShape;
    const turn = interior.shape === 'rectangle' && from !== undefined && to !== undefined ? performerTurn(from, to) : 0;
    return { id: track.id, label: track.label, prop: false, from: track.from, to: track.to, fromVisible: true, toVisible: true,
      fromShape, toShape, radius: radius(fromShape), interior: count => turn ? { ...interior, angle: interior.angle + turn * count / input.counts } : interior,
      pointAt: count => sampleMovement(track.from, track.to, track.path, count, input.counts, input.transition),
      motion: input.counts ? compiled?.[index] ?? compileTrack(track, input.counts, input.transition) : undefined };
  });
  const props = clearance.props.filter(prop => prop.from.visible || prop.to.visible).map((prop): Body => {
    const { from, to } = prop, fromShape = propShape(from, prop.footprint), toShape = propShape(to, prop.footprint);
    const turn = prop.footprint ? 0 : stagingTurn(from.angle, to.angle);
    const start = (to.travel?.start ?? 0) * input.counts, end = (to.travel?.end ?? 1) * input.counts;
    // Extremely close fractional events can collapse to one count in binary64.
    // Keep the endpoint checks and conservatively flag a nearby swept candidate in that case.
    const motion = input.counts && end - start >= input.counts * 1e-6 ? compileTrack({ from, to, path: { linearCounts: true,
      segments: [{ id: 'staging-travel', kind: 'line', startCount: start, endCount: end }] } }, input.counts, 'linear') : undefined;
    return { id: prop.id, label: prop.name, prop: true, from, to, fromVisible: from.visible, toVisible: to.visible,
      fromShape, toShape, radius: Math.max(radius(fromShape), radius(toShape)), motion,
      pointAt: count => interpolateStagingPose(from, to, count / input.counts), interior: count => {
        const t = stagingProgress(to, count / input.counts);
        return { shape: fromShape.shape, width: mix(from.width, to.width, t), depth: mix(from.depth, to.depth, t), angle: fromShape.angle + turn * t };
      } };
  });
  return { people, props };
}

function nearby(a: Body, b: Body, minimum: number) {
  const bounds = (body: Body) => body.motion?.bounds ?? { minX: Math.min(body.from.x, body.to.x), maxX: Math.max(body.from.x, body.to.x),
    minY: Math.min(body.from.y, body.to.y), maxY: Math.max(body.from.y, body.to.y) };
  const x = bounds(a), y = bounds(b), limit = a.radius + b.radius + minimum + EPS;
  return Math.hypot(Math.max(0, x.minX - y.maxX, y.minX - x.maxX), Math.max(0, x.minY - y.maxY, y.minY - x.maxY)) <= limit;
}

/** Maximum support change around the midpoint. Staging dimensions and unwrapped
 * headings are monotone over a move, including the lead-in and trailing holds. */
function shapeVariation(body: Body, middle: Footprint, start: number, end: number) {
  const variation = (other: Footprint) => Math.hypot(other.width - middle.width, other.depth - middle.depth) / 2
    + body.radius * Math.abs(other.angle - middle.angle) * RAD;
  return Math.max(variation(body.interior(start)), variation(body.interior(end)));
}

interface Witness { count: number; gap: number; a: Footprint; b: Footprint }
interface Candidate { witness: Witness; start: number; end: number; lower: number }
const shown = (n: number) => Number(n.toFixed(3));
const shapeText = (p: Footprint) => p.shape === 'circle' ? `circle Ø${shown(footprintDiameter(p))} yd`
  : `${shown(p.width)} × ${shown(p.depth)} yd rectangle at ${shown((p.angle % 360 + 360) % 360)}°`;

function* checkPair(input: AnalysisInput, a: Body, b: Body, minimum: number, budget: { left: number }): Generator<void, TransitionIssue | undefined> {
  let witness: Witness | undefined, uncertain: Candidate | undefined;
  let left = PAIR_BUDGET;
  function accept(test: Witness) {
    if (test.gap < minimum - EPS && (!witness || test.gap < witness.gap)) witness = test;
  }
  function endpoint(end: boolean) {
    if (!(end ? a.toVisible && b.toVisible : a.fromVisible && b.fromVisible)) return;
    const first = end ? a.toShape : a.fromShape, second = end ? b.toShape : b.fromShape;
    accept({ count: end ? input.counts : 0, a: first, b: second,
      gap: footprintGap(first, second, difference(end ? a.to : a.from, end ? b.to : b.from)) });
  }
  endpoint(false);
  if (input.counts && !(witness && witness.gap < -EPS)) endpoint(true);

  function unresolved(curve?: Curve) {
    const start = curve?.start ?? 0, end = curve?.end ?? input.counts, count = (start + end) / 2;
    uncertain ??= { start, end, lower: -a.radius - b.radius,
      witness: { count, gap: Infinity, a: a.interior(count), b: b.interior(count) } };
  }

  if (input.counts && a.fromVisible && b.fromVisible && !(witness && witness.gap < -EPS)) {
    if (!a.motion || !b.motion || budget.left <= 0) unresolved();
    else for (const span of relativeCurves(a.motion, b.motion)) {
      const stack: Curve[] = [span];
      while (stack.length) {
        yield;
        const curve = stack.pop()!;
        if (budget.left-- <= 0 || left-- <= 0) { unresolved(); break; }
        const count = (input.startCount + (curve.start + curve.end) / 2) - input.startCount;
        if (count <= curve.start || count >= curve.end) { unresolved(curve); continue; }
        const delta = curvePoint(curve.points, (count - curve.start) / (curve.end - curve.start));
        const aShape = a.interior(count), bShape = b.interior(count);
        const gap = footprintGap(aShape, bShape, delta);
        const sample = (): Witness => ({ count, a: aShape, b: bShape,
          gap: footprintGap(aShape, bShape, difference(a.pointAt(count), b.pointAt(count))) });
        if (gap < minimum + EPS) accept(sample());
        if (witness && witness.gap < -EPS) break;
        // Relative Bernstein control points bound all center offsets. Signed
        // distance changes by at most the summed changes of the two supports.
        let motion = 0;
        for (const p of curve.points) motion = Math.max(motion, Math.hypot(p.x - delta.x, p.y - delta.y));
        motion += shapeVariation(a, aShape, curve.start, curve.end) + shapeVariation(b, bShape, curve.start, curve.end);
        const lower = gap - motion - EPS;
        if (!motion || lower >= (witness ? 0 : minimum)) continue;
        if (motion <= DISTANCE_RESOLUTION || curve.end - curve.start <= COUNT_RESOLUTION) {
          uncertain ??= { witness: sample(), start: curve.start, end: curve.end, lower }; continue;
        }
        const [first, second] = splitCurve(curve.points, (count - curve.start) / (curve.end - curve.start));
        stack.push({ start: count, end: curve.end, points: second }, { start: curve.start, end: count, points: first });
      }
      if (left < 0 || budget.left < 0 || witness && witness.gap < -EPS) break;
    }
  }
  const review = witness ?? uncertain?.witness;
  if (!review) return;
  const atCount = input.startCount + review.count;
  const overlap = !!witness && witness.gap < -EPS;
  const description = !witness ? 'Possible footprint clearance violation' : overlap
    ? `Footprints overlap by ${shown(-review.gap)} yd` : `${shown(Math.max(0, review.gap))} yd edge gap`;
  return { type: 'clearance', performerIds: a.prop ? [] : [a.id], propIds: a.prop ? [a.id, b.id] : [b.id], atCount,
    severity: overlap ? 'danger' : 'warning', certainty: witness ? 'confirmed' : 'possible',
    ...(!witness && uncertain ? { countRange: [input.startCount + uncertain.start, input.startCount + uncertain.end] as [number, number],
      ...(Number.isFinite(review.gap) ? { measurement: { lower: uncertain.lower, upper: review.gap + EPS,
        tolerance: DISTANCE_RESOLUTION, unit: 'yd' as const, converged: review.gap + EPS - uncertain.lower <= DISTANCE_RESOLUTION } } : {}) } : {}),
    message: `${a.label} (${shapeText(review.a)}) / ${b.label} (${shapeText(review.b)}). ${description} at count ${shown(atCount)}. Required edge gap ${minimum} yd.` };
}

export function* clearanceFindings(input: AnalysisInput, compiled?: CompiledTrack[]): Generator<void, TransitionIssue[]> {
  const clearance = input.clearance;
  if (!clearance?.props.length) return [];
  const { people, props } = bodies(input, clearance, compiled), minimum = clearance.rules.minimumGap;
  const issues: TransitionIssue[] = [], budget = { left: MOVE_BUDGET };
  for (const [index, prop] of props.entries()) {
    for (const other of [...people, ...props.slice(0, index)]) {
      yield;
      if (!nearby(other, prop, minimum)) continue;
      const issue = yield* checkPair(input, other, prop, minimum, budget);
      if (issue) issues.push(issue);
    }
  }
  return issues;
}
