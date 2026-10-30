import { describe, expect, it } from 'vitest';
import { movementLength, movementSvg, sampleMovement } from './movementPaths';
import { analyzeTransition, createDemoProject, exportCoordinatesCsv, parseProject, performerMoveOutput, sampleProject, serializeProject, setStartCount, validateProject } from './domain';
import { projectV2AsLegacy } from './projectV2';
import { neighborOverlays } from './neighborPaths';
import { createPerformanceFixture } from './performanceFixtures';
import { TransitionAnalyzer } from './analysis/engine';
import { transitionInput } from './analysis/input';
import type { PerformerPath } from './types';

const from = { x: 0, y: 0 }, to = { x: 8, y: 0 };
const path: PerformerPath = { segments: [{ id: 'curve', kind: 'cubic', startCount: 0, endCount: 16, control1: { x: 0, y: 8 }, control2: { x: 8, y: 8 } }] };
const fixture = () => {
  const p = createDemoProject(), id = p.performers[0].id;
  p.moves[0] = { ...p.moves[0], counts: 16, transition: 'linear', paths: { [id]: path } };
  p.sets[0].positions[id] = from; p.sets[1].positions[id] = to;
  return { p, id };
};

describe('shared cubic performer travel', () => {
  it('agrees with analytic cubic positions, clamps boundaries and applies easing exactly once', () => {
    expect(sampleMovement(from, to, path, .25)).toEqual({ x: 1.25, y: 4.5 });
    expect(sampleMovement(from, to, path, .5)).toEqual({ x: 4, y: 6 });
    expect(sampleMovement(from, to, path, -1)).toEqual(from);
    expect(sampleMovement(from, to, path, 2)).toEqual(to);
    expect(sampleMovement(from, to, path, NaN)).toEqual(from);
    expect(sampleMovement(from, to, path, .25, 'ease')).toEqual(sampleMovement(from, to, path, .15625));
    expect(movementSvg(from, to, path)).toBe('M 0 0 C 0 8 8 8 8 0');
    // This cubic has analytic length 16 (the standard symmetric arch).
    expect(movementLength(from, to, path)).toBeCloseTo(16, 3);
  });
  it('handles a line-equivalent cubic, stationary curve and a loop without mistaking matching endpoints for a hold', () => {
    const line: PerformerPath = { segments: [{ ...path.segments[0], kind: 'cubic', control1: { x: 8 / 3, y: 0 }, control2: { x: 16 / 3, y: 0 } }] };
    for (const t of [0, .001, .25, .5, .9, 1]) {
      expect(sampleMovement(from, to, line, t).x).toBeCloseTo(8 * t, 12);
      expect(sampleMovement(from, to, undefined, t).x).toBe(8 * t);
    }
    const stationary: PerformerPath = { segments: [{ ...path.segments[0], kind: 'cubic', control1: from, control2: from }] };
    expect(movementLength(from, from, stationary)).toBe(0);
    expect(sampleMovement(from, from, stationary, .5)).toEqual(from);
    expect(movementLength(from, from, path)).toBeGreaterThan(8);
    const { p, id } = fixture(); p.sets[1].positions[id] = from;
    expect(performerMoveOutput(p, 1, id).kind).toBe('move');
  });
  it('round-trips curves with stable identities and exact samples through v5, preserving tempo maps and audio anchors', () => {
    const { p, id } = fixture();
    p.tempoMap = { version: 1, regions: [], holds: [{ count: 4, seconds: 1 }] };
    p.audioAnchors = [{ count: 8, seconds: 5 }];
    const wire = serializeProject(p), reopened = parseProject(wire);
    expect(JSON.parse(wire).schemaVersion).toBe(5);
    expect(reopened).toEqual(p);
    for (const count of [0, .25, 4, 8, 15.999, 16, 16.001]) expect(sampleProject(reopened, count)).toEqual(sampleProject(p, count));
    expect(sampleProject(reopened, 8).positions[id]).toEqual({ x: 4, y: 6 });
    expect(sampleProject(reopened, 16).positions[id]).toEqual(to);
    expect(() => projectV2AsLegacy(p)).toThrow(/Curved paths/);
    for (const version of [2, 3, 4]) expect(() => parseProject(JSON.stringify({ ...JSON.parse(wire), tempoMap: version === 2 ? undefined : p.tempoMap, audioAnchors: version === 4 ? p.audioAnchors : undefined, schemaVersion: version }))).toThrow(/schema version 5/);
  });
  it('uses curved length and geometry in coordinates and neighbor overlays without publishing a straight-line peak or false clearance', async () => {
    const { p, id } = fixture();
    const output = performerMoveOutput(p, 1, id);
    expect(output.distanceYards).toBeCloseTo(16, 3);
    expect(output.averageStepsPerFive).toBeCloseTo(5, 3);
    expect(output.peakStepsPerFive).toBeNull();
    expect(exportCoordinatesCsv(p)).toContain('Curved path');
    expect(neighborOverlays(p, 1, { previous: true, next: false, selectedIds: [id], sectionFilter: 'all', preview: false })[0].paths[0].svg).toBe(movementSvg(from, to, path));
    expect(() => analyzeTransition(p, 1)).toThrow(/has not been checked/);
    await expect(new TransitionAnalyzer().analyze(transitionInput(p, 1, 0)!)).rejects.toThrow(/has not been checked/);
  });
  it('rejects malformed controls, unsupported partitions and out-of-field geometry before saving', () => {
    const { p, id } = fixture();
    for (const point of [{ x: NaN, y: 1 }, { x: Infinity, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 54 }]) {
      const bad = structuredClone(p); const s = bad.moves[0].paths[id].segments[0];
      if (s.kind === 'cubic') s.control1 = point;
      expect(() => validateProject(bad)).toThrow(/control1/);
    }
    const bad = structuredClone(p); bad.moves[0].paths[id].segments.push(path.segments[0]);
    expect(() => validateProject(bad)).toThrow(/one full-move/);
  });
  it('samples a maximum roster across all 128 sets with bounded finite geometry', () => {
    const p = createPerformanceFixture('maximum');
    p.moves = p.moves.map(move => ({ ...move, paths: Object.fromEntries(p.performers.map(person => [person.id, { segments: [{ ...path.segments[0], endCount: move.counts }] }])) }));
    for (let index = 0; index < p.moves.length; index++) {
      const sample = sampleProject(p, setStartCount(p, index) + p.moves[index].counts * .37);
      expect(Object.keys(sample.positions)).toHaveLength(500);
      for (const point of Object.values(sample.positions)) {
        expect(point.x).toBeGreaterThanOrEqual(0); expect(point.x).toBeLessThanOrEqual(100);
        expect(point.y).toBeGreaterThanOrEqual(0); expect(point.y).toBeLessThanOrEqual(p.field.height);
      }
    }
  });
});
