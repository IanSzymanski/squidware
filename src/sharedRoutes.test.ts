import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { createDemoProject, parseProject, sampleProject, serializeProject, validateProject } from './domain';
import { projectV2AsLegacy } from './projectV2';
import { compileRoute, reverseRoute, routeLength, routePath, routeSeam, routeSvg, validateSharedRoutes } from './sharedRoutes';
import type { Point, SharedRoute } from './types';
import { fitSharedRoute, moveRoutePoint, newSharedRoute, splitRouteSegment } from './editor/routeEditing';
import { createEditorStore } from './editor/store';

const field = createDemoProject().field;
const curve = (): SharedRoute => ({ id: 'r', name: 'S route', closed: false, start: { x: 10, y: 10 }, segments: [
  { id: 'a', kind: 'cubic', control1: { x: 10, y: 50 }, control2: { x: 90, y: 0 }, to: { x: 90, y: 40 } },
] });
const line = (): SharedRoute => ({ id: 'line', name: 'Line', closed: false, start: { x: 10, y: 10 }, segments: [{ id: 'l', kind: 'line', to: { x: 20, y: 10 } }] });
const closed = (): SharedRoute => ({ ...curve(), closed: true, segments: [...curve().segments, { id: 'back', kind: 'line', to: { x: 10, y: 10 } }] });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
// Independent Bernstein polynomial and dense numerical integration oracle.
function oracle(route: SharedRoute, divisions = 30000) {
  const points: Point[] = [route.start], lengths = [0]; let from = route.start;
  for (const s of route.segments) {
    for (let i = 1; i <= divisions; i++) {
      const t = i / divisions, v = 1 - t;
      const p = s.kind === 'line' ? { x: from.x * v + s.to.x * t, y: from.y * v + s.to.y * t } : {
        x: v ** 3 * from.x + 3 * v * v * t * s.control1.x + 3 * v * t * t * s.control2.x + t ** 3 * s.to.x,
        y: v ** 3 * from.y + 3 * v * v * t * s.control1.y + 3 * v * t * t * s.control2.y + t ** 3 * s.to.y,
      };
      lengths.push(lengths.at(-1)! + distance(points.at(-1)!, p)); points.push(p);
    }
    from = s.to;
  }
  return { length: lengths.at(-1)!, at(d: number) {
    let lo = 0, hi = lengths.length - 1;
    while (lo < hi) { const m = Math.floor((lo + hi) / 2); if (lengths[m] < d) lo = m + 1; else hi = m; }
    const before = Math.max(0, lo - 1), span = lengths[lo] - lengths[before], t = span ? (d - lengths[before]) / span : 0;
    return { x: points[before].x + (points[lo].x - points[before].x) * t, y: points[before].y + (points[lo].y - points[before].y) * t };
  } };
}

