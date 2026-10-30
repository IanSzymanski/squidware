import { describe, expect, it } from 'vitest';
import { createDemoProject, parseProject, serializeProject } from '../domain';
import { previewFormation } from '../formationPreview';
import { createEditorStore } from '../editor/store';
import { captureFormationSnapshot, captureParametricFormation, previewFormationTemplate } from './formations';
import { parseTemplateLibrary, serializeTemplateLibrary } from './library';
import type { FormationTemplate } from './library';
import type { FormationKind, FormationOptions, Point } from '../types';

const field = { width: 100, height: 160 / 3, preset: 'college' as const };
const options: FormationOptions = { center: { x: 50, y: 25 }, width: 20, height: 10, rotation: 0, columns: 4, assignment: 'position' };
const placement = { center: options.center, rotation: 0, assignment: 'position' as const };
const positions = { a: { x: 40, y: 20 }, b: { x: 60, y: 20 }, other: { x: 80, y: 40 } };
const snapshot: FormationTemplate = { kind: 'formation', name: 'Saved dots', sourceCount: 2, coordinateFrame: 'yards-relative-center', geometry: { kind: 'snapshot', points: [{ x: -10, y: 0 }, { x: 10, y: 0 }] } };

describe('formation library previews', () => {
  it.each<FormationKind>(['line', 'arc', 'circle', 'block', 'curve'])('uses shared %s generation and assignment for different member counts', shape => {
    const template = captureParametricFormation('Reusable form', shape, options, 64);
    for (const count of [1, 2, 64, 500]) {
      const ids = Array.from({ length: count }, (_, i) => `p${i}`);
      const source = Object.fromEntries(ids.map(id => [id, { x: 50, y: 25 }]));
      expect(previewFormationTemplate(template, source, ids, field, placement)).toEqual(previewFormation(source, ids, shape, options, field));
    }
  });
  it('captures only selected snapshot geometry and round-trips it independently of roster order', () => {
    const project = createDemoProject(), before = structuredClone(project);
    const ids = project.performers.slice(0, 8).map(p => p.id);
    const captured = captureFormationSnapshot(project, 0, ids, 'Saved shape');
    expect(captured).toEqual(captureFormationSnapshot(project, 0, [...ids].reverse(), 'Saved shape'));
    expect(project).toEqual(before);
    const encoded = serializeTemplateLibrary({ format: 'squidware-template-library', version: 1, entries: [captured] });
    for (const id of [project.id, ...ids]) expect(encoded).not.toContain(id);
    expect(parseTemplateLibrary(encoded).entries[0]).toEqual(captured);
    const current = project.sets[0].positions;
    const center = ids.reduce((sum, id) => ({ x: sum.x + current[id].x / ids.length, y: sum.y + current[id].y / ids.length }), { x: 0, y: 0 });
    const result = previewFormationTemplate(captured, current, ids, field, { ...placement, center });
    expect(result.error).toBeNull();
    const sort = (points: Point[]) => points.sort((a, b) => a.x - b.x || a.y - b.y);
    sort(Object.values(result.updates)).forEach((point, i) => {
      const original = sort(ids.map(id => current[id]))[i];
      expect(point.x).toBeCloseTo(original.x, 8); expect(point.y).toBeCloseTo(original.y, 8);
    });
  });
  it('preserves identities and unrelated positions, with positional order and explicit roster fallback', () => {
    const reversed = ['b', 'a'];
    const positional = previewFormationTemplate(snapshot, positions, reversed, field, placement);
    expect(positional.updates).toEqual({ a: { x: 40, y: 25 }, b: { x: 60, y: 25 } });
    expect(positional.positions.other).toBe(positions.other);
    expect(previewFormationTemplate(snapshot, positions, reversed, field, { ...placement, assignment: 'roster' }).updates).toEqual({ b: { x: 40, y: 25 }, a: { x: 60, y: 25 } });
    expect(previewFormationTemplate(snapshot, positions, ['a', 'b'], field, { ...placement, rotation: 90 }).updates.a.x).toBeCloseTo(50);
    expect(positions.a).toEqual({ x: 40, y: 20 });
  });
  it('reports count mismatches, invalid selections and placement without partial updates', () => {
    for (const ids of [[], ['a'], ['a', 'a'], ['a', 'missing']]) {
      const result = previewFormationTemplate(snapshot, positions, ids, field, placement);
      expect(result.error).toBeTruthy(); expect(result.updates).toEqual({}); expect(result.positions).toBe(positions);
    }
    expect(previewFormationTemplate(snapshot, positions, ['a'], field, placement).error).toMatch(/exactly 2/);
    for (const patch of [{ rotation: NaN }, { rotation: 3601 }, { center: { x: -1, y: 20 } }, { assignment: 'invalid' as 'position' }]) expect(previewFormationTemplate(snapshot, positions, ['a', 'b'], field, { ...placement, ...patch }).error).toBeTruthy();
    expect(previewFormationTemplate(snapshot, { ...positions, a: { x: Infinity, y: 0 } }, ['a', 'b'], field, placement).error).toMatch(/finite/);
  });
  it('keeps boundary-crossing geometry visible without fitting or clamping the saved shape', () => {
    const result = previewFormationTemplate(snapshot, positions, ['a', 'b'], field, { ...placement, center: { x: 2, y: 20 } });
    expect(result.error).toMatch(/boundary/); expect(result.updates.a).toEqual({ x: -8, y: 20 }); expect(result.updates.b).toEqual({ x: 12, y: 20 });
    const atEdge = previewFormationTemplate(snapshot, positions, ['a', 'b'], field, { ...placement, center: { x: 10, y: 20 } });
    expect(atEdge.error).toBeNull(); expect(atEdge.updates.a).toEqual({ x: 0, y: 20 });
  });
  it('rejects invalid snapshot capture and untrusted nonfinite/oversized snapshot geometry', () => {
    const project = createDemoProject(), id = project.performers[0].id;
    for (const ids of [[], [id, id], ['missing']]) expect(() => captureFormationSnapshot(project, 0, ids, 'Saved')).toThrow(/Select/);
    expect(() => captureFormationSnapshot(project, .5, [id], 'Saved')).toThrow(/existing set/);
    for (const x of [NaN, Infinity, 101]) {
      const input = { ...snapshot, geometry: { kind: 'snapshot' as const, points: [{ x, y: 0 }, { x: 0, y: 0 }] } };
      expect(previewFormationTemplate(input, positions, ['a', 'b'], field, placement).error).toMatch(/finite/);
    }
  });
  it('does not change history while previewing and produces updates compatible with undo, redo and reload', () => {
    const store = createEditorStore(createDemoProject()), before = store.getState().project;
    const source = before.present;
    const ids = source.performers.slice(0, 8).map(p => p.id);
    const template = captureParametricFormation('Line', 'line', options, 64);
    const preview = previewFormationTemplate(template, source.sets[0].positions, ids, field, placement);
    expect(preview.error).toBeNull(); expect(store.getState().project).toBe(before);
    // Discarding this pure result is Cancel; a future UI command owns session guards/name.
    expect(store.dispatch('positions.move', { index: 0, updates: preview.updates })).toBe(true);
    const applied = store.getState().project.present;
    expect(store.getState().project.past).toHaveLength(1);
    expect(applied.performers).toEqual(source.performers);
    expect(applied.sets[0].positions[ids[0]]).toEqual(preview.updates[ids[0]]);
    expect(applied.sets[0].positions[source.performers[8].id]).toEqual(source.sets[0].positions[source.performers[8].id]);
    expect(parseProject(serializeProject(applied))).toEqual(applied);
    store.dispatch('history.undo'); expect(store.getState().project.present).toEqual(source);
    store.dispatch('history.redo'); expect(store.getState().project.present).toEqual(applied);
  });
});
