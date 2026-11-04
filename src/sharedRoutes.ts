import { movementLength, movementSvg, sampleMovement } from './movementPaths';
import { PROJECT_LIMITS } from './projectValidation';
import type { PerformerPath, Point, Project, RouteSegment, SharedRoute } from './types';

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const mix = (a: Point, b: Point, t = .5): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const fail = (message: string): never => { throw Error(`Invalid shared route: ${message}`); };
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail('expected an object.');
const id = (value: unknown): string => typeof value === 'string' && value.length > 0 && value.length <= PROJECT_LIMITS.text.id && /^[A-Za-z0-9_-]+$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value) ? value : fail('use a valid ID.');

/** Rebuild bounded canonical geometry; no raw strokes or performer references. */
export function validateSharedRoutes(value: unknown, field: Project['field']): SharedRoute[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > PROJECT_LIMITS.sharedRoutes) fail('use at most 64 routes.');
  const ids = new Set<string>(), names = new Set<string>();
  function point(value: unknown): Point {
    const p = object(value);
    if (typeof p.x !== 'number' || typeof p.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > field.width || p.y < 0 || p.y > field.height) fail('coordinates and controls must be finite and inside the field.');
    return { x: p.x as number, y: p.y as number };
  }
  const routes = (value as unknown[]).map(raw => {
    const r = object(raw), routeId = id(r.id);
    if (typeof r.name !== 'string' || !r.name.trim() || r.name.length > 80 || /[\u0000-\u001f]/.test(r.name)) fail('use a name of 1–80 characters without control characters.');
    const name = (r.name as string).trim();
    if (ids.has(routeId) || names.has(name.toLowerCase())) fail('route IDs and names must be unique in the production.');
    ids.add(routeId); names.add(name.toLowerCase());
    if (typeof r.closed !== 'boolean') fail('choose open or closed geometry explicitly.');
    if (!Array.isArray(r.segments) || !r.segments.length || r.segments.length > PROJECT_LIMITS.pathSegments) fail('use 1–32 segments.');
    const segmentIds = new Set<string>();
    const segments = (r.segments as unknown[]).map((raw): RouteSegment => {
      const s = object(raw), segmentId = id(s.id), to = point(s.to);
      if (segmentIds.has(segmentId)) fail('segment IDs must be unique within a route.');
      segmentIds.add(segmentId);
      if (s.kind === 'cubic') return { id: segmentId, kind: 'cubic', to, control1: point(s.control1), control2: point(s.control2) };
      if (s.kind !== 'line') fail('only line and cubic segments are supported.');
      if ('control1' in s || 'control2' in s) fail('a line cannot contain cubic controls.');
      return { id: segmentId, kind: 'line', to };
    });
    const route: SharedRoute = { id: routeId, name, closed: r.closed as boolean, start: point(r.start), segments };
    const end = segments.at(-1)!.to;
    if (route.closed && (end.x !== route.start.x || end.y !== route.start.y)) fail('a closed route must end exactly at its start seam.');
    let from = route.start;
    for (const s of segments) {
      if (movementLength(from, s.to, { segments: [{ ...s, startCount: 0, endCount: 1 }] }) < .01) fail('each segment must have at least 0.01 yard of travel.');
      from = s.to;
    }
    return route;
  });
  return routes.length ? routes : undefined;
}

/** Adapter shares the exact cubic evaluator and vector geometry with travel paths.
 * Unit segment times are internal parameters, never show counts. */
export function routePath(route: SharedRoute): PerformerPath {
  return { segments: route.segments.map((s, i) => ({ ...s, startCount: i, endCount: i + 1 })) };
}
export const routeSvg = (route: SharedRoute): string => movementSvg(route.start, route.segments.at(-1)!.to, routePath(route));
export const routeLength = (route: SharedRoute): number => movementLength(route.start, route.segments.at(-1)!.to, routePath(route));

/** Reverse direction while retaining the closed seam, IDs and exact cubic locus. */
export function reverseRoute(route: SharedRoute): SharedRoute {
  const starts = [route.start, ...route.segments.slice(0, -1).map(s => s.to)];
  return { ...route, start: { ...route.segments.at(-1)!.to }, segments: route.segments.map((s, i): RouteSegment => s.kind === 'cubic'
    ? { ...s, to: { ...starts[i] }, control1: { ...s.control2 }, control2: { ...s.control1 } }
    : { ...s, to: { ...starts[i] } }).reverse() };
}

