import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDemoProject, sampleProject, setStartCount } from './domain';
import { neighborOverlays } from './neighborPaths';
import type { NeighborOptions } from './neighborPaths';
import { NeighborDrawing } from './components/NeighborDrawing';

const options: NeighborOptions = { previous: true, next: true, selectedIds: [], sectionFilter: 'all', preview: false };
describe('neighboring set review', () => {
  it('uses ordered move endpoints that agree with playback for linear/eased arrivals and holds', () => {
    const project = createDemoProject();
    const person = project.performers[0];
    project.moves[0].transition = 'ease';
    project.sets[0].positions[person.id] = { x: 20, y: 10 };
    project.sets[1].positions[person.id] = { x: 40, y: 30 };
    project.sets[2].positions[person.id] = { x: 40, y: 30 };
    const before = structuredClone(project);
    const overlays = neighborOverlays(project, 1, { ...options, selectedIds: [person.id] });
    expect(overlays.map(overlay => overlay.direction)).toEqual(['previous', 'next']);
    expect(overlays[0].paths[0]).toEqual({ performerId: person.id, from: { x: 20, y: 10 }, to: { x: 40, y: 30 } });
    for (const [index, overlay] of overlays.entries()) {
      const path = overlay.paths[0];
      expect(path.from).toEqual(sampleProject(project, setStartCount(project, index)).positions[person.id]);
      expect(path.to).toEqual(sampleProject(project, setStartCount(project, index + 1)).positions[person.id]);
    }
    expect(sampleProject(project, project.moves[0].counts / 2).positions[person.id]).toEqual({ x: 30, y: 20 });
    expect(project).toEqual(before);
  });
  it('shows no missing neighbors at endpoints or in single-set and empty productions', () => {
    const project = createDemoProject();
    expect(neighborOverlays(project, 0, options).map(item => item.direction)).toEqual(['next']);
    expect(neighborOverlays(project, project.sets.length - 1, options).map(item => item.direction)).toEqual(['previous']);
    expect(neighborOverlays({ ...project, sets: project.sets.slice(0, 1), moves: [] }, 0, options)).toEqual([]);
    expect(neighborOverlays({ ...project, performers: [] }, 1, options)).toEqual([]);
    expect(neighborOverlays(project, -1, options)).toEqual([]);
    expect(neighborOverlays(project, 1, { ...options, preview: true })).toEqual([]);
    expect(neighborOverlays(project, 1, { ...options, previous: false, next: false })).toEqual([]);
    expect(neighborOverlays(project, 1, { ...options, previous: false }).map(item => item.direction)).toEqual(['next']);
    expect(neighborOverlays(project, 1, { ...options, next: false }).map(item => item.direction)).toEqual(['previous']);
  });
  it('intersects selection with the current section filter without changing either', () => {
    const project = createDemoProject();
    const first = project.performers[0];
    const other = project.performers.find(person => person.sectionId !== first.sectionId)!;
    const selectedIds = [first.id, other.id];
    const overlays = neighborOverlays(project, 1, { ...options, selectedIds, sectionFilter: other.sectionId });
    expect(overlays.map(item => item.paths.map(path => path.performerId))).toEqual([[other.id], [other.id]]);
    expect(selectedIds).toEqual([first.id, other.id]);
    expect(neighborOverlays(project, 1, { ...options, selectedIds: ['removed'] })).toEqual([]);
    expect(neighborOverlays(project, 1, { ...options, sectionFilter: 'removed' })).toEqual([]);
  });
  it('keeps ghost geometry out of hit testing and gives holds no false direction arrow', () => {
    const project = createDemoProject(); const person = project.performers[0];
    project.sets[0].positions[person.id] = { x: 20, y: 10 };
    project.sets[1].positions[person.id] = { x: 30, y: 20 };
    project.sets[2].positions[person.id] = { x: 30, y: 20 };
    const html = renderToStaticMarkup(createElement(NeighborDrawing, {
      overlays: neighborOverlays(project, 1, { ...options, selectedIds: [person.id] }), scale: 2,
    }));
    expect(html).toContain('pointer-events="none"'); expect(html).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/tabindex|role="button"/);
    expect(html).toContain('M 20 10 L 30 20');
    expect(html.match(/data-neighbor-path="true"/g)).toHaveLength(1);
    expect(html.match(/data-neighbor-dot="true"/g)).toHaveLength(2);
    expect(html).toContain('stroke-dasharray="3 2"');
  });
});
