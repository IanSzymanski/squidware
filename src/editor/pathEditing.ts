import { uid } from '../domain';
import type { CubicPathSegment, Point, Project } from '../types';

export interface PathEdit {
  moveId: string; performerId: string;
  controls: { control1: Point; control2: Point } | null;
  revision: number; epoch: number;
}

/** The store validates this entire candidate before it records one transaction. */
export function editMovementPath(project: Project, edit: PathEdit): Project {
  const index = project.moves.findIndex(move => move.id === edit.moveId);
  if (index < 0 || !project.performers.some(p => p.id === edit.performerId)) throw new Error('Choose an existing move and performer.');
  const move = project.moves[index], paths = { ...move.paths };
  if (!edit.controls) delete paths[edit.performerId];
  else {
    const segment: CubicPathSegment = { id: paths[edit.performerId]?.segments[0]?.id ?? uid(), kind: 'cubic', startCount: 0, endCount: move.counts,
      control1: { ...edit.controls.control1 }, control2: { ...edit.controls.control2 } };
    paths[edit.performerId] = { segments: [segment] };
  }
  return { ...project, moves: project.moves.map((m, i) => i === index ? { ...m, paths } : m) };
}
