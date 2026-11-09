// Higher-level form recipes: multi-section shapes with section slot constraints, battery arcs, ellipse rings.
import { generateFormation } from '../../src/formationGeometry';
import { bezierFormationPoints } from '../../src/bezierFormations';
import type { AssignmentConstraints, FormationKind, LiveFormation, Point } from '../../src/types';
import { hungarian, P, smooth, SetBuilder } from './lib';

export const SECTION_OF: Record<string, string> = {};
export type Source =
  | { curve: Point[]; tension?: number }
  | { kind: FormationKind; center: Point; width: number; height?: number; rotation?: number; columns?: number }
  | { pts: Point[]; closed?: boolean };
export interface FormOptions { mix?: boolean; roles?: Record<string, string>; roleSlots?: { slot: number; role: string }[]; order?: number[]; live?: boolean }

const d2 = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const ellipse = (c: Point, rx: number, ry: number, deg: number) => P(c.x + rx * Math.cos(deg * Math.PI / 180), c.y + ry * Math.sin(deg * Math.PI / 180));
/** n points along an elliptical arc (degrees; 0 = toward side 2, 90 = toward the front sideline). */
export function arcPts(c: Point, rx: number, ry: number, a0: number, a1: number, n: number): Point[] {
  return Array.from({ length: n }, (_, i) => ellipse(c, rx, ry, a0 + (a1 - a0) * (n === 1 ? .5 : i / (n - 1))));
}
export function ringPts(c: Point, rx: number, ry: number, n: number, start = 90): Point[] {
  return Array.from({ length: n }, (_, i) => ellipse(c, rx, ry, start + 360 * i / n));
}

/** Places several groups on one shape as contiguous runs. The run order is chosen from where each group stands now;
 * each group is then assigned inside its run by minimum squared travel. Single-section runs become section slot rules. */
