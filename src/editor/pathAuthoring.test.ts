import { describe, expect, it } from 'vitest';
import { createDemoProject, parseProject, serializeProject, validateProject } from '../domain';
import { sampleMovement } from '../movementPaths';
import { createEditorStore } from './store';
import { drawTravel, simplifyStroke, travelHandles, moveTravelHandle, travelTicks, DRAW_LIMIT } from './pathAuthoring';
import { editMovementSchedule, newScheduleRow, pathFromRows } from './movementScheduleEditing';
import type { Point } from '../types';

const from = { x: 10, y: 10 }, to = { x: 30, y: 20 };
const stroke = [from, { x: 15, y: 25 }, { x: 25, y: 5 }, to];
const row = () => ({ ...newScheduleRow(from, to, 16, '4'), id: 'travel' });

// Independent segment distance oracle for both directions of polyline deviation.
function segmentDistance(p: Point, a: Point, b: Point) {
  const vx = b.x - a.x, vy = b.y - a.y, squared = vx * vx + vy * vy;
  const u = squared ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / squared)) : 0;
  return Math.hypot(p.x - a.x - u * vx, p.y - a.y - u * vy);
}
function polyDistance(p: Point, points: Point[]) { return Math.min(...points.slice(1).map((q, i) => segmentDistance(p, points[i], q))); }

