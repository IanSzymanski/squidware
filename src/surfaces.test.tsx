import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PrintOutput } from './components/PrintOutput';
import { coordinateDescription, createBlankProject, exportCoordinatesCsv, parseProject, sampleProject, serializeProject } from './domain';
import { parseDrillCoordinate } from './drillEntry';
import { createEditorStore } from './editor/store';
import { DEFAULT_SNAPPING, moveSelection } from './snapping';
import { validateSurface, type CustomSurface } from './surfaces';

const stage: CustomSurface = { preset: 'indoor', width: 30, height: 16, unit: 'ft', referenceInterval: 6 };
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPZsAAAAASUVORK5CYII=';

function example() {
  const project = createBlankProject();
  const person = { id: 'a', label: 'A1', name: '', sectionId: project.sections[0].id };
  project.performers = [person];
  project.sets[0].positions = { a: { x: 4, y: 2 } };
  return project;
}

describe('performance surfaces', () => {
  it('shares the back-left coordinate origin across input, playback, CSV and charts', () => {
    const project = { ...example(), field: { ...stage, background: { image, x: 2, y: 1, width: 10, height: 5 } } };
    const context = { stepsPerFive: 8 as const, side: null, defaultUnit: null };
    expect(parseDrillCoordinate('X 12, Y 6 ft', stage, context)).toEqual({ x: 4, y: 2 });
    expect(parseDrillCoordinate('X 3.6576, Y 1.8288 m', stage, context)).toEqual({ x: 4, y: 2 });
    expect(coordinateDescription({ x: 4, y: 2 }, stage)).toBe('X 12, Y 6 ft');
    expect(exportCoordinatesCsv(project)).toContain('"X (ft from back-left)","Y (ft from back-left)"');
    const charts = renderToStaticMarkup(<PrintOutput project={project} mode="charts" />);
    expect(charts).toContain('viewBox="-7 -8 44 32"');
    expect(charts).toContain(`<image href="${image}" x="2" y="1" width="10" height="5"`);
    const serialized = serializeProject(project);
    expect(JSON.parse(serialized).schemaVersion).toBe(16);
    const reloaded = parseProject(serialized);
    expect(reloaded.field).toEqual(project.field);
    expect(sampleProject(reloaded, 0).positions.a).toEqual({ x: 4, y: 2 });
  });

  it('snaps both axes to surface references and rejects a resize that crosses authored geometry', () => {
    expect(moveSelection({ a: { x: 4, y: 2 } }, ['a'], { x: 1.2, y: 1.2 }, stage, { ...DEFAULT_SNAPPING, target: 'markings' }))
      .toEqual({ a: { x: 6, y: 4 } });
    const store = createEditorStore(example());
    expect(store.dispatch('surface.update', { field: stage })).toBe(true);
    expect(store.dispatch('positions.move', { index: 0, updates: { a: { x: 26, y: 5 } } })).toBe(true);
    const before = store.getState().project;
    expect(store.dispatch('surface.update', { field: { ...stage, width: 20 } })).toBe(false);
    expect(store.getState().project).toBe(before);
    expect(store.dispatch('history.undo')).toBe(true);
    expect(store.dispatch('history.undo')).toBe(true);
    expect(store.getState().project.present.field.preset).toBe('college');
  });

  it('rejects external or invalid backgrounds and placement past the boundary', () => {
    const background = { image, x: 0, y: 0, width: 10, height: 5 };
    expect(() => validateSurface({ ...stage, background: { ...background, image: 'https://example.com/floor.png' } })).toThrow(/embedded PNG/);
    expect(() => validateSurface({ ...stage, background: { ...background, image: image.slice(0, -12) } })).toThrow(/incomplete PNG/);
    expect(() => validateSurface({ ...stage, background: { ...background, x: 25 } })).toThrow(/fit inside/);
  });
});
