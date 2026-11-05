import { describe, expect, it } from 'vitest';
import { FIELD_FIT_MARGIN, fieldDirection, fieldViewBox, fieldViewPoint } from './fieldOrientation';
import { nearestFieldDots } from './fieldPresentation';
import { nextFieldFocus } from './fieldKeyboard';

const field = { width: 100, height: 160 / 3 };
describe('field orientation', () => {
  it('reverses presentation and pointer coordinates at boundaries and arbitrary zoom/DPI without changing points', () => {
    for (const p of [{ x: 0, y: 0 }, { x: 100, y: field.height }, { x: 17.1234, y: 21.4321 }]) {
      const original = { ...p };
      const shown = fieldViewPoint(p, field, 'audience-top');
      expect(shown).toEqual({ x: 100 - p.x, y: field.height - p.y });
      const back = fieldViewPoint(shown, field, 'audience-top');
      expect(back.x).toBeCloseTo(p.x, 12); expect(back.y).toBeCloseTo(p.y, 12);
      expect(p).toEqual(original);
      for (const scale of [.6, 1, 2, 3, 8]) {
        const dots = [{ id: 'target', x: shown.x * scale, y: shown.y * scale }, { id: 'other', x: shown.x * scale + 5, y: shown.y * scale }];
        expect(nearestFieldDots(dots, dots[0], 10)).toEqual(['target']);
      }
    }
  });
  it('keeps arrows spatial for both focus and movement while roster order stays stable', () => {
    const positions = { a: { x: 20, y: 20 }, b: { x: 25, y: 20 }, c: { x: 20, y: 25 } };
    const view = Object.fromEntries(Object.entries(positions).map(([id, p]) => [id, fieldViewPoint(p, field, 'audience-top')]));
    expect(nextFieldFocus(Object.keys(view), view, 'a', 'ArrowLeft')).toBe('b');
    expect(nextFieldFocus(Object.keys(view), view, 'a', 'ArrowUp')).toBe('c');
    expect(nextFieldFocus(Object.keys(view), view, 'a', 'PageDown')).toBe('b');
    expect(fieldDirection('ArrowLeft', .625, 'audience-top')).toEqual({ dx: .625, dy: 0 });
    expect(fieldDirection('ArrowUp', 2.5, 'audience-top')).toEqual({ dx: 0, dy: 2.5 });
    expect(fieldDirection('ArrowRight', .625, 'audience-bottom')).toEqual({ dx: .625, dy: 0 });
  });
});

describe('2D field fit', () => {
  const field = { width: 100, height: 160 / 3 };
  it('keeps both sideline labels inside the fitted view without reserving room for overlays', () => {
    const view = fieldViewBox(field, 1, { x: 0, y: 0 });
    expect(view.x).toBeCloseTo(-FIELD_FIT_MARGIN.x); expect(view.y).toBeCloseTo(-FIELD_FIT_MARGIN.y);
    expect(view.width).toBeCloseTo(100 + FIELD_FIT_MARGIN.x * 2); expect(view.height).toBeCloseTo(field.height + FIELD_FIT_MARGIN.y * 2);
    // Labels are drawn 4.2 yd above the back sideline and 5.2 yd (plus glyph height) below the front sideline.
    expect(view.y).toBeLessThan(-5.1); expect(view.y + view.height).toBeGreaterThan(field.height + 5.4);
    // The margin stays wide enough that a point 3 yd outside the field is still in view but off the field.
    expect(view.x).toBeLessThan(-3);
  });
  it('zooms around the panned center', () => {
    const view = fieldViewBox(field, 2, { x: 10, y: -4 });
    expect(view.width).toBeCloseTo((100 + FIELD_FIT_MARGIN.x * 2) / 2); expect(view.x + view.width / 2).toBeCloseTo(60); expect(view.y + view.height / 2).toBeCloseTo(field.height / 2 - 4);
  });
});
