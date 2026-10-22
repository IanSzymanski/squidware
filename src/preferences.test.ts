import { describe, expect, it } from 'vitest';
import { defaultPreferences, validatePreferences } from './preferences';
import { analyzeTransition, coordinateDescription, createDemoProject, parseProject, serializeProject } from './domain';
describe('personal preferences codec', () => {
  it('migrates and bounds the integer default for new move counts', () => {
    expect(validatePreferences({ version: 1 }).newSetCounts).toBe(32);
    for (const counts of [1, 1024]) expect(validatePreferences({ newSetCounts: counts }).newSetCounts).toBe(counts);
    for (const counts of [0, 1025, 1.5, '32', null, Infinity]) expect(() => validatePreferences({ newSetCounts: counts })).toThrow();
  });
  it('migrates appearance defaults and rejects unsafe or unsupported scales', () => {
    expect(validatePreferences({ version: 1 })).toMatchObject({ theme: 'dark', uiScale: 1 });
    for (const theme of ['dark', 'light', 'high-contrast']) for (const uiScale of [1, 1.1, 1.25, 1.5]) {
      expect(validatePreferences({ theme, uiScale })).toMatchObject({ theme, uiScale });
    }
    for (const value of [{ theme: 'system' }, { uiScale: 0 }, { uiScale: 1.2 }, { uiScale: '1.25' }, { uiScale: Infinity }]) expect(() => validatePreferences(value)).toThrow();
  });
  it('validates display preferences with safe readable defaults for older files', () => {
    expect(validatePreferences({ version: 1 })).toMatchObject({ fieldDotRadiusPx: 3, fieldLabelSizePx: 12, fieldOrientation: 'audience-bottom', fieldColorMode: 'section', selectionLabelsOnly: false });
    const settings = { fieldOrientation: 'audience-top', fieldDotRadiusPx: 8, fieldLabelSizePx: 24, fieldColorMode: 'custom', fieldCustomColor: '#eEbB22', selectionLabelsOnly: true };
    expect(validatePreferences(settings)).toMatchObject(settings);
    for (const input of [{ fieldDotRadiusPx: 0 }, { fieldLabelSizePx: 10 }, { fieldLabelSizePx: Infinity }, { fieldOrientation: 'mirror' }, { fieldColorMode: 'unknown' }, { fieldCustomColor: 'red' }, { fieldCustomColor: '#abcdef00' }, { fieldCustomColor: null }]) expect(() => validatePreferences(input)).toThrow();
  });
  it('uses gold for new Brass sections and preserves custom and legacy colors on reopen', () => {
    const project = createDemoProject();
    expect(project.sections[0].color).toBe('#f0bf62');
    for (const color of ['#c3e889', '#00ffcc', '#123456']) {
      project.sections[0].color = color;
      expect(parseProject(serializeProject(project)).sections[0].color).toBe(color);
    }
  });
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

