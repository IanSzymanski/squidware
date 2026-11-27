import { describe, expect, it } from 'vitest';
import { cycleFieldHit, DEFAULT_FIELD_PRESENTATION, labelLeader, layoutFieldLabels, nearestFieldDots } from './fieldPresentation';
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
  it('keeps the focused ID in a crowded adaptive section and restores all selected IDs on request', () => {
    const section = dots.slice(0, 18).map((dot, i) => ({ ...dot, selected: true, focused: i === 10 }));
    const adaptive = layoutFieldLabels(section, bounds, { ...DEFAULT_FIELD_PRESENTATION, labelMode: 'adaptive' });
    expect(adaptive.has(section[10].id)).toBe(true);
    expect(adaptive.size).toBeLessThan(section.length);
    expect(layoutFieldLabels(section, bounds, { ...DEFAULT_FIELD_PRESENTATION, labelMode: 'all' }).size).toBe(section.length);
  });
  it('always names a selected or focused performer, even where nothing fits without touching a neighbor', () => {
    // A tight cluster: every side of the middle dot is taken by a neighbor.
    const cluster: LabelDot[] = [[0, 0], [14, 0], [-14, 0], [0, 14], [0, -14], [14, 14], [-14, -14], [14, -14], [-14, 14]].map(([dx, dy], i) => ({ id: `p${i}`, x: 600 + dx, y: 400 + dy, labelWidth: 22, selected: false, focused: false }));
    expect(layoutFieldLabels(cluster, bounds, DEFAULT_FIELD_PRESENTATION).has('p0')).toBe(false);
    const selected = layoutFieldLabels(cluster.map(dot => dot.id === 'p0' ? { ...dot, selected: true } : dot), bounds, DEFAULT_FIELD_PRESENTATION);
    // It moves out past its neighbors rather than sitting on them, and a leader ties it back to its dot.
    const forced = selected.get('p0')!;
    for (const dot of cluster) expect(overlap(forced, { left: dot.x - 4, right: dot.x + 4, top: dot.y - 4, bottom: dot.y + 4 })).toBe(false);
    for (const [id, box] of selected) if (id !== 'p0') expect(overlap(forced, box)).toBe(false);
    expect(labelLeader(cluster[0], forced, DEFAULT_FIELD_PRESENTATION.dotRadiusPx)).not.toBeNull();
    // Two selected performers in the same crowd never share a label position.
    const pair = layoutFieldLabels(cluster.map(dot => dot.id === 'p0' || dot.id === 'p1' ? { ...dot, selected: true } : dot), bounds, DEFAULT_FIELD_PRESENTATION);
    expect(overlap(pair.get('p0')!, pair.get('p1')!)).toBe(false);
    expect(layoutFieldLabels(cluster.map(dot => dot.id === 'p0' ? { ...dot, focused: true } : dot), bounds, DEFAULT_FIELD_PRESENTATION).has('p0')).toBe(true);
    // Even a forced label stays in view.
    expect(layoutFieldLabels([{ ...cluster[0], selected: true, labelWidth: 5000 }], bounds, DEFAULT_FIELD_PRESENTATION).size).toBe(0);
  });
  it('names a sideline performer on the preferred side and stays out from under floating controls', () => {
    const dot: LabelDot = { id: 'pit', x: 600, y: 700, labelWidth: 26, selected: false, focused: false };
    const below = layoutFieldLabels([{ ...dot, prefer: 'below' }], bounds, DEFAULT_FIELD_PRESENTATION).get('pit')!;
    expect(below.top).toBeGreaterThan(dot.y); expect((below.left + below.right) / 2).toBeCloseTo(dot.x);
    const above = layoutFieldLabels([{ ...dot, prefer: 'above' }], bounds, DEFAULT_FIELD_PRESENTATION).get('pit')!;
    expect(above.bottom).toBeLessThan(dot.y);
    expect(layoutFieldLabels([dot], bounds, DEFAULT_FIELD_PRESENTATION).get('pit')!.left).toBeGreaterThan(dot.x);
    // On a curve, a label goes to the outside: here the arc bulges upward, so its top dot is labeled above.
    const arc: LabelDot[] = Array.from({ length: 9 }, (_, i) => ({ id: `a${i}`, x: 520 + i * 20, y: 400 - Math.sqrt(120 ** 2 - (i * 20 - 80) ** 2) + 90, labelWidth: 20, selected: false, focused: false }));
    const crown = layoutFieldLabels(arc, bounds, DEFAULT_FIELD_PRESENTATION).get('a4')!;
    expect(crown.bottom).toBeLessThan(arc[4].y);
    // A corner kept for controls pushes the label to another side.
    const corner = { ...dot, x: bounds.right - 215, y: bounds.bottom - 12 };
    expect(layoutFieldLabels([corner], bounds, DEFAULT_FIELD_PRESENTATION).get('pit')!.left).toBeGreaterThan(corner.x);
    const kept = layoutFieldLabels([corner], bounds, { ...DEFAULT_FIELD_PRESENTATION, labelKeepOut: { bottomRight: [200, 40] } }).get('pit')!;
    expect(kept.right).toBeLessThan(corner.x);
    expect(overlap(kept, { left: bounds.right - 200, top: bounds.bottom - 40, right: bounds.right, bottom: bounds.bottom })).toBe(false);
  });
  it('ties a label to its dot with a leader only when it is not on the usual right side', () => {
    const dot = { x: 100, y: 100 }, radius = DEFAULT_FIELD_PRESENTATION.dotRadiusPx;
    expect(labelLeader(dot, { left: 108, top: 92, right: 134, bottom: 108 }, radius)).toBeNull();
    const left = labelLeader(dot, { left: 60, top: 92, right: 89, bottom: 108 }, radius)!;
    expect(left).toMatchObject({ x2: 89, y2: 100 }); expect(left.x1).toBeLessThan(dot.x - radius); expect(left.y1).toBeCloseTo(100);
    const above = labelLeader(dot, { left: 87, top: 74, right: 113, bottom: 89 }, radius)!;
    expect(above.x2).toBeCloseTo(100); expect(above.y2).toBeLessThan(above.y1); expect(above.y1).toBeLessThan(dot.y - radius);
    // Touching the dot leaves nothing to draw.
    expect(labelLeader(dot, { left: 80, top: 92, right: 97, bottom: 108 }, radius)).toBeNull();
  });
  it('keeps static print geometry independent of screen presentation and does not mutate the project', () => {
    const project = createDemoProject(); const before = structuredClone(project);
    const render = (presentation?: object, orientation: 'audience-top' | 'audience-bottom' = 'audience-bottom') => renderToStaticMarkup(createElement('svg', {}, createElement(FieldDrawing, { project, positions: project.sets[0].positions, presentation, orientation })));
    expect(render({ dotRadiusPx: 20, labelSizePx: 40, labelMode: 'selected', colorMode: 'custom', customColor: '#ff0000' }, 'audience-top')).toBe(render());
    expect(project).toEqual(before);
  });
});
