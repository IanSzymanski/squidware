import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createPerformanceFixture } from '../performanceFixtures';
import { sampleProject } from '../domain';
import { FieldDrawing } from './Field2D';
import { fieldCanvasSize, fieldDotColor, fieldLabels, measureFieldLabels } from './fieldScene';
import { DEFAULT_FIELD_PRESENTATION, nearestFieldDots } from './fieldPresentation';
import { fieldViewPoint } from './fieldOrientation';

describe('shared field scene', () => {
  const project = createPerformanceFixture('demo');
  const positions = sampleProject(project, 4.25).positions;
  it.each(['audience-bottom', 'audience-top'] as const)('uses the same label rectangles in SVG and canvas: %s', orientation => {
    const display = DEFAULT_FIELD_PRESENTATION;
    const selected = new Set([project.performers[0].id]);
    const screen = { scale: 7, bounds: { left: -50, top: -50, right: 750, bottom: 450 } };
    const labels = fieldLabels(project, positions, selected, null, display, screen, orientation, measureFieldLabels(project, display.labelSizePx));
    const svg = renderToStaticMarkup(<svg><FieldDrawing project={project} positions={positions} selectedIds={[...selected]} screen={screen} orientation={orientation} /></svg>);
    for (const [id, label] of labels) {
      const view = fieldViewPoint(positions[id], project.field, orientation);
      expect(svg).toContain(`data-performer-label="${id}" x="${(label.left + 2) / screen.scale - view.x}" y="${(label.top + 2 + display.labelSizePx * .8) / screen.scale - view.y}"`);
      expect(nearestFieldDots([{id,x:view.x*screen.scale,y:view.y*screen.scale}], {x:view.x*screen.scale,y:view.y*screen.scale}, 10)).toEqual([id]);
    }
    expect(labels.size).toBeGreaterThan(15);
  });
  it('keeps vector print independent of display settings and canvas availability', () => {
    const render = (orientation: 'audience-top' | 'audience-bottom') => renderToStaticMarkup(<svg><FieldDrawing project={project} positions={positions} orientation={orientation} /></svg>);
    expect(render('audience-top')).toBe(render('audience-bottom'));
    expect(render('audience-top')).not.toMatch(/canvas|foreignObject/);
    expect(render('audience-top')).toContain('r="0.52"');
  });
  it('shares custom and selection colors without changing section colors', () => {
    expect(fieldDotColor('#123456', true, DEFAULT_FIELD_PRESENTATION)).toBe('#123456');
    expect(fieldDotColor('#123456', true, {...DEFAULT_FIELD_PRESENTATION,colorMode:'selection'})).toBe('#8dc8ff');
    expect(fieldDotColor('#123456', false, {...DEFAULT_FIELD_PRESENTATION,colorMode:'selection'})).toBe('#b3c5bd');
    expect(fieldDotColor('#123456', false, {...DEFAULT_FIELD_PRESENTATION,colorMode:'custom',customColor:'#abcdef'})).toBe('#abcdef');
  });
  it('allocates DPR pixels with a bounded backing store, retaining CSS geometry', () => {
    expect(fieldCanvasSize(1000,500,2)).toEqual({width:2000,height:1000,ratio:2});
    const huge = fieldCanvasSize(8000,4000,4);
    expect(huge.width * huge.height).toBeLessThan(16_020_000);
    expect(huge.ratio).toBeLessThan(1);
  });
});
