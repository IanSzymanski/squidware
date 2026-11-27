import { effectiveMove } from './groupMotion';
import { moveEndpoints } from './domain';
import { selectionMembership } from './selection';
import { movementSvg, movementLength } from './movementPaths';
import { DEFAULT_ANALYSIS_RULES } from './analysis/rules';
import type { Point, Project } from './types';

export interface NeighborPath {
  performerId: string;
  from: Point;
  to: Point;
  svg: string;
  moving: boolean;
  /** Average yards per count along the path. */
  stride: number;
  /** Against the production's stride limit: comfortable, more than two thirds of it, or beyond it. */
  level: StrideLevel;
}
export type StrideLevel = 'ok' | 'large' | 'over';
/** Colors for review geometry on the field. A big step reads at a glance; the Problems list stays the authority. */
export const STRIDE_COLORS = { large: '#ffb454', over: '#ff7a6b' } as const;
export function strideLevel(stride: number, limit: number): StrideLevel {
  return stride > limit + 1e-9 ? 'over' : stride > limit * 2 / 3 + 1e-9 ? 'large' : 'ok';
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
    const move = effectiveMove(project, moveIndex);
    const limit = project.analysisRules?.defaults?.maximumStride ?? DEFAULT_ANALYSIS_RULES.maximumStride;
    const paths = performers.flatMap(person => {
      const endpoints = moveEndpoints(project, moveIndex, person.id);
      if (!endpoints) return [];
      const length = movementLength(endpoints.from, endpoints.to, move.paths[person.id]);
      const stride = move.counts > 0 ? length / move.counts : 0;
      return [{ performerId: person.id, ...endpoints, svg: movementSvg(endpoints.from, endpoints.to, move.paths[person.id]), moving: length > 1e-8, stride, level: strideLevel(stride, limit) }];
    });
    return paths.length ? [{ direction, setIndex, setName: neighbor.name, paths }] : [];
  });
}
