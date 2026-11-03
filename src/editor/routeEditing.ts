import { uid } from '../domain';
import { PROJECT_LIMITS } from '../projectValidation';
import { validateSharedRoutes } from '../sharedRoutes';
import type { Point, Project, RouteSegment, SharedRoute } from '../types';
import { simplifyStroke } from './pathAuthoring';

export interface RouteEdit { routeId: string; existing: boolean; route: SharedRoute | null; revision: number; epoch: number }

export function editSharedRoute(project: Project, request: RouteEdit): Project {
  const routes = project.sharedRoutes ?? [], exists = routes.some(r => r.id === request.routeId);
  if (exists !== request.existing || (!exists && !request.route)) throw Error('The route changed. Cancel and reopen Shared routes.');
  if (request.route && request.route.id !== request.routeId) throw Error('The reviewed route ID changed.');
  const index = routes.findIndex(r => r.id === request.routeId);
  const next = request.route ? index < 0 ? [...routes, request.route] : routes.map((r, i) => i === index ? request.route! : r) : routes.filter(r => r.id !== request.routeId);
  const checked = validateSharedRoutes(next, project.field);
  const { sharedRoutes: _routes, ...plain } = project;
  return checked ? { ...plain, sharedRoutes: checked } : plain;
}

export function newSharedRoute(routes: readonly SharedRoute[], field: Project['field']): SharedRoute {
  let n = 1; while (routes.some(r => r.name.toLowerCase() === `route ${n}`)) n++;
  return { id: uid(), name: `Route ${n}`, closed: false, start: { x: 25, y: field.height / 2 }, segments: [{ id: uid(), kind: 'line', to: { x: 75, y: field.height / 2 } }] };
}

/** Shared strokes have free endpoints. Closing a captured stroke requires a
 * reviewed attachment within tolerance; click/numeric anchors explicitly add a
 * closing chord. Attachment consumes fitting budget exactly as in travel fits. */
export function fitSharedRoute(route: SharedRoute, input: readonly Point[], tolerance: number, curved: boolean, anchors: boolean, field: Project['field']): SharedRoute {
  if (input.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > field.width || p.y > field.height)) throw Error('Captured points must be finite and inside the field.');
  let points = input.map(p => ({ ...p })), budget = tolerance;
  if (route.closed && points.length > 1) {
    const first = points[0], end = points.at(-1)!, gap = Math.hypot(first.x - end.x, first.y - end.y);
    if (anchors) { if (gap > 1e-9) points.push({ ...first }); }
    else {
      if (gap > tolerance - .01) throw Error('End the closed stroke closer to its start seam, or use Place anchors to add an explicit closing segment.');
      budget -= gap;
      points[points.length - 1] = { ...first };
    }
  }
  points = simplifyStroke(points, budget);
  const segments = points.slice(1).map((to, i): RouteSegment => {
    const from = points[i];
    return curved ? { id: uid(), kind: 'cubic', to, control1: { x: from.x + (to.x - from.x) / 3, y: from.y + (to.y - from.y) / 3 }, control2: { x: from.x + (to.x - from.x) * 2 / 3, y: from.y + (to.y - from.y) * 2 / 3 } } : { id: uid(), kind: 'line', to };
  });
  if (segments.length > PROJECT_LIMITS.pathSegments) throw Error('Use at most 32 route segments.');
  return validateSharedRoutes([{ ...route, start: points[0], segments }], field)![0];
}

/** Anchor edits translate neighboring tangent handles; changing the seam also
 * changes the closing endpoint. Controls otherwise move independently. */
export function moveRoutePoint(route: SharedRoute, segmentId: string, kind: 'start' | 'arrival' | 'control1' | 'control2', point: Point): SharedRoute {
  if (route.closed && kind === 'arrival' && segmentId === route.segments.at(-1)?.id) return moveRoutePoint(route, '', 'start', point);
  const index = kind === 'start' ? -1 : route.segments.findIndex(s => s.id === segmentId);
  if (index < 0 && kind !== 'start') return route;
  const old = kind === 'start' ? route.start : kind === 'arrival' ? route.segments[index].to : route.segments[index].kind === 'cubic' ? route.segments[index][kind] : point;
  const delta = { x: point.x - old.x, y: point.y - old.y }, shifted = (p: Point) => ({ x: p.x + delta.x, y: p.y + delta.y });
  if (kind === 'control1' || kind === 'control2') return { ...route, segments: route.segments.map((s, i) => i === index && s.kind === 'cubic' ? { ...s, [kind]: point } : s) };
  return { ...route, ...(kind === 'start' ? { start: point } : {}), segments: route.segments.map((s, i) => {
    const arrival = i === index || kind === 'start' && route.closed && i === route.segments.length - 1;
    const departure = i === index + 1 || route.closed && index === route.segments.length - 1 && i === 0;
    return { ...s, ...(arrival ? { to: point } : {}), ...(s.kind === 'cubic' ? { control1: departure ? shifted(s.control1) : s.control1, control2: arrival ? shifted(s.control2) : s.control2 } : {}) };
  }) };
}

/** Split at parameter 1/2 with de Casteljau, retaining the exact locus. */
export function splitRouteSegment(route: SharedRoute, index: number): SharedRoute {
  if (route.segments.length >= PROJECT_LIMITS.pathSegments) throw Error('Use at most 32 route segments.');
  const s = route.segments[index];
  if (!s) throw Error('Select a route segment.');
  const a = index ? route.segments[index - 1].to : route.start;
  const mix = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const ab = mix(a, s.kind === 'cubic' ? s.control1 : s.to);
  let replacement: RouteSegment[];
  if (s.kind === 'line') replacement = [{ ...s, to: ab }, { ...s, id: uid() }];
  else {
    const bc = mix(s.control1, s.control2), cd = mix(s.control2, s.to), abc = mix(ab, bc), bcd = mix(bc, cd), mid = mix(abc, bcd);
    replacement = [{ ...s, to: mid, control1: ab, control2: abc }, { ...s, id: uid(), control1: bcd, control2: cd }];
  }
  return { ...route, segments: [...route.segments.slice(0, index), ...replacement, ...route.segments.slice(index + 1)] };
}
