import { describe, expect, it } from 'vitest';
import { defaultFormationOptions, fitFormationOptions, generateFormation } from './formationGeometry';
import { previewFormation } from './formationPreview';
import type { FormationKind, FormationOptions, Point } from './types';

const field = { width: 100, height: 160/3, preset: 'college' as const };
const kinds: FormationKind[] = ['line','arc','circle','block','curve'];
const preferred = { width: 45, height: 22, rotation: 0, columns: 8 };
const inside = (kind: FormationKind, count: number, o: FormationOptions) => [...generateFormation(kind, count, o), o.center].every(p => p.x >= -1e-8 && p.y >= -1e-8 && p.x <= field.width + 1e-8 && p.y <= field.height + 1e-8);
const nearestGap = (points: Point[]) => Math.min(...points.flatMap((a, i) => points.slice(i + 1).map(b => Math.hypot(a.x - b.x, a.y - b.y))));
const selection = (points: Point[]) => { const ids = points.map((_, i) => 'p' + String(i).padStart(3, '0')); return { ids, positions: Object.fromEntries(ids.map((id, i) => [id, points[i]])) }; };
const grid = (columns: number, rows: number, x0: number, y0: number, dx: number, dy: number) => Array.from({ length: columns * rows }, (_, i) => ({ x: x0 + (i % columns) * dx, y: y0 + Math.floor(i / columns) * dy }));
const edges: Point[] = [{ x: 1, y: 26 }, { x: 99, y: 26 }, { x: 50, y: 1 }, { x: 50, y: 52 }, { x: 2, y: 2 }, { x: 98, y: 51 }];

describe('fitting seeded formation parameters to the field', () => {
  it.each(kinds)('%s translates inside every sideline and end line without scaling a shape that fits', kind => {
    for (const center of edges) for (const rotation of [0, 30, 90]) {
      const o: FormationOptions = { ...preferred, rotation, center };
      const fitted = fitFormationOptions(kind, 24, o, field);
      expect(inside(kind, 24, fitted)).toBe(true);
      expect(fitted).toMatchObject({ width: 45, height: 22, rotation, columns: 8 });
      const { ids, positions } = selection(grid(8, 3, 30, 20, 2, 2));
      expect(previewFormation(positions, ids, kind, fitted, field).error).toBeNull();
    }
    const centered: FormationOptions = { ...preferred, center: { x: 50, y: 26 } };
    expect(fitFormationOptions(kind, 24, centered, field)).toEqual(centered);
  });
  it.each(kinds)('%s scales an oversized seed about its center, keeping its proportions', kind => {
    const o: FormationOptions = { ...preferred, width: 180, height: 90, rotation: 20, center: { x: 10, y: 10 } };
    const fitted = fitFormationOptions(kind, 24, o, field);
    expect(inside(kind, 24, fitted)).toBe(true);
    expect(fitted.width).toBeLessThan(180); expect(fitted.height / fitted.width).toBeCloseTo(.5, 12);
    const margin = fitFormationOptions(kind, 24, o, field, .625);
    expect([...generateFormation(kind, 24, margin), margin.center].every(p => p.x >= .625 - 1e-8 && p.x <= 99.375 + 1e-8 && p.y >= .625 - 1e-8 && p.y <= field.height - .625 + 1e-8)).toBe(true);
  });
});

describe('default formation parameters', () => {
  it('sizes new shapes from the selection footprint in the shape’s rotated frame', () => {
    const { ids, positions } = selection(grid(8, 1, 30, 20, 4, 0));
    expect(defaultFormationOptions('line', positions, ids, preferred, field, 1)).toMatchObject({ width: 28, center: { x: 44, y: 20 }, rotation: 0, columns: 8 });
    expect(defaultFormationOptions('arc', positions, ids, preferred, field, 1)).toMatchObject({ width: 28, height: 7 });
    expect(defaultFormationOptions('block', positions, ids, preferred, field, 1).height).toBeCloseTo(28 * 22 / 45, 12);
    const brass = selection(grid(8, 3, 22, 12 + 2 / 3, 8, 4));
    expect(defaultFormationOptions('arc', brass.positions, brass.ids, preferred, field, 1)).toMatchObject({ width: 56, height: 14 });
    expect(defaultFormationOptions('circle', brass.positions, brass.ids, preferred, field, 1)).toMatchObject({ width: 56, height: 14 });
    expect(defaultFormationOptions('block', brass.positions, brass.ids, preferred, field, 1)).toMatchObject({ width: 56, height: 8 });
    const column = selection(grid(1, 8, 40, 10, 0, 4));
    expect(defaultFormationOptions('line', column.positions, column.ids, preferred, field, 1).width).toBeCloseTo(28, 12);
    const turned = defaultFormationOptions('arc', column.positions, column.ids, { ...preferred, rotation: 90 }, field, 1);
    expect(turned.width).toBeCloseTo(28, 12); expect(turned.height).toBeCloseTo(7, 12); expect(turned.rotation).toBe(90);
  });
  it.each(kinds)('%s keeps the preference size for a selection without extent', kind => {
    const single = selection([{ x: 50, y: 26 }]), stacked = selection([{ x: 50, y: 26 }, { x: 50, y: 26 }, { x: 50, y: 26 }]);
    expect(defaultFormationOptions(kind, single.positions, single.ids, preferred, field, 1)).toEqual({ ...preferred, center: { x: 50, y: 26 } });
    expect(defaultFormationOptions(kind, stacked.positions, stacked.ids, preferred, field, 1)).toEqual({ ...preferred, center: { x: 50, y: 26 } });
  });
  it.each(kinds)('%s spreads a crowded selection to the project minimum spacing', kind => {
    const crowded = selection(grid(6, 4, 48, 25, .5, .5));
    for (const spacing of [1, 2]) {
      const o = defaultFormationOptions(kind, crowded.positions, crowded.ids, preferred, field, spacing);
      expect(nearestGap(generateFormation(kind, 24, o))).toBeCloseTo(spacing, 9);
      expect(inside(kind, 24, o)).toBe(true);
    }
  });
  it.each(kinds)('%s opens inside the field for selections against each sideline and end line', kind => {
    const selections = [grid(8, 3, 22, 0, 8, 1.5), grid(8, 3, 22, field.height - 3, 8, 1.5), grid(3, 8, 0, 10, 1.5, 4), grid(3, 8, 97, 10, 1.5, 4), grid(6, 4, 0, 0, 1, 1), grid(6, 4, 95, field.height - 3, 1, 1)];
    for (const points of selections) for (const rotation of [0, 45]) {
      const { ids, positions } = selection(points);
      const o = defaultFormationOptions(kind, positions, ids, { ...preferred, rotation }, field, 1);
      expect(inside(kind, ids.length, o)).toBe(true);
      expect(previewFormation(positions, ids, kind, o, field).error).toBeNull();
    }
  });
  it('fit wins over spacing for selections larger than the field at minimum spacing', () => {
    const { ids, positions } = selection(Array.from({ length: 500 }, (_, i) => ({ x: 10 + 80 * i / 499, y: 25 })));
    for (const kind of kinds) {
      const o = defaultFormationOptions(kind, positions, ids, preferred, field, 1);
      expect(inside(kind, 500, o)).toBe(true); expect(previewFormation(positions, ids, kind, o, field).error).toBeNull();
    }
  });
});
