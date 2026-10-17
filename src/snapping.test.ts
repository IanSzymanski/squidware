import { describe, expect, it } from 'vitest';
import { DEFAULT_SNAPPING, moveSelection, validateSnapSettings } from './snapping';
import type { SnapSettings } from './snapping';
import { fieldDirection, fieldViewPoint } from './components/fieldOrientation';

const field = { width: 100, height: 160 / 3, preset: 'college' as const };
const originals = { a: { x: 10.1, y: 20.2 }, b: { x: 12.7, y: 21.1 } };
describe('placement grids and group snapping', () => {
  it.each([
    [8, 1, 10, 20], [8, 2, 10.3125, 20], [8, 4, 10.3125, 20.15625],
    [6, 1, 10, 20], [6, 2, 125 / 12, 20], [6, 4, 245 / 24, 485 / 24],
    [12, 1, 125 / 12, 20], [12, 2, 245 / 24, 485 / 24], [12, 4, 490 / 48, 965 / 48],
  ])('%i-to-5 subdivision %i uses physical yards and keeps offsets', (steps, subdivision, x, y) => {
    const result = moveSelection(originals, ['b', 'a'], { x: .16, y: -.07 }, field, { ...DEFAULT_SNAPPING, steps, subdivision } as SnapSettings);
    expect(result.a.x).toBeCloseTo(x, 10); expect(result.a.y).toBeCloseTo(y, 10);
    expect(result.b.x - result.a.x).toBeCloseTo(2.6, 10); expect(result.b.y - result.a.y).toBeCloseTo(.9, 10);
    expect(originals.a).toEqual({ x: 10.1, y: 20.2 });
  });
  it('individual mode can change intervals and leaves unselected dots untouched', () => {
    const points = { ...originals, other: { x: 40, y: 40 } };
    const result = moveSelection(points, ['a', 'b'], { x: .16, y: -.07 }, field, { ...DEFAULT_SNAPPING, group: 'individual' });
    expect(result).toEqual({ a: { x: 10, y: 20 }, b: { x: 13.125, y: 21.25 } });
    expect(result).not.toHaveProperty('other'); expect(points.other).toEqual({ x: 40, y: 40 });
  });
  it('the grabbed anchor is explicit; nudge anchors are stable under roster/selection reordering', () => {
    const reverse = { b: originals.b, a: originals.a };
    const delta = { x: .16, y: -.07 };
    expect(moveSelection(reverse, ['b', 'a'], delta, field)).toEqual(moveSelection(originals, ['a', 'b'], delta, field));
    const grabbed = moveSelection(originals, ['a', 'b'], delta, field, DEFAULT_SNAPPING, true, 'b');
    expect(grabbed.b).toEqual({ x: 13.125, y: 21.25 });
    expect(grabbed.b.x - grabbed.a.x).toBeCloseTo(2.6, 10);
  });
  it('resolves yard/hash ties toward the smaller physical coordinate and respects both presets', () => {
    const settings = { ...DEFAULT_SNAPPING, target: 'markings' as const };
    const at = (x: number, y: number, preset: 'college' | 'high-school' = 'college') => moveSelection({ a: { x: 0, y: 0 } }, ['a'], { x, y }, { ...field, preset }, settings).a;
    expect(at(12.5, (20 + field.height - 20) / 2)).toEqual({ x: 10, y: 20 });
    expect(at(13, 19)).toEqual({ x: 15, y: 20 });
    expect(at(13, 19, 'high-school').y).toBeCloseTo(160 / 9, 10);
    expect(at(-100, -100)).toEqual({ x: 0, y: 0 });
    expect(at(1000, 1000)).toEqual({ x: 100, y: field.height });
  });
  it('field boundaries stop rigid groups without squeezing them; individual mode stays inside', () => {
    const points = { a: { x: 0, y: 0 }, b: { x: 100, y: field.height } };
    expect(moveSelection(points, ['a', 'b'], { x: -999, y: 999 }, field)).toEqual(points);
    const individual = moveSelection(originals, ['a', 'b'], { x: -999, y: 999 }, field, { ...DEFAULT_SNAPPING, group: 'individual' });
    for (const p of Object.values(individual)) { expect(p.x).toBe(0); expect(p.y).toBeLessThanOrEqual(field.height); }
    // No hash lies inside this group's legal anchor interval: preserve offsets at the edge.
    const wide = { a: { x: 2, y: 10 }, b: { x: 3, y: 0 }, c: { x: 4, y: 52 } };
    const result = moveSelection(wide, ['a', 'b', 'c'], { x: 0, y: 100 }, field, { ...DEFAULT_SNAPPING, target: 'markings' });
    expect(result.c.y).toBeCloseTo(field.height, 10); expect(result.c.y - result.b.y).toBe(52);
  });
  it('off disables quantization; numeric placement and nudges preserve the untouched axis', () => {
    expect(moveSelection(originals, ['a'], { x: .16, y: -.07 }, field, DEFAULT_SNAPPING, false).a).toEqual({ x: 10.26, y: 20.13 });
    const result = moveSelection(originals, ['a'], { x: .16, y: 0 }, field, DEFAULT_SNAPPING, true, 'a', { x: true, y: false });
    expect(result.a).toEqual({ x: 10, y: 20.2 });
  });
  it('short nudges advance to the next grid or marking in either direction', () => {
    for (const target of ['grid', 'markings'] as const) {
      const settings = { ...DEFAULT_SNAPPING, steps: 6 as const, target };
      const start = { a: { x: 10, y: 20.2 } };
      const forward = moveSelection(start, ['a'], { x: .125, y: 0 }, field, settings, true, undefined, { x: true, y: false, advance: true });
      expect(forward.a.x).toBeCloseTo(target === 'grid' ? 65 / 6 : 15, 10); expect(forward.a.y).toBe(20.2);
      const back = moveSelection(start, ['a'], { x: -.125, y: 0 }, field, settings, true, undefined, { x: true, y: false, advance: true });
      expect(back.a.x).toBeCloseTo(target === 'grid' ? 55 / 6 : 5, 10);
    }
  });
  it('flipped views keep physical targets and invert only the requested screen direction', () => {
    const delta = fieldDirection('ArrowRight', .625, 'audience-top');
    const result = moveSelection({ a: { x: 10, y: 20 } }, ['a'], { x: delta.dx, y: delta.dy }, field);
    expect(result.a).toEqual({ x: 9.375, y: 20 });
    expect(fieldViewPoint(result.a, field, 'audience-top').x).toBeGreaterThan(fieldViewPoint({ x: 10, y: 20 }, field, 'audience-top').x);
  });
  it('rejects unsupported or partial settings and nonfinite moves', () => {
    for (const value of [null, [], {}, { ...DEFAULT_SNAPPING, steps: 5 }, { ...DEFAULT_SNAPPING, subdivision: 3 }, { ...DEFAULT_SNAPPING, target: 'unknown' }]) expect(() => validateSnapSettings(value)).toThrow('snapping');
    expect(() => moveSelection(originals, ['a'], { x: NaN, y: 0 }, field)).toThrow('finite');
  });
});
