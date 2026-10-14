import { describe, expect, it } from 'vitest';
import { defaultPreferences, validatePreferences } from './preferences';
import { analyzeTransition, coordinateDescription, createDemoProject, serializeProject } from './domain';
describe('personal preferences codec', () => {
  it('fills older records and discards project and transient fields', () => {
    expect(validatePreferences({ version: 0, showLabels: false, zoom: 2, count: 8, positions: { p: { x: 1 } }, grid: { spacing: 2 } })).toEqual({ ...defaultPreferences(), showLabels: false, zoom: 2 });
    expect(validatePreferences({ paperSize: 'a4' }).version).toBe(1);
  });
  it('rejects unsupported versions, malformed values and excessive records', () => {
    for (const input of [null, [], 'text', { version: 2 }, { zoom: NaN }, { nudgeStep: 0 }, { showGrid: 'false' }, { coordinateDecimals: 3 }, { formationColumns: 2.5 }, { paperSize: 'legal' }, Object.fromEntries(Array.from({ length: 65 }, (_, i) => [i, true]))]) expect(() => validatePreferences(input)).toThrow();
    expect(validatePreferences({ ...defaultPreferences(), zoom: 3, nudgeStep: .125, fastNudgeStep: 10, formationRotation: -180 })).toMatchObject({ zoom: 3, nudgeStep: .125 });
  });
  it('changes descriptive precision and review thresholds without changing production geometry', () => {
    const project = createDemoProject(); const original = serializeProject(project);
    const point = { x: 21.123, y: 2.123 };
    expect(coordinateDescription(point, project.field, 0)).toContain('2 steps');
    expect(coordinateDescription(point, project.field, 2)).toContain('1.8 steps');
    expect(analyzeTransition(project, 1, { minimumSpacing: 5, maximumStride: .1 }).length).toBeGreaterThan(analyzeTransition(project, 1).length);
    expect(() => analyzeTransition(project, 1, { minimumSpacing: 0 })).toThrow();
    expect(serializeProject(project)).toBe(original);
  });
});

