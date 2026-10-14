import { describe, expect, it } from 'vitest';
import { cycleFieldHit, DEFAULT_FIELD_PRESENTATION, layoutFieldLabels, nearestFieldDots } from './fieldPresentation';
import type { LabelDot, ScreenBox } from './fieldPresentation';
import { createDemoProject } from '../domain';
import { FieldDrawing } from './Field2D';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const bounds = { left: 0, top: 0, right: 1200, bottom: 800 };
const overlap = (a: ScreenBox, b: ScreenBox) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
describe('screen-space field interaction', () => {
  it('selects every two-step block center independently of roster order, scale or pixel density', () => {
    for (const scale of [2, 4, 8, 16]) {
      const dots = Array.from({ length: 500 }, (_, i) => ({ id: `p${i}`, x: i % 25 * 1.25 * scale, y: Math.floor(i / 25) * 1.25 * scale }));
      for (const dot of dots) {
        expect(nearestFieldDots(dots, dot, 10)).toEqual([dot.id]);
        expect(nearestFieldDots([...dots].reverse(), dot, 10)).toEqual([dot.id]);
      }
    }
  });
  it('uses a CSS-pixel radius, enlarges touch targets, and never chooses a farther candidate', () => {
    const dots = [{ id: 'b', x: 5, y: 0 }, { id: 'a', x: 0, y: 0 }];
    expect(nearestFieldDots(dots, { x: 1, y: 0 }, 22)).toEqual(['a']);
    expect(nearestFieldDots(dots, { x: -15, y: 0 }, 10)).toEqual([]);
    expect(nearestFieldDots(dots, { x: -15, y: 0 }, 22)).toEqual(['a']);
    expect(nearestFieldDots(dots, { x: 2.5, y: 0 }, 10)).toEqual(['a', 'b']);
  });
  it('cycles stable exact/equidistant ties and resets after changing pointer or candidate set', () => {
    const dots = ['c', 'a', 'b'].map(id => ({ id, x: 20, y: 20 }));
    const pointer = { x: 20, y: 20 }; const ids = nearestFieldDots(dots, pointer, 10);
    let cycle = cycleFieldHit(ids, pointer, null);
    expect(ids[cycle.index]).toBe('a');
    cycle = cycleFieldHit(ids, pointer, cycle); expect(ids[cycle.index]).toBe('b');
    cycle = cycleFieldHit(nearestFieldDots([...dots].reverse(), pointer, 10), pointer, cycle); expect(ids[cycle.index]).toBe('c');
    cycle = cycleFieldHit(ids, pointer, cycle); expect(ids[cycle.index]).toBe('a');
    expect(cycleFieldHit(ids, { x: 24, y: 20 }, cycle).index).toBe(0);
    expect(cycleFieldHit(['b', 'c'], pointer, cycle).index).toBe(0);
  });
});
describe('readable field labels', () => {
  const dots: LabelDot[] = Array.from({ length: 500 }, (_, i) => ({
    id: `p${i}`, x: 100 + i % 25 * 10, y: 100 + Math.floor(i / 25) * 10,
    labelWidth: 32, selected: false, focused: false,
  }));
  it('avoids labels, dots and clipping; suppresses predictably independent of roster order', () => {
    const layout = layoutFieldLabels(dots, bounds, DEFAULT_FIELD_PRESENTATION);
    expect([...layout]).toEqual([...layoutFieldLabels([...dots].reverse(), bounds, DEFAULT_FIELD_PRESENTATION)]);
    expect(layout.size).toBeGreaterThan(0); expect(layout.size).toBeLessThan(dots.length);
    const boxes = [...layout.values()];
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      expect(box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom).toBe(true);
      for (const other of boxes.slice(i + 1)) expect(overlap(box, other)).toBe(false);
      for (const dot of dots) expect(overlap(box, { left: dot.x - 4, right: dot.x + 4, top: dot.y - 4, bottom: dot.y + 4 })).toBe(false);
    }
  });
  it('prioritizes focus and selection; selected-only and hidden modes are explicit', () => {
    const same = [{ ...dots[0], id: 'a' }, { ...dots[0], id: 'b', selected: true }, { ...dots[0], id: 'c', focused: true }];
    expect([...layoutFieldLabels(same, bounds, DEFAULT_FIELD_PRESENTATION).keys()].slice(0, 2)).toEqual(['c', 'b']);
    expect([...layoutFieldLabels(same, bounds, { ...DEFAULT_FIELD_PRESENTATION, labelMode: 'selected' }).keys()]).toEqual(['c', 'b']);
    expect(layoutFieldLabels(same, bounds, { ...DEFAULT_FIELD_PRESENTATION, labelMode: 'none' }).size).toBe(0);
    expect(layoutFieldLabels([{ ...dots[0], labelWidth: 5000 }], bounds, DEFAULT_FIELD_PRESENTATION).size).toBe(0);
  });
  it('keeps static print geometry independent of screen presentation and does not mutate the project', () => {
    const project = createDemoProject(); const before = structuredClone(project);
    const render = (presentation?: object) => renderToStaticMarkup(createElement('svg', {}, createElement(FieldDrawing, { project, positions: project.sets[0].positions, presentation })));
    expect(render({ dotRadiusPx: 20, labelSizePx: 40, labelMode: 'selected' })).toBe(render());
    expect(project).toEqual(before);
  });
});