export function form(b: SetBuilder, name: string, groups: string[][], src: Source, opt: FormOptions = {}): Point[] {
  groups = groups.filter(g => g.length);
  const N = groups.reduce((n, g) => n + g.length, 0);
  let pts: Point[], liveKind: LiveFormation['kind'] | undefined, options: LiveFormation['options'] | undefined, extra: Partial<LiveFormation> = {};
  if ('curve' in src) {
    const bezier = smooth(src.curve, src.tension); pts = bezierFormationPoints(bezier, N);
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    liveKind = 'curve'; extra = { bezier };
    options = { center: P((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2), width: Math.max(.1, Math.max(...xs) - Math.min(...xs)), height: Math.max(...ys) - Math.min(...ys), rotation: 0, columns: 1, assignment: 'position' };
  } else if ('kind' in src) {
    options = { center: src.center, width: src.width, height: src.height ?? 0, rotation: src.rotation ?? 0, columns: src.columns ?? 1, assignment: 'position' };
    pts = generateFormation(src.kind, N, options); liveKind = src.kind;
  } else pts = src.pts;
  if (pts.length !== N) throw Error(`${name}: ${N} performers for ${pts.length} points`);
  const closed = ('kind' in src && src.kind === 'circle') || ('pts' in src && !!src.closed);
  const slotsOf: number[][] = [];
  if (opt.mix || groups.length === 1) {
    const ids = groups.flat(); groups = [ids];
    slotsOf.push(pts.map((_, i) => i));
  } else {
    // Order runs by where each group projects onto the shape now (nearest-slot index, circular for closed shapes).
    const nearest = (p: Point) => { let bi = 0, bd = Infinity; pts.forEach((q, i) => { const d = d2(p, q); if (d < bd) { bd = d; bi = i; } }); return bi; };
    const key = groups.map(g => {
      const idx = g.map(id => nearest(b.prev[id]));
      if (!closed) return idx.reduce((a, i) => a + i, 0) / idx.length;
      const sx = idx.reduce((a, i) => a + Math.cos(2 * Math.PI * i / N), 0), sy = idx.reduce((a, i) => a + Math.sin(2 * Math.PI * i / N), 0);
      return ((Math.atan2(sy, sx) / (2 * Math.PI)) * N + N) % N;
    });
    const perm = opt.order ?? groups.map((_, i) => i).sort((a, c) => key[a] - key[c]);
    const cents = groups.map(g => { const s = g.reduce((a, id) => P(a.x + b.prev[id].x, a.y + b.prev[id].y), P(0, 0)); return P(s.x / g.length, s.y / g.length); });
    let best = Infinity, bestOff = 0;
    for (let off = 0; off < (closed ? N : 1); off++) {
      let at = 0, cost = 0;
      for (const g of perm) { let cx = 0, cy = 0; const n = groups[g].length; for (let k = 0; k < n; k++) { const q = pts[(off + at + k) % N]; cx += q.x; cy += q.y; } cost += n * d2(P(cx / n, cy / n), cents[g]); at += n; }
      if (cost < best) { best = cost; bestOff = off; }
    }
    if (process.env.DEBUG_FORM === name) console.log(name, perm.map(g => `${groups[g][0]}x${groups[g].length}@${key[g].toFixed(1)}`).join(' '), 'off', bestOff);
    const order = pts.map((_, k) => (bestOff + k) % N); let at = 0;
    const runs: number[][] = groups.map(() => []);
    for (const g of perm) { runs[g] = order.slice(at, at + groups[g].length); at += groups[g].length; }
    slotsOf.push(...runs);
  }
  const allIds: string[] = [], allSlots: number[] = [];
  groups.forEach((ids, gi) => {
    const slots = slotsOf[gi];
    const pick = hungarian(ids.map(id => slots.map(s => d2(b.prev[id], pts[s]))));
    ids.forEach((id, i) => { b.next[id] = pts[slots[pick[i]]]; allIds.push(id); allSlots.push(slots[pick[i]]); });
  });
  if (liveKind && options && opt.live !== false && N > 1) {
    const sectionSlots: AssignmentConstraints['sectionSlots'] = [];
    if (!opt.mix && groups.length > 1) groups.forEach((ids, gi) => {
      const sections = new Set(ids.map(id => SECTION_OF[id]));
      if (sections.size === 1) slotsOf[gi].forEach(slot => sectionSlots.push({ slot, sectionId: SECTION_OF[ids[0]] }));
    });
    const roles = opt.roles ?? {}, roleSlots = opt.roleSlots ?? [];
    if (sectionSlots.length || roleSlots.length) {
      extra.assignmentConstraints = { pins: [], forbidden: [], sectionSlots: sectionSlots.sort((a, c) => a.slot - c.slot), roleSlots, roles: Object.fromEntries(Object.entries(roles).filter(([id]) => allIds.includes(id))), unknownRoles: 'allow', orderedGroups: [] };
    }
    b.addLive(name, liveKind, allIds, allSlots, options, extra);
  }
  return pts;
}

export interface BatteryIds { SD: string[]; TD: string[]; BD: string[]; CY: string[] }
/** A shallow arc as an arc-length-spaced Bézier curve (generated arcs bunch at their ends). local +y bulges toward rot's front. */
export function bow(c: Point, w: number, h: number, rot = 0): Point[] {
  const a = rot * Math.PI / 180, at = (x: number, y: number) => P(c.x + x * Math.cos(a) - y * Math.sin(a), c.y + x * Math.sin(a) + y * Math.cos(a));
  return [at(-w / 2, -h / 2), at(0, h / 2), at(w / 2, -h / 2)];
}
/** Standard battery arc: snares front, tenors, basses, cymbals behind; rot turns the whole battery about c. */
export function batteryArc(b: SetBuilder, name: string, bat: BatteryIds, c: Point, w = 11, rot = 0) {
  const rows: [string[], number, number, number][] = [[bat.SD, w, 1.2, 0], [bat.TD, 6.4, .7, -2.2], [bat.BD, 7.2, .7, -4.2], [bat.CY, 7.5, .5, -6.1]];
  const a = rot * Math.PI / 180;
  rows.forEach(([ids, width, height, dy], i) => {
    if (!ids.length) return;
    const center = P(c.x - dy * Math.sin(a), c.y + dy * Math.cos(a));
    form(b, `${name} ${['snares', 'tenors', 'basses', 'cymbals'][i]}`, [ids], { curve: bow(center, width, height, rot) });
  });
}
/** Polygon band following an elliptical arc (for scatter regions shaped like a horseshoe). */
export function bandPolygon(c: Point, rIn: [number, number], rOut: [number, number], a0: number, a1: number, n = 14): Point[] {
  return [...arcPts(c, rOut[0], rOut[1], a0, a1, n), ...arcPts(c, rIn[0], rIn[1], a1, a0, n)];
}
/** Points sorted by angle about c, starting at startDeg and increasing. */
export function byAngle(pts: Point[], c: Point, startDeg: number): Point[] {
  const ang = (p: Point) => ((Math.atan2(p.y - c.y, p.x - c.x) * 180 / Math.PI - startDeg) % 360 + 720) % 360;
  return [...pts].sort((a, b) => ang(a) - ang(b));
}
/** Register a live circle/arc/line/block formation for members already placed on generateFormation points. */
export function registerLive(b: SetBuilder, name: string, kind: FormationKind, options: { center: Point; width: number; height?: number; rotation?: number; columns?: number }, members: string[]) {
  const o = { center: options.center, width: options.width, height: options.height ?? 0, rotation: options.rotation ?? 0, columns: options.columns ?? 1, assignment: 'position' as const };
  const pts = generateFormation(kind, members.length, o);
  const slots = members.map(id => { const p = b.next[id], i = pts.findIndex(q => Math.hypot(q.x - p.x, q.y - p.y) < 1e-9); if (i < 0) throw Error(`${name}: ${id} is not on the shape`); return i; });
  b.addLive(name, kind, members, slots, o);
}
/** Mirror a list of points across the 50 for symmetric moments. */
export const mirror = (pts: Point[]) => pts.map(p => P(100 - p.x, p.y));