describe('field-space drawn travel', () => {
  it('preserves an S stroke, corners and endpoints, retaining holds and outside intervals', () => {
    const hold = { ...row(), id: 'hold', kind: 'hold' as const, start: '0', end: '4' };
    const trailing = { ...hold, id: 'trailing', start: '16', end: '32' };
    const input = [hold, row(), trailing], before = structuredClone(input);
    const fitted = drawTravel(input, 'travel', from, to, stroke, .15, true), path = pathFromRows(fitted)!;
    expect(input).toEqual(before);
    expect(fitted[0]).toBe(hold); expect(fitted.at(-1)).toBe(trailing);
    expect(path.segments[1].id).toBe('travel'); expect(new Set(path.segments.map(s => s.id)).size).toBe(path.segments.length);
    expect(path.segments[1].startCount).toBe(4); expect(path.segments.at(-2)?.endCount).toBe(16);
    expect(path.segments.at(-2)).not.toHaveProperty('to');
    for (const s of path.segments.filter(s => s.kind !== 'hold')) {
      const midpoint = sampleMovement(from, to, path, (s.startCount + s.endCount) / 2, 32);
      expect(polyDistance(midpoint, stroke)).toBeLessThan(1e-9);
    }
    expect(sampleMovement(from, to, path, 2, 32)).toEqual(from);
    expect(sampleMovement(from, to, path, 20, 32)).toEqual(to);
  });
  it('bounds deviation for noisy capture and endpoint attachment using an independent oracle', () => {
    const noisy = Array.from({ length: 600 }, (_, i) => ({ x: 10 + 20 * i / 599, y: 15 + 6 * Math.sin(i * Math.PI * 2 / 599) + .02 * Math.sin(i * 13) }));
    const tolerance = .15, a = { x: 10, y: 15.02 }, b = { x: 30, y: 15.02 };
    const fitted = drawTravel([row()], 'travel', a, b, noisy, tolerance, true), path = pathFromRows(fitted)!;
    const samples = Array.from({ length: 2001 }, (_, i) => sampleMovement(a, b, path, 4 + 12 * i / 2000, 16));
    for (const p of samples) expect(polyDistance(p, noisy)).toBeLessThanOrEqual(tolerance + .001);
    for (const p of noisy) expect(polyDistance(p, [a, ...fitted.map(r => ({ x: +r.x, y: +r.y }))])).toBeLessThanOrEqual(tolerance + .001);
    expect(simplifyStroke(noisy, .15)).toEqual(simplifyStroke(structuredClone(noisy), .15));
  });
  it('retains self-crossings and closed individual loops without claiming a safe route', () => {
    const cross = [from, { x: 30, y: 30 }, { x: 10, y: 30 }, { x: 30, y: 10 }, from];
    const fitted = drawTravel([row()], 'travel', from, from, cross, .1, false);
    expect(fitted).toHaveLength(4); expect(fitted.at(-1)?.x).toBe('10');
    expect(fitted.every(r => r.kind === 'line')).toBe(true);
  });
  it('rejects tiny, excessive, nonfinite, unattached, overly complex and unrepresentable strokes atomically', () => {
    const original = [row()], before = structuredClone(original);
    expect(() => simplifyStroke([from, from])).toThrow(/0.01/);
    expect(() => simplifyStroke(Array(DRAW_LIMIT + 1).fill(from))).toThrow(/2048/);
    expect(() => simplifyStroke([from, { x: NaN, y: 0 }])).toThrow(/finite/);
    expect(() => simplifyStroke(stroke, 0)).toThrow(/tolerance/);
    expect(() => drawTravel(original, 'travel', from, to, [...stroke].reverse(), .15, true)).toThrow(/fixed interval/);
    expect(() => drawTravel([{ ...row(), kind: 'hold' }], 'travel', from, to, stroke, .15, true)).toThrow(/Holds/);
    const noisy = Array.from({ length: 100 }, (_, i) => ({ x: i, y: i % 2 * 10 }));
    expect(() => simplifyStroke(noisy, .1)).toThrow(/32/);
    const full = Array.from({ length: 31 }, (_, i) => ({ ...row(), id: String(i), kind: 'hold' as const }));
    expect(() => drawTravel([...full, row()], 'travel', from, to, stroke, .1, true)).toThrow(/32/);
    expect(() => drawTravel([{ ...row(), start: '1', end: String(1 + Number.EPSILON) }], 'travel', from, to, stroke, .1, true)).toThrow(/representable/);
    expect(original).toEqual(before);
  });
  it('updates only the selected control/arrival and produces playback count ticks for holds and easing', () => {
    const fitted = drawTravel([row()], 'travel', from, to, stroke, .1, true), path = pathFromRows(fitted)!;
    const handles = travelHandles(from, to, path), target = handles[0];
    const changed = moveTravelHandle(fitted, target, { x: 12.5, y: 18.75 });
    expect(changed.slice(1)).toEqual(fitted.slice(1));
    expect(changed[0].c1x).toBe('12.5'); expect(changed[0].c1y).toBe('18.75');
    expect(handles.filter(h => h.kind === 'arrival')).toHaveLength(2);
    expect(handles.some(h => h.point === to)).toBe(false);
    for (const transition of ['linear', 'ease'] as const) {
      const ticks = travelTicks(from, to, path, 32, transition);
      expect(ticks.length).toBeLessThanOrEqual(97);
      expect(ticks.map(t => t.count)).toEqual(expect.arrayContaining(path.segments.flatMap(s => [s.startCount, s.endCount])));
      for (const tick of ticks) expect(tick.point).toEqual(sampleMovement(from, to, path, tick.count, 32, transition));
    }
  });
  it('uses the existing validated command for one undo, stale/selection guards and native reload', () => {
    const project = createDemoProject(), id = project.performers[0].id;
    project.sets[0].positions[id] = from; project.sets[1].positions[id] = to;
    const store = createEditorStore(project);
    expect(store.dispatch('path.draw-open')).toBe(false);
    store.dispatch('set.select', { index: 1 }); store.setValue('selection', 'selectedIds', [id]);
    expect(store.dispatch('path.draw-open')).toBe(true);
    const path = pathFromRows(drawTravel([{ ...row(), start: '0', end: String(project.moves[0].counts) }], 'travel', from, to, stroke, .15, true));
    const request = { moveId: project.moves[0].id, performerId: id, path, revision: store.getState().project.revision, epoch: store.getState().ui.projectEpoch };
    const candidate = editMovementSchedule(project, request); validateProject(candidate);
    expect(store.dispatch('schedule.save', { ...request, revision: -1 })).toBe(false);
    expect(store.dispatch('schedule.save', request)).toBe(true);
    expect(store.getState().project.present).toEqual(candidate);
    expect(store.getState().project.past).toHaveLength(1);
    expect(parseProject(serializeProject(candidate))).toEqual(candidate);
    store.dispatch('history.undo'); expect(store.getState().project.present).toEqual(project);
    store.dispatch('history.redo'); expect(store.getState().project.present).toEqual(candidate);
  });
});