describe('shared route geometry and independent distance oracle', () => {
  it.each([curve(), closed(), { ...curve(), segments: [{ ...curve().segments[0], kind: 'cubic' as const, control1: { x: 10, y: 10 }, control2: { x: 10, y: 10 } }] }])('samples serialized cubic geometry by distance, including nonuniform collinear speed', route => {
    const compiled = compileRoute(route), dense = oracle(route);
    expect(Math.abs(compiled.length - dense.length)).toBeLessThan(.0011);
    expect(Math.abs(routeLength(route) - dense.length)).toBeLessThan(.0006);
    for (let i = 0; i <= 32; i++) {
      const d = compiled.length * i / 32;
      expect(distance(compiled.atDistance(d), route.closed && i === 32 ? route.start : dense.at(d))).toBeLessThan(.002);
    }
    expect(compiled.samples).toBeLessThan(65536);
    expect(() => compiled.atDistance(NaN)).toThrow(/finite/);
  });
  it('wraps closed distance and clamps open distance without show counts or membership', () => {
    const open = compileRoute(line()), loop = compileRoute(closed());
    expect(open.atDistance(-3)).toEqual(line().start); expect(open.atDistance(100)).toEqual(line().segments[0].to);
    for (const d of [-3, 0, 1.25, loop.length]) expect(distance(loop.atDistance(d), loop.atDistance(d + loop.length * 2))).toBeLessThan(1e-10);
    expect(routeSvg(closed())).toContain('C'); expect(routePath(closed()).segments).toHaveLength(2);
  });
  it.each([curve(), closed(), line()])('reverses direction and controls while keeping exact locus, stable IDs and a closed seam', route => {
    const backwards = reverseRoute(route), a = compileRoute(route), b = compileRoute(backwards);
    expect(reverseRoute(backwards)).toEqual(route);
    expect(backwards.segments.map(s => s.id)).toEqual(route.segments.map(s => s.id).reverse());
    for (let i = 0; i <= 20; i++) expect(distance(a.atDistance(a.length * i / 20), b.atDistance(b.length * (1 - i / 20)))).toBeLessThan(.002);
    if (route.closed) expect(backwards.start).toEqual(route.start);
  });
  it('reports corner, aligned and undefined seam tangents without promising speed continuity', () => {
    expect(routeSeam(curve())).toBe('Open endpoints'); expect(routeSeam(closed())).toContain('Corner seam');
    const r: SharedRoute = { ...curve(), closed: true, segments: [{ ...curve().segments[0], kind: 'cubic', to: curve().start, control1: { x: 20, y: 10 }, control2: { x: 0, y: 10 } }] };
    expect(routeSeam(r)).toContain('align'); r.segments[0] = { ...r.segments[0], kind: 'cubic', control1: r.start, control2: { x: 0, y: 10 } }; expect(routeSeam(r)).toContain('undefined');
  });
  it.each([curve(), line(), closed()])('splits using exact de Casteljau geometry, then moves anchors with adjacent controls', route => {
    const split = splitRouteSegment(route, 0), a = compileRoute(route), b = compileRoute(split);
    expect(split.segments).toHaveLength(route.segments.length + 1);
    for (let i = 0; i <= 20; i++) expect(distance(a.atDistance(a.length * i / 20), b.atDistance(b.length * i / 20))).toBeLessThan(.002);
    expect(split.segments[0].id).toBe(route.segments[0].id);
    const moved = moveRoutePoint(route, '', 'start', { x: 11, y: 11 }); expect(moved.start).toEqual({ x: 11, y: 11 });
    if (moved.closed) expect(moved.segments.at(-1)!.to).toEqual(moved.start);
    if (moved.segments[0].kind === 'cubic' && route.segments[0].kind === 'cubic') expect(moved.segments[0].control1).toEqual({ x: route.segments[0].control1.x + 1, y: route.segments[0].control1.y + 1 });
  });
});

describe('bounded shared route capture and validation', () => {
  it('fits free S strokes and explicit closed anchor polygons with stable field-space error', () => {
    const stroke = Array.from({ length: 401 }, (_, i) => ({ x: 10 + i * .2, y: 25 + 10 * Math.sin(i / 400 * Math.PI * 2) }));
    const fitted = fitSharedRoute(curve(), stroke, .15, true, false, field), compiled = compileRoute(fitted);
    // Independent point-to-chord distances prove capture approximation, not just a snapshot.
    for (const point of stroke) {
      const starts = [fitted.start, ...fitted.segments.slice(0, -1).map(s => s.to)];
      const deviation = Math.min(...fitted.segments.map((s, i) => {
        const a = starts[i], d = { x: s.to.x - a.x, y: s.to.y - a.y }, t = Math.max(0, Math.min(1, ((point.x - a.x) * d.x + (point.y - a.y) * d.y) / (d.x ** 2 + d.y ** 2)));
        return distance(point, { x: a.x + d.x * t, y: a.y + d.y * t });
      }));
      expect(deviation).toBeLessThanOrEqual(.15 + 1e-10);
    }
    expect(compiled.length).toBeGreaterThan(80);
    const polygon = fitSharedRoute(closed(), [{ x: 10, y: 10 }, { x: 40, y: 10 }, { x: 40, y: 40 }], .15, false, true, field);
    expect(polygon.segments.at(-1)!.to).toEqual(polygon.start); expect(polygon.segments).toHaveLength(3);
    const loop = fitSharedRoute(closed(), [...stroke, stroke[0]], .15, false, false, field); expect(loop.segments.at(-1)!.to).toEqual(loop.start);
  });
  it('rejects invalid, tiny, unattached closed, excessive and out-of-field capture without mutating geometry', () => {
    const route = curve(), before = structuredClone(route);
    for (const stroke of [[], [{ x: 10, y: 10 }, { x: 10.001, y: 10 }], [{ x: 10, y: 10 }, { x: NaN, y: 10 }], [{ x: -.001, y: 10 }, { x: 20, y: 10 }], Array.from({ length: 2049 }, (_, i) => ({ x: 10 + i / 100, y: 10 }))]) expect(() => fitSharedRoute(route, stroke, .15, true, false, field)).toThrow();
    expect(() => fitSharedRoute(closed(), [{ x: 10, y: 10 }, { x: 40, y: 10 }], .15, true, false, field)).toThrow(/closer/);
    for (const tolerance of [0, NaN, 1.1]) expect(() => fitSharedRoute(route, [route.start, route.segments[0].to], tolerance, true, false, field)).toThrow();
    expect(route).toEqual(before);
  });
  it('enforces names, IDs, seam, bounds and segment/work limits on import', () => {
    for (const value of [null, [null], [{ ...line(), closed: 'yes' }], [{ ...line(), name: ' ' }], [{ ...line(), name: 'A\n' }], [line(), { ...line(), id: 'other' }], [{ ...line(), id: '__proto__' }], [{ ...closed(), start: { x: 12, y: 12 } }], [{ ...line(), segments: [] }], [{ ...line(), segments: Array(33).fill(line().segments[0]) }], [{ ...line(), start: { x: 101, y: 10 } }], [{ ...line(), segments: [{ ...line().segments[0], to: line().start }] }]]) expect(() => validateSharedRoutes(value, field)).toThrow(/shared route/);
    expect(validateSharedRoutes([], field)).toBeUndefined(); expect(validateSharedRoutes(undefined, field)).toBeUndefined();
    expect(newSharedRoute([line()], field).id).not.toBe(line().id);
  });
});