/** Distance lookup for future group consumers and the editor preview. Adaptive
 * subdivision bounds the complete chord/control-polygon length gap by .001 yd.
 * Points evaluate the serialized cubic, not the approximating polyline. */
export function compileRoute(route: SharedRoute) {
  type Entry = { length: number; segment: number; t: number };
  const table: Entry[] = [{ length: 0, segment: 0, t: 0 }];
  let total = 0, from = route.start;
  function append(point: Point, previous: Point, segment: number, t: number) {
    total += distance(previous, point);
    if (table.length >= 65536) fail('distance sampling exceeded its bounded work budget. Simplify the route.');
    table.push({ length: total, segment, t });
  }
  route.segments.forEach((s, segment) => {
    if (segment) table.push({ length: total, segment, t: 0 });
    function subdivide(a: Point, b: Point, c: Point, d: Point, lo: number, hi: number, budget: number, depth: number) {
      const gap = distance(a, b) + distance(b, c) + distance(c, d) - distance(a, d);
      // Collinear controls can still have nonuniform parameter speed. Bound
      // deviation from a uniformly parameterized chord as well as length error.
      const parameterError = Math.max(distance(b, mix(a, d, 1 / 3)), distance(c, mix(a, d, 2 / 3)));
      if (gap <= budget && parameterError <= .0005) { append(d, a, segment, hi); return; }
      if (depth === 20) fail('distance sampling did not converge. Simplify the route.');
      const ab = mix(a, b), bc = mix(b, c), cd = mix(c, d), abc = mix(ab, bc), bcd = mix(bc, cd), middle = mix(abc, bcd), mid = (lo + hi) / 2;
      subdivide(a, ab, abc, middle, lo, mid, budget / 2, depth + 1);
      subdivide(middle, bcd, cd, d, mid, hi, budget / 2, depth + 1);
    }
    if (s.kind === 'line') append(s.to, from, segment, 1);
    else subdivide(from, s.control1, s.control2, s.to, 0, 1, .001 / route.segments.length, 0);
    from = s.to;
  });
  function atDistance(value: number): Point {
    if (!Number.isFinite(value)) throw Error('Use a finite route distance.');
    const target = route.closed ? ((value % total) + total) % total : Math.max(0, Math.min(total, value));
    let low = 0, high = table.length - 1;
    while (low < high) { const mid = Math.floor((low + high) / 2); if (table[mid].length < target) low = mid + 1; else high = mid; }
    const end = table[low], begin = table[Math.max(0, low - 1)], s = route.segments[end.segment];
    const first = end.segment ? route.segments[end.segment - 1].to : route.start;
    const span = end.length - begin.length, startT = begin.segment === end.segment ? begin.t : 0;
    const t = span ? startT + (end.t - startT) * (target - begin.length) / span : end.t;
    return sampleMovement(first, s.to, { segments: [{ ...s, startCount: 0, endCount: 1 }] }, t, 1);
  }
  return { length: total, atDistance, samples: table.length, table };
}

export function routeSeam(route: SharedRoute): string {
  if (!route.closed) return 'Open endpoints';
  const first = route.segments[0], last = route.segments.at(-1)!, before = route.segments.length > 1 ? route.segments.at(-2)!.to : route.start;
  const a = first.kind === 'cubic' ? first.control1 : first.to, b = last.kind === 'cubic' ? last.control2 : before;
  const outgoing = { x: a.x - route.start.x, y: a.y - route.start.y }, incoming = { x: route.start.x - b.x, y: route.start.y - b.y };
  const magnitude = Math.hypot(outgoing.x, outgoing.y) * Math.hypot(incoming.x, incoming.y);
  if (!magnitude) return 'Seam tangent is undefined (zero handle)';
  return Math.abs(outgoing.x * incoming.y - outgoing.y * incoming.x) / magnitude < 1e-6 && outgoing.x * incoming.x + outgoing.y * incoming.y > 0
    ? 'Seam tangents align; speed continuity is not implied' : 'Corner seam; tangents do not align';
}
