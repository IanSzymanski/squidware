// Drill authoring kit for the demo show. Every shape comes from Squidware's own generators,
// so stored dots match their live formations, routes and group programs exactly.
import { generateFormation } from '../../src/formationGeometry';
import { bezierFormationPoints } from '../../src/bezierFormations';
import { generateScatter } from '../../src/scatterFormations';
import { compileRoute } from '../../src/sharedRoutes';
import type {
  AssignmentConstraints, BezierFormation, DrillSet, GroupMotion, LiveFormation, MarchingDirection, Move, PathSegment,
  PerformerPath, Point, Project, ScatterRegion, SharedRoute,
} from '../../src/types';

export const FIELD: Project['field'] = { width: 100, height: 160 / 3, preset: 'college' };
export const P = (x: number, y: number): Point => ({ x, y });
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const round = (n: number) => Math.round(n * 1e9) / 1e9;

/** Squared-distance optimal assignment (Hungarian). Squared cost keeps straight-line travel collision-free within a group. */
export function hungarian(cost: number[][]): number[] {
  const n = cost.length, u = Array(n + 1).fill(0), v = Array(n + 1).fill(0), p = Array(n + 1).fill(0), way = Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0; const minv = Array(n + 1).fill(Infinity), used = Array(n + 1).fill(false);
    do {
      used[j0] = true; const i0 = p[j0]; let delta = Infinity, j1 = 0;
      for (let j = 1; j <= n; j++) if (!used[j]) {
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const result = Array(n).fill(0);
  for (let j = 1; j <= n; j++) result[p[j] - 1] = j - 1;
  return result; // performer index -> slot index
}

/** Catmull-Rom style smooth Bézier through points; interior handles are symmetric and collinear. */
export function smooth(points: Point[], tension = 1 / 6): BezierFormation {
  const last = points.length - 1;
  return { anchors: points.map((p, i) => {
    const prev = points[Math.max(0, i - 1)], next = points[Math.min(last, i + 1)];
    if (i === 0) return { id: `a${i}`, point: p, incoming: p, outgoing: P(p.x + (next.x - p.x) / 3, p.y + (next.y - p.y) / 3), mode: 'corner' as const };
    if (i === last) return { id: `a${i}`, point: p, incoming: P(p.x - (p.x - prev.x) / 3, p.y - (p.y - prev.y) / 3), outgoing: p, mode: 'corner' as const };
    const t = P((next.x - prev.x) * tension, (next.y - prev.y) * tension);
    return { id: `a${i}`, point: p, incoming: P(p.x - t.x, p.y - t.y), outgoing: P(p.x + t.x, p.y + t.y), mode: 'symmetric' as const };
  }) };
}

export function closedCircleRoute(id: string, name: string, c: Point, rx: number, ry = rx, startAngle = 90): SharedRoute {
  // Four cubic quarter-arcs; the route starts (and closes) at startAngle (degrees, 90 = front of the circle).
  const k = 0.5522847498;
  const at = (deg: number) => { const a = deg * Math.PI / 180; return P(round(c.x + Math.cos(a) * rx), round(c.y + Math.sin(a) * ry)); };
  const tan = (deg: number, s: number) => { const a = deg * Math.PI / 180; return P(-Math.sin(a) * rx * k * s, Math.cos(a) * ry * k * s); };
  const segs = [0, 1, 2, 3].map(i => {
    const a0 = startAngle + 90 * i, a1 = a0 + 90, p0 = at(a0), p1 = at(a1), t0 = tan(a0, 1), t1 = tan(a1, 1);
    return { id: `q${i}`, kind: 'cubic' as const, to: i === 3 ? at(startAngle) : p1, control1: P(round(p0.x + t0.x), round(p0.y + t0.y)), control2: P(round(p1.x - t1.x), round(p1.y - t1.y)) };
  });
  return { id, name, closed: true, start: at(startAngle), segments: segs };
}

export function openRoute(id: string, name: string, points: Point[]): SharedRoute {
  const b = smooth(points);
  return { id, name, closed: false, start: b.anchors[0].point, segments: b.anchors.slice(1).map((a, i) => ({ id: `s${i}`, kind: 'cubic' as const, to: a.point, control1: b.anchors[i].outgoing, control2: a.incoming })) };
}

export const routeCache = new Map<string, ReturnType<typeof compileRoute>>();
export function routeAt(route: SharedRoute, distance: number): Point {
  let c = routeCache.get(route.id); if (!c) { c = compileRoute(route); routeCache.set(route.id, c); }
  return c.atDistance(distance);
}
export function routeLength(route: SharedRoute): number { routeAt(route, 0); return routeCache.get(route.id)!.length; }

/** Cubic approximation of a circular arc about a pivot (rotating forms). */
export function arcPath(from: Point, pivot: Point, degrees: number, counts: number, id = 'arc'): PerformerPath | undefined {
  const r = dist(from, pivot); if (r < 0.05 || Math.abs(degrees) < 0.5) return undefined;
  const a0 = Math.atan2(from.y - pivot.y, from.x - pivot.x), a1 = a0 + degrees * Math.PI / 180, k = 4 / 3 * Math.tan((a1 - a0) / 4);
  const p1 = P(pivot.x + r * Math.cos(a1), pivot.y + r * Math.sin(a1));
  const c1 = P(from.x - k * r * Math.sin(a0), from.y + k * r * Math.cos(a0)), c2 = P(p1.x + k * r * Math.sin(a1), p1.y - k * r * Math.cos(a1));
  const inField = (p: Point) => p.x >= 0 && p.x <= FIELD.width && p.y >= 0 && p.y <= FIELD.height;
  if (!inField(c1) || !inField(c2)) return undefined;
  return { segments: [{ id, kind: 'cubic', startCount: 0, endCount: counts, control1: c1, control2: c2 }] };
}
/** Cubic Hermite approximation of a logarithmic spiral (rotation plus scaling about a pivot). */
export function spiralPath(from: Point, pivot: Point, degrees: number, scale: number, counts: number): PerformerPath | undefined {
  const dx = from.x - pivot.x, dy = from.y - pivot.y, r0 = Math.hypot(dx, dy); if (r0 < .05) return undefined;
  const a0 = Math.atan2(dy, dx), th = degrees * Math.PI / 180, ls = Math.log(scale);
  const at = (u: number) => { const r = r0 * Math.pow(scale, u), a = a0 + th * u; return { p: P(pivot.x + r * Math.cos(a), pivot.y + r * Math.sin(a)), d: P(r * (ls * Math.cos(a) - th * Math.sin(a)), r * (ls * Math.sin(a) + th * Math.cos(a))) }; };
  const s = at(0), e = at(1), c1 = P(s.p.x + s.d.x / 3, s.p.y + s.d.y / 3), c2 = P(e.p.x - e.d.x / 3, e.p.y - e.d.y / 3);
  const inField = (p: Point) => p.x >= 0 && p.x <= FIELD.width && p.y >= 0 && p.y <= FIELD.height;
  if (!inField(c1) || !inField(c2)) return undefined;
  return { segments: [{ id: 'spiral', kind: 'cubic', startCount: 0, endCount: counts, control1: c1, control2: c2 }] };
}
export function spiralPoint(p: Point, pivot: Point, degrees: number, scale: number): Point {
  const r = rotateAbout(p, pivot, degrees); return P(pivot.x + (r.x - pivot.x) * scale, pivot.y + (r.y - pivot.y) * scale);
}
export function rotateAbout(p: Point, pivot: Point, degrees: number): Point {
  const a = degrees * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return P(pivot.x + (p.x - pivot.x) * c - (p.y - pivot.y) * s, pivot.y + (p.x - pivot.x) * s + (p.y - pivot.y) * c);
}

export interface SetOptions { transition?: 'linear' | 'ease' }
export interface Cast { performers: Project['performers']; sections: Project['sections'] }

export class SetBuilder {
  next: Record<string, Point>;
  live: LiveFormation[] = [];
  paths: Record<string, PerformerPath> = {};
  groups: GroupMotion[] = [];
  directions: Record<string, MarchingDirection> = {};
  private liveId = 0;
  constructor(public prev: Record<string, Point>, public counts: number, public setKey: string, public show: Show) { this.next = { ...prev }; }

  /** Assign ids to points by minimum squared travel, or keep the given order. */
  assign(ids: string[], pts: Point[], keepOrder = false): number[] {
    if (ids.length !== pts.length) throw Error(`assign: ${ids.length} performers for ${pts.length} points in ${this.setKey}`);
    const slots = keepOrder ? ids.map((_, i) => i) : hungarian(ids.map(id => pts.map(p => { const d = dist(this.prev[id], p); return d * d; })));
    ids.forEach((id, i) => { this.next[id] = pts[slots[i]]; });
    return slots;
  }
  addLive(name: string, kind: LiveFormation['kind'], ids: string[], slots: number[], options: LiveFormation['options'], extra: Partial<LiveFormation> = {}) {
    this.live.push({ ...extra, id: `${this.setKey}-f${++this.liveId}`, name, kind, options, slotCount: ids.length,
      members: ids.map((performerId, i) => ({ performerId, slot: slots[i] })).sort((a, b) => a.slot - b.slot) } as LiveFormation);
  }
  /** Editable Bézier curve formation (arc-length spaced slots). */
  curve(name: string, ids: string[], through: Point[], opts: { keepOrder?: boolean; constraints?: AssignmentConstraints } = {}) {
    const bezier = smooth(through), pts = bezierFormationPoints(bezier, ids.length), slots = this.assign(ids, pts, opts.keepOrder);
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    this.addLive(name, 'curve', ids, slots, { center: P(cx, cy), width: Math.max(.1, Math.max(...xs) - Math.min(...xs)), height: Math.max(...ys) - Math.min(...ys), rotation: 0, columns: 1, assignment: 'position' },
      { bezier, ...(opts.constraints ? { assignmentConstraints: opts.constraints } : {}) });
    return pts;
  }
  shape(kind: 'line' | 'arc' | 'circle' | 'block' | 'curve', name: string, ids: string[], o: { center: Point; width: number; height?: number; rotation?: number; columns?: number }, keepOrder = false, live = true) {
    const options = { center: o.center, width: o.width, height: o.height ?? 0, rotation: o.rotation ?? 0, columns: o.columns ?? 1, assignment: 'position' as const };
    const pts = generateFormation(kind, ids.length, options), slots = this.assign(ids, pts, keepOrder);
    if (live && ids.length > 1) this.addLive(name, kind, ids, slots, options);
    return pts;
  }
  line(name: string, ids: string[], a: Point, b: Point, keepOrder = false) {
    return this.shape('line', name, ids, { center: P((a.x + b.x) / 2, (a.y + b.y) / 2), width: dist(a, b), rotation: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI }, keepOrder);
  }
  scatter(name: string, ids: string[], region: ScatterRegion, seed: string, spacing: number, distribution: 'uniform' | 'clustered' = 'uniform') {
    const s = generateScatter({ version: 1, seed, region, minimumSpacing: spacing, distribution, clusterStrength: .6 }, ids.length, {}, FIELD);
    const slots = this.assign(ids, s.points);
    const xs = s.points.map(p => p.x), ys = s.points.map(p => p.y);
    this.addLive(name, 'block', ids, slots, { center: P((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2), width: Math.max(.1, Math.max(...xs) - Math.min(...xs)), height: Math.max(...ys) - Math.min(...ys), rotation: 0, columns: Math.max(1, Math.round(Math.sqrt(ids.length))), assignment: 'position' }, { scatter: s });
    return s.points;
  }
  points(ids: string[], pts: Point[], keepOrder = false) { return this.assign(ids, pts, keepOrder); }
  at(id: string, p: Point) { this.next[id] = p; }
  path(id: string, path: PerformerPath | undefined) { if (path) this.paths[id] = path; }
  direction(ids: string[], d: MarchingDirection) { ids.forEach(id => { this.directions[id] = d; }); }
  /** Rotate the current positions of ids about a pivot, travelling on circular arcs. */
  rotate(ids: string[], pivot: Point, degrees: number) {
    ids.forEach(id => { this.next[id] = rotateAbout(this.prev[id], pivot, degrees); this.path(id, arcPath(this.prev[id], pivot, degrees, this.counts, 'rot')); });
  }
  /** Rotate and scale about a pivot on spiral arcs (no pair ever gets closer than scale × its spacing). */
  spiral(ids: string[], pivot: Point, degrees: number, scale: number) {
    ids.forEach(id => { this.next[id] = spiralPoint(this.prev[id], pivot, degrees, scale); this.path(id, spiralPath(this.prev[id], pivot, degrees, scale, this.counts)); });
  }
  /** Translate the current positions of ids. */
  shift(ids: string[], dx: number, dy: number) { ids.forEach(id => { this.next[id] = P(this.prev[id].x + dx, this.prev[id].y + dy); }); }
  /** Staggered departure: performer i holds for delay(i) counts, then travels for the remaining time. */
  stagger(ids: string[], delays: number[]) {
    ids.forEach((id, i) => {
      const d = delays[i]; const from = this.prev[id], to = this.next[id];
      if (d <= 0 || dist(from, to) < 1e-9) return;
      this.paths[id] = { segments: [{ id: 'wait', kind: 'hold', startCount: 0, endCount: d }, { id: 'go', kind: 'line', startCount: d, endCount: this.counts }] };
    });
  }
  curvedTravel(id: string, c1: Point, c2: Point) { this.paths[id] = { segments: [{ id: 'curve', kind: 'cubic', startCount: 0, endCount: this.counts, control1: c1, control2: c2 }] }; }
  schedule(id: string, segments: PathSegment[]) { this.paths[id] = { segments }; }
  /** Conveyor: members ride the route together at a fixed interval (closed routes default to even spacing).
   * dir is a direction or a list of direction/stop cues; returns the leader displacement. */
  conveyor(name: string, route: SharedRoute, ids: string[], speed: number, dir: 1 | -1 | GroupMotion['cues'], phase = 0, interval?: number) {
    this.show.route(route);
    const L = routeLength(route), gap = interval ?? L / ids.length;
    const cues = typeof dir === 'number' ? [{ count: 0, direction: dir }] : dir;
    let shift = 0; cues.forEach((c, i) => { shift += ((cues[i + 1]?.count ?? this.counts) - c.count) * c.direction * speed; });
    ids.forEach((id, r) => { this.next[id] = routeAt(route, phase + shift + r * gap); });
    this.groups.push({ id: `${this.setKey}-g${this.groups.length + 1}`, name, routeId: route.id, mode: 'conveyor', members: ids, delay: 0, interval: gap, offsetDirection: 1, phase, speed, entryCounts: 0, exitCounts: 0, endpointPolicy: 'reject', cues });
    return shift;
  }
  /** Follow the leader along an open route; members already stand on the route (placeOnRoute). */
  follow(name: string, route: SharedRoute, ids: string[], speed: number, delay: number, phase: number, mode: 'follow' | 'countermarch' = 'follow', cues: GroupMotion['cues'] = [{ count: 0, direction: 1 }]) {
    this.show.route(route);
    const g: GroupMotion = { id: `${this.setKey}-g${this.groups.length + 1}`, name, routeId: route.id, mode, members: ids, delay, interval: 1, offsetDirection: 1, phase, speed, entryCounts: 0, exitCounts: 0, endpointPolicy: 'reject', cues };
    const dir = (c: number) => { let d = cues[0].direction; for (const q of cues) { if (q.count > c) break; d = q.direction; } return d; };
    const lead = (c: number) => { const lo = Math.min(0, c), hi = Math.max(0, c), cuts = [lo, ...cues.map(q => q.count).filter(q => q > lo && q < hi), hi]; let s = 0; for (let i = 1; i < cuts.length; i++) s += (cuts[i] - cuts[i - 1]) * dir((cuts[i] + cuts[i - 1]) / 2) * speed; return phase + (c < 0 ? -s : s); };
    ids.forEach((id, r) => { this.next[id] = routeAt(route, lead(this.counts - r * delay)); });
    this.groups.push(g);
  }
}

export function placeOnRoute(route: SharedRoute, ids: string[], phase: number, spacing: number): Record<string, Point> {
  return Object.fromEntries(ids.map((id, r) => [id, routeAt(route, phase - r * spacing)]));
}

export class Show {
  sets: DrillSet[] = []; moves: Move[] = []; routes: SharedRoute[] = [];
  arrivals: number[] = []; cur: Record<string, Point>; at = 0;
  constructor(initial: Record<string, Point>, private tempoAt: (count: number) => number) { this.cur = { ...initial }; }
  route(r: SharedRoute) { if (!this.routes.some(x => x.id === r.id)) this.routes.push(r); }
  set(name: string, at: number, notes: string, build: (b: SetBuilder) => void, opts: SetOptions = {}) {
    const index = this.sets.length, key = `set-${String(index + 1).padStart(3, '0')}`;
    if (index && at <= this.at) throw Error(`${name}: arrival ${at} must follow ${this.at}`);
    const b = new SetBuilder(this.cur, index ? at - this.at : 0, key, this);
    build(b);
    if (index) {
      const prev = this.sets[index - 1];
      const move: Move = { id: `move-${String(index).padStart(3, '0')}`, fromSetId: prev.id, toSetId: key, counts: at - this.at, tempo: this.tempoAt(this.at), transition: opts.transition ?? 'linear', paths: b.paths };
      if (Object.keys(b.directions).length) move.marchingDirections = b.directions;
      if (b.groups.length) move.groupMotions = b.groups;
      this.moves.push(move);
    }
    const set: DrillSet = { id: key, name, notes, positions: b.next };
    if (b.live.length) set.liveFormations = b.live;
    this.sets.push(set); this.arrivals.push(at); this.cur = b.next; this.at = at;
    return set;
  }
}