describe('reviewed route transactions and portable files', () => {
  it('guards revision/session/existence, applies one named undo, deletes and restores while preserving performer samples', () => {
    const project = createDemoProject(), store = createEditorStore(project), request = { routeId: 'r', existing: false, route: curve(), revision: 0, epoch: 0 };
    expect(store.dispatch('routes.save', request)).toBe(false); expect(store.dispatch('routes.open')).toBe(true);
    for (const patch of [{ revision: -1 }, { epoch: -1 }, { existing: true }]) expect(store.dispatch('routes.save', { ...request, ...patch })).toBe(false);
    expect(store.dispatch('routes.save', request)).toBe(true);
    const saved = store.getState().project.present; expect(saved.sharedRoutes).toEqual([curve()]);
    expect(store.getState().project.past).toHaveLength(1); expect(store.getState().project.past[0].name).toContain('Save shared route');
    for (const count of [0, 1, 8, 16, 50]) expect(sampleProject(saved, count)).toEqual(sampleProject(project, count));
    expect(saved.sets).toEqual(project.sets); expect(saved.moves).toEqual(project.moves);
    store.dispatch('history.undo'); expect(store.getState().project.present).toEqual(project);
    store.dispatch('history.redo'); expect(store.getState().project.present).toEqual(saved);
    store.dispatch('routes.open');
    expect(store.dispatch('routes.save', { ...request, existing: true, route: null, revision: store.getState().project.revision })).toBe(true);
    expect(store.getState().project.present.sharedRoutes).toBeUndefined(); store.dispatch('history.undo'); expect(store.getState().project.present).toEqual(saved);
  });
  it('round trips v8 and empty optional anchors in renderer and native codecs', () => {
    const project = { ...createDemoProject(), sharedRoutes: [closed()], audioAnchors: [] };
    const wire = serializeProject(project); expect(JSON.parse(wire).schemaVersion).toBe(8); expect(JSON.parse(wire).audioAnchors).toBeUndefined();
    const canonical = parseProject(wire); expect(validateProject(canonical)).toEqual(canonical);
    const native = createRequire(import.meta.url)('../electron/project-codec.cjs'); expect(native.parseProjectV2(wire)).toEqual(canonical);
    expect(native.serializeProjectV2(canonical)).toBe(wire);
    for (const schemaVersion of [1, 2, 3, 4, 5, 6, 7]) expect(() => parseProject(JSON.stringify({ ...JSON.parse(wire), schemaVersion }))).toThrow(/requires schema version 8/);
    expect(() => projectV2AsLegacy(canonical)).toThrow(/routes cannot be downgraded/);
  });
});
