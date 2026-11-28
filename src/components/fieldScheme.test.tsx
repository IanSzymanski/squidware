import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createDemoProject } from '../domain';
import { FieldDrawing } from './Field2D';
import { PrintOutput } from './PrintOutput';
import { FIELD_PALETTES } from './fieldPalette';

const surface = (html: string) => html.match(/data-field-surface="true"[^>]*fill="(#[0-9a-f]+)"/)?.[1];
describe('field looks on paper and in exports', () => {
  const project = createDemoProject();
  it('prints the standard turf by default and Classic chart when asked', () => {
    const standard = renderToStaticMarkup(<PrintOutput project={project} mode="charts" />);
    const classic = renderToStaticMarkup(<PrintOutput project={project} mode="charts" fieldScheme="classic" />);
    expect(surface(standard)).toBe(FIELD_PALETTES.turf.football.turf);
    expect(surface(classic)).toBe('#ffffff');
    expect(classic).toContain(`stroke="${FIELD_PALETTES.classic.football.line}"`);
    expect(classic).not.toContain(FIELD_PALETTES.turf.football.turf);
    // Labels print dark with a white halo on the white chart.
    expect(classic).toContain(`fill="${FIELD_PALETTES.classic.label.print}" stroke="${FIELD_PALETTES.classic.label.halo}"`);
    expect(classic).toContain('data-field-scheme="classic"');
  });
  it('keeps the SVG export drawing on the standard turf', () => {
    const svg = renderToStaticMarkup(<svg><FieldDrawing project={project} positions={project.sets[0].positions} showLabels showGrid /></svg>);
    expect(surface(svg)).toBe(FIELD_PALETTES.turf.football.turf);
    expect(svg).toContain('stroke="#ccdcc9" opacity="0.5"');
  });
});
