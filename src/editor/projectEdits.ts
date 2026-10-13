import { setTiming, uid, validateSetUpdate } from '../domain';
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
    if (old) return old.fromSetId === sets[index].id ? old : { ...old, fromSetId: sets[index].id };
    const timing = newTiming.get(set.id) ?? { counts: 32, ...project.openingTiming };
    return { id: uid(), fromSetId: sets[index].id, toSetId: set.id, ...timing, paths: {} };
  });
  return { ...project, sets, moves, openingTiming };
}

export function updateSetProperties(project: Project, index: number, update: SetPropertyUpdate): Project {
  validateSetUpdate(update, index);
  const { counts, tempo, transition, name, notes } = update;
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

export function addPicture(project: Project, index: number): Project {
  const picture = { ...project.sets[index], id: uid(), name: `Set ${project.sets.length + 1}`,
    positions: structuredClone(project.sets[index].positions), notes: '' };
  return reconnectSets(project, [...project.sets.slice(0, index + 1), picture, ...project.sets.slice(index + 1)],
    new Map([[picture.id, { ...setTiming(project, index), counts: 32 }]]));
}
