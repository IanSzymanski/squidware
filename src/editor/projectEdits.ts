import { hasDetailedPaths, hasScheduledPaths } from '../movementPaths';
import { PROJECT_LIMITS, setTiming, uid, validateSetUpdate } from '../domain';
import type { DrillSet, Move, Project, SetPropertyUpdate } from '../types';

/** Incoming timing follows the destination picture, preserving v1 edit behavior.
 * Surviving moves keep their IDs; a changed predecessor rewires the same move.
 */
export function reconnectSets(project: Project, sets: DrillSet[], newTiming = new Map<string, ReturnType<typeof setTiming>>()): Project {
  const incoming = new Map(project.moves.map(move => [move.toSetId, move]));
  const firstMove = incoming.get(sets[0].id);
  const openingTiming = firstMove ? { tempo: firstMove.tempo, transition: firstMove.transition } : project.openingTiming;
  const moves = sets.slice(1).map((set, index): Move => {
    const old = incoming.get(set.id);
    if (old) {
      if (old.fromSetId === sets[index].id) return old;
      if (hasDetailedPaths(old)) throw new Error('This operation changes a detailed move’s starting set. Remove its custom paths first.');
      // Declarations describe this exact move, not a new predecessor's travel.
      const { marchingDirections: _directions, ...rewired } = old;
      return { ...rewired, fromSetId: sets[index].id };
    }
    const timing = newTiming.get(set.id) ?? { counts: 32, ...project.openingTiming };
    return { id: uid(), fromSetId: sets[index].id, toSetId: set.id, ...timing, paths: {} };
  });
  return { ...project, sets, moves, openingTiming };
}

/** Target is the final zero-based position, not an insertion slot. */
export function moveSetTo(project: Project, id: string, target: number): Project {
  const from = project.sets.findIndex(set => set.id === id);
  if (from < 0 || !Number.isInteger(target) || target < 0 || target >= project.sets.length) throw new Error('Choose an existing set and a position in this production.');
  if (from === target) return project;
  const sets = [...project.sets];
  sets.splice(target, 0, sets.splice(from, 1)[0]);
  return reconnectSets(project, sets);
}

export function updateSetProperties(project: Project, index: number, update: SetPropertyUpdate): Project {
  validateSetUpdate(update, index);
  const { counts, tempo, transition, name, notes } = update;
  const incoming = project.moves[index - 1];
  if (incoming && counts !== undefined && counts !== incoming.counts && hasScheduledPaths(incoming)) throw new Error('Remove timed paths before resizing this move. Detailed-path resizing is not supported yet.');
  const sets = name === undefined && notes === undefined ? project.sets : project.sets.map((set, i) => i === index
    ? { ...set, ...(name === undefined ? {} : { name }), ...(notes === undefined ? {} : { notes }) } : set);
  if (index === 0) return { ...project, sets, openingTiming: { ...project.openingTiming,
    ...(tempo === undefined ? {} : { tempo }), ...(transition === undefined ? {} : { transition }) } };
  if (counts === undefined && tempo === undefined && transition === undefined) return { ...project, sets };
  const moves = project.moves.map((move, i) => i !== index - 1 ? move : {
    ...move, ...(counts === undefined ? {} : { counts }), ...(tempo === undefined ? {} : { tempo }),
    ...(transition === undefined ? {} : { transition }),
    // Supported explicit lines partition the entire move; resizing keeps segment identities.
    paths: counts === undefined || counts === move.counts ? move.paths : Object.fromEntries(Object.entries(move.paths).map(([id, path]) =>
      [id, { segments: path.segments.map(segment => ({ ...segment, endCount: counts })) }])),
  });
  return { ...project, sets, moves };
}

export type SetCreationKind = 'new' | 'duplicate' | 'insert-before' | 'hold';
export interface SetCreationOptions { counts?: number; tempo?: number }
export const setCreationNames: Record<SetCreationKind, string> = {
  new: 'New set', duplicate: 'Duplicate set', 'insert-before': 'Insert before', hold: 'Hold positions',
};

export function creationTiming(project: Project, index: number, kind: SetCreationKind, defaultCounts: number) {
  const source = setTiming(project, index);
  return { counts: kind === 'duplicate' && index > 0 ? source.counts : defaultCounts,
    tempo: source.tempo, transition: kind === 'duplicate' ? source.transition : 'linear' as const };
}

/** A blank picture has the whole cast in a fresh staging grid, never missing dots. */
function stagingPositions(project: Project): DrillSet['positions'] {
  const columns = Math.min(40, Math.max(1, project.performers.length));
  const rows = Math.ceil(project.performers.length / columns);
  return Object.fromEntries(project.performers.map((p, i) => [p.id, {
    x: project.field.width * (columns === 1 ? .5 : .05 + .9 * (i % columns) / (columns - 1)),
    y: project.field.height * .95 - Math.floor(i / columns) * Math.min(2.3, project.field.height * .9 / Math.max(1, rows - 1)),
  }]));
}

/** Existing arrival timing/paths follow their destination; only predecessors are rewired.
 * Duplicating a picture does not duplicate its incoming travel from a different picture.
 */
export function createPicture(project: Project, index: number, kind: SetCreationKind, defaultCounts: number, options: SetCreationOptions = {}): Project {
  if (!Number.isInteger(index) || !project.sets[index]) throw new Error('Choose an existing set.');
  if (project.sets.length >= PROJECT_LIMITS.sets) throw new Error(`A production can contain at most ${PROJECT_LIMITS.sets} sets.`);
  const timing = { ...creationTiming(project, index, kind, defaultCounts), ...options };
  validateSetUpdate(timing, 1);
  const source = project.sets[index];
  const at = kind === 'insert-before' ? index : index + 1;
  const positionSource = kind === 'insert-before' ? project.sets[Math.max(0, index - 1)] : source;
  const suffix = kind === 'duplicate' ? ' copy' : kind === 'hold' ? ' hold' : '';
  const picture: DrillSet = { id: uid(), name: suffix ? source.name.slice(0, PROJECT_LIMITS.text.setName - suffix.length) + suffix : `Set ${project.sets.length + 1}`,
    notes: kind === 'duplicate' ? source.notes : '',
    positions: kind === 'new' ? stagingPositions(project) : structuredClone(positionSource.positions) };
  const newTiming = new Map([[picture.id, timing]]);
  // Inserting a new opening picture gives the old opening its first incoming move.
  if (at === 0) newTiming.set(source.id, timing);
  return reconnectSets(project, [...project.sets.slice(0, at), picture, ...project.sets.slice(at)], newTiming);
}
