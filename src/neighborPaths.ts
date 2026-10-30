import { moveEndpoints } from './domain';
import { selectionMembership } from './selection';
import { movementSvg, movementLength } from './movementPaths';
import type { Point, Project } from './types';

export interface NeighborPath {
  performerId: string;
  from: Point;
  to: Point;
  svg: string;
  moving: boolean;
}
export interface NeighborOverlay {
  direction: 'previous' | 'next';
  setIndex: number;
  setName: string;
  paths: NeighborPath[];
}
export interface NeighborOptions {
  previous: boolean;
  next: boolean;
  selectedIds: readonly string[];
  sectionFilter: string;
  preview: boolean;
}

/** Review only committed adjacent sets, using the same endpoints as playback. */
export function neighborOverlays(project: Project, index: number, options: NeighborOptions): NeighborOverlay[] {
  if (options.preview || !options.previous && !options.next || !Number.isInteger(index) || !project.sets[index]) return [];
  const selected = selectionMembership(options.selectedIds);
  const performers = project.performers.filter(person =>
    (!selected.size || selected.has(person.id)) &&
    (options.sectionFilter === 'all' || person.sectionId === options.sectionFilter));
  return (['previous', 'next'] as const).flatMap(direction => {
    if (!options[direction]) return [];
    const setIndex = index + (direction === 'previous' ? -1 : 1);
    const neighbor = project.sets[setIndex];
    if (!neighbor) return [];
    const moveIndex = direction === 'previous' ? index - 1 : index;
    const paths = performers.flatMap(person => {
      const endpoints = moveEndpoints(project, moveIndex, person.id);
      return endpoints ? [{ performerId: person.id, ...endpoints, svg: movementSvg(endpoints.from, endpoints.to, project.moves[moveIndex].paths[person.id]), moving: movementLength(endpoints.from, endpoints.to, project.moves[moveIndex].paths[person.id]) > 1e-8 }] : [];
    });
    return paths.length ? [{ direction, setIndex, setName: neighbor.name, paths }] : [];
  });
}
