import { describe, expect, it } from 'vitest';
import wire from '../format/examples/scheduled-v6.squid?raw';
import { analyzeTransition, countToSeconds, exportCoordinatesCsv, parseProject, performerMoveOutput, sampleProject, secondsToCount, serializeProject, validateProject } from './domain';
import { hasScheduledPaths, movementLength, movementSvg } from './movementPaths';
import { createPerformanceFixture } from './performanceFixtures';
import { TransitionAnalyzer } from './analysis/engine';
import { transitionInput } from './analysis/input';
import { projectV2AsLegacy } from './projectV2';
import type { PerformerPath } from './types';

describe('independent performer movement schedules', () => {
  it('samples every departure, arrival, explicit hold and implicit gap continuously for two independent performers', () => {
    const p = parseProject(wire);
    for (const count of [0, .25, 1.999, 2]) expect(sampleProject(p, count).positions.a).toEqual({ x: 10, y: 10 });
    expect(sampleProject(p, 4).positions).toEqual({ a: { x: 15, y: 17.5 }, b: { x: 20, y: 10 } });
    for (const count of [6, 6.001, 7, 7.999, 8]) expect(sampleProject(p, count).positions.a).toEqual({ x: 20, y: 25 });
    expect(sampleProject(p, 10).positions.a).toEqual({ x: 25, y: 31.875 });
    for (const count of [12, 12.001, 15.999, 16]) expect(sampleProject(p, count).positions.a).toEqual({ x: 30, y: 20 });
    expect(sampleProject(p, 9).positions.b).toEqual({ x: 30, y: 15 });
    for (const count of [14, 15, 16]) expect(sampleProject(p, count).positions.b).toEqual({ x: 40, y: 20 });
    for (const boundary of [2, 4, 6, 8, 12, 14, 16]) {
      const a = sampleProject(p, boundary - 1e-8), b = sampleProject(p, boundary + 1e-8);
      for (const id of ['a', 'b']) expect(Math.hypot(a.positions[id].x - b.positions[id].x, a.positions[id].y - b.positions[id].y)).toBeLessThan(1e-6);
    }
  });
  it('uses exact local counts at fractional boundaries without a count/progress round trip', () => {
    const p = parseProject(wire); p.moves[0].counts = 3; delete p.moves[0].paths.b;
    p.sets[0].positions.a = { x: 0, y: 0 }; p.sets[1].positions.a = { x: 50, y: 0 };
    p.moves[0].paths.a = { segments: [
      { id: 'first', kind: 'line', startCount: 0, endCount: .21, to: { x: 100, y: 0 } },
      { id: 'last', kind: 'line', startCount: .42, endCount: 2.5 },
    ] };
    expect(.21 / 3 * 3).not.toBe(.21);
    expect(sampleProject(p, .21).positions.a).toEqual({ x: 100, y: 0 });
    expect(sampleProject(p, .42).positions.a).toEqual({ x: 100, y: 0 });
  });
  it('applies easing within travel windows, and movement holds do not stop show time or other performers', () => {
    const p = parseProject(wire); p.moves[0].transition = 'ease';
    expect(sampleProject(p, 3).positions.a).toEqual({ x: 11.5625, y: 12.34375 });
    expect(sampleProject(p, 7).positions.a).toEqual({ x: 20, y: 25 });
    const linear = parseProject(wire);
    expect(countToSeconds(linear, 8) - countToSeconds(linear, 6)).toBe(1);
    expect(sampleProject(linear, 6).positions.a).toEqual(sampleProject(linear, 8).positions.a);
    expect(sampleProject(linear, 6).positions.b).not.toEqual(sampleProject(linear, 8).positions.b);
    // A musical fermata holds the entire show count and all geometry instead.
    expect(secondsToCount(linear, 2.75)).toBe(5); expect(secondsToCount(linear, 3.25)).toBe(5);
    expect(sampleProject(linear, secondsToCount(linear, 2.75))).toEqual(sampleProject(linear, secondsToCount(linear, 3.25)));
  });
  it('round-trips identities, fractional timing, waypoints and musical metadata in v6 without changing any sample', () => {
    const p = parseProject(wire); p.moves[0].paths.b.segments[0].startCount = 4.125;
    p.audioAnchors = [{ count: 8, seconds: 5 }];
    const encoded = serializeProject(p), reopened = parseProject(encoded);
    expect(JSON.parse(encoded).schemaVersion).toBe(6); expect(reopened).toEqual(p);
    for (const count of [0, .5, 2, 4.125, 6, 7, 8, 10.25, 12, 14, 16, 16.01, 24]) expect(sampleProject(reopened, count)).toEqual(sampleProject(p, count));
    for (const version of [2, 3, 4, 5]) {
      const old = { ...JSON.parse(encoded), schemaVersion: version, tempoMap: version === 2 ? undefined : p.tempoMap, audioAnchors: version < 4 ? undefined : p.audioAnchors };
      expect(() => parseProject(JSON.stringify(old))).toThrow(/schema version 6/);
    }
    expect(() => projectV2AsLegacy(p)).toThrow(/Timed paths/);
  });
  it('supports stationary schedules and zero-distance submoves without discarding a curved loop', () => {
    const p = parseProject(wire); p.sets[1].positions.a = { ...p.sets[0].positions.a };
    p.moves[0].paths.a = { segments: [{ id: 'held', kind: 'hold', startCount: 3, endCount: 8 }] };
    validateProject(p);
    for (const count of [0, 2, 3, 5, 8, 15, 16]) expect(sampleProject(p, count).positions.a).toEqual({ x: 10, y: 10 });
    expect(performerMoveOutput(p, 1, 'a').kind).toBe('hold');
    p.moves[0].paths.a = { segments: [
      { id: 'stationary', kind: 'line', startCount: 0, endCount: 2, to: { x: 10, y: 10 } },
      { id: 'loop', kind: 'cubic', startCount: 4, endCount: 12, control1: { x: 10, y: 20 }, control2: { x: 20, y: 20 } },
    ] };
    validateProject(p); expect(sampleProject(p, 1).positions.a).toEqual({ x: 10, y: 10 });
    expect(sampleProject(p, 8).positions.a).toEqual({ x: 13.75, y: 17.5 });
    expect(performerMoveOutput(p, 1, 'a').kind).toBe('move');
  });
  it('shares the complete endpoint chain with SVG and length/output, and refuses unsupported analysis', async () => {
    const p = parseProject(wire);
    const path: PerformerPath = { segments: [
      { id: 'a', kind: 'line', startCount: 2, endCount: 6, to: { x: 8, y: 0 } },
      { id: 'b', kind: 'hold', startCount: 6, endCount: 8 },
      { id: 'c', kind: 'cubic', startCount: 8, endCount: 12, control1: { x: 8, y: 8 }, control2: { x: 16, y: 8 } },
    ] };
    expect(movementLength({ x: 0, y: 0 }, { x: 16, y: 0 }, path)).toBeCloseTo(24, 3);
    expect(movementSvg({ x: 0, y: 0 }, { x: 16, y: 0 }, path)).toBe('M 0 0 L 8 0 C 8 8 16 8 16 0');
    expect(performerMoveOutput(p, 1, 'a').description).toMatch(/Hold 0–2; Travel 2–6; Hold 6–8; Curve 8–12; Hold 12–16/);
    expect(performerMoveOutput(p, 1, 'b').peakStepsPerFive).toBeNull();
    expect(exportCoordinatesCsv(p)).toContain('Timed path');
    const input = transitionInput(p, 1, 0)!;
    expect(input.tracks[0].path).toEqual(p.moves[0].paths.a);
    expect(() => analyzeTransition(p, 1)).toThrow(/has not been checked/);
    await expect(new TransitionAnalyzer().analyze(input)).rejects.toThrow(/has not been checked/);
  });
  it('rejects overlapping, unordered, empty, discontinuous and out-of-range intervals without canonicalizing intent away', () => {
    const mutations: ((path: PerformerPath) => void)[] = [
      path => { path.segments[1].startCount = 5; }, path => { path.segments[0].endCount = 2; },
      path => { path.segments[0].startCount = -.1; }, path => { path.segments[0].endCount = 17; },
      path => { path.segments[0].startCount = NaN; }, path => { path.segments[1].id = path.segments[0].id; },
      path => { const s = path.segments[0]; if (s.kind !== 'hold') delete s.to; },
      path => { const s = path.segments[2]; if (s.kind !== 'hold') s.to = { x: 30, y: 20 }; },
      path => { const s = path.segments[0]; if (s.kind !== 'hold') s.to = { x: 101, y: 1 }; },
      path => { path.segments = []; },
      path => { path.segments = [{ id: 'h', kind: 'hold', startCount: 0, endCount: 16 }]; },
      path => { path.segments = Array.from({ length: 33 }, (_, i) => ({ id: `s-${i}`, kind: 'hold', startCount: i / 3, endCount: (i + 1) / 3 })); },
    ];
    for (const mutate of mutations) {
      const p = parseProject(wire); mutate(p.moves[0].paths.a); expect(() => validateProject(p)).toThrow(/Invalid project/);
    }
  });
  it('round-trips the maximum production with 32 intervals for each of 500 performers in one move', () => {
    const p = createPerformanceFixture('maximum'), move = p.moves[0]; move.counts = 32;
    move.paths = Object.fromEntries(p.performers.map(person => [person.id, { segments: Array.from({ length: 32 }, (_, i) => i % 2
      ? { id: `hold-${i}`, kind: 'hold' as const, startCount: i, endCount: i + 1 }
      : { id: `travel-${i}`, kind: 'line' as const, startCount: i, endCount: i + 1, ...(i < 30 ? { to: { x: 20 + i, y: 20 } } : {}) }) }]));
    const reopened = parseProject(serializeProject(p)); expect(hasScheduledPaths(reopened.moves[0])).toBe(true);
    for (const count of [0, .5, 1, 1.5, 2, 15.5, 30.5, 31, 31.5, 32]) expect(sampleProject(reopened, count)).toEqual(sampleProject(p, count));
  });
});
