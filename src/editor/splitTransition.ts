import { hasDetailedPaths } from '../movementPaths';
import { PROJECT_LIMITS, sampleProject, setStartCount, uid } from '../domain';
import type { Move, Project, RehearsalAnchor } from '../types';

export interface SplitTransitionRequest {
  moveId: string; count: number; allowEasingChange?: boolean;
}

export function splitTransitionError(project: Project, moveId: string, count: number): string | null {
  const move = project.moves.find(move => move.id === moveId);
  if (!move) return 'Choose an existing transition.';
  if (hasDetailedPaths(move)) return 'Remove custom paths before splitting this transition. Detailed splits require path operations.';
  if (project.sets.length >= PROJECT_LIMITS.sets) return `A production can contain at most ${PROJECT_LIMITS.sets} sets.`;
  if (!Number.isInteger(count) || count < 1 || count >= move.counts)
    return move.counts < 2 ? 'This transition needs at least two counts to split.' : `Choose a whole count from 1 to ${move.counts - 1}, inside this transition.`;
  return null;
}

/** Current paths are straight lines. Preserve the sampled picture and show clock;
 * easing cannot be partitioned in v2, so conversion requires explicit review.
 * The old move/segment IDs stay with the original destination.
 */
export function splitTransition(project: Project, request: SplitTransitionRequest): Project {
  const { moveId, count } = request;
  const error = splitTransitionError(project, moveId, count);
  if (error) throw new Error(error);
  const index = project.moves.findIndex(move => move.id === moveId), move = project.moves[index];
  if (move.transition === 'ease' && request.allowEasingChange !== true) throw new Error('Review and accept the easing change before splitting this transition.');
  const picture = { id: uid(), name: `Split · ${project.sets[index + 1].name}`.slice(0, PROJECT_LIMITS.text.setName), notes: '',
    positions: sampleProject(project, setStartCount(project, index) + count).positions };
  function paths(first: boolean): Move['paths'] {
    return Object.fromEntries(Object.entries(move.paths).map(([id, path]) => [id, { segments: path.segments.map(segment => ({
      ...segment, id: first ? uid() : segment.id, startCount: 0, endCount: first ? count : move.counts - count,
    })) }]));
  }
  const first: Move = { ...move, id: uid(), toSetId: picture.id, counts: count, transition: 'linear', paths: paths(true) };
  const second: Move = { ...move, fromSetId: picture.id, counts: move.counts - count, transition: 'linear', paths: paths(false) };
  function anchor(value: RehearsalAnchor): RehearsalAnchor {
    // Retain already-stale references rather than silently repairing/retargeting them.
    if (value.kind !== 'move' || value.moveId !== move.id || value.fromSetId !== move.fromSetId || value.toSetId !== move.toSetId || value.count > move.counts) return value;
    if (value.count === count) return { kind: 'set', setId: picture.id };
    const next = value.count < count ? first : second;
    return { kind: 'move', moveId: next.id, fromSetId: next.fromSetId, toSetId: next.toSetId, count: value.count < count ? value.count : value.count - count };
  }
  return { ...project, sets: [...project.sets.slice(0, index + 1), picture, ...project.sets.slice(index + 1)],
    moves: [...project.moves.slice(0, index), first, second, ...project.moves.slice(index + 1)],
    ...(project.rehearsal ? { rehearsal: project.rehearsal.map(passage => ({ ...passage, start: anchor(passage.start), ...(passage.end ? { end: anchor(passage.end) } : {}) })) } : {}) };
}

/** Exact maximum displacement from the eased curve to its two straight chords.
 * On each interval extrema satisfy smoothstep'(t) = chord slope.
 */
export function splitEasingDeviation(project: Project, moveIndex: number, count: number) {
  const move = project.moves[moveIndex], s = count / move.counts;
  if (move.transition !== 'ease') return { yards: 0, count };
  const smooth = (t: number) => t * t * (3 - 2 * t), at = smooth(s);
  let fraction = 0, worst = s;
  for (const [lo, hi, slope, offset] of [[0, s, at / s, 0], [s, 1, (1 - at) / (1 - s), at]] as const) {
    const root = Math.sqrt(Math.max(0, 1 - 2 * slope / 3));
    for (const t of [lo, hi, (1 - root) / 2, (1 + root) / 2]) if (t >= lo && t <= hi) {
      const difference = Math.abs(smooth(t) - (offset + (t - lo) * slope));
      if (difference > fraction) { fraction = difference; worst = t; }
    }
  }
  let distance = 0;
  for (const person of project.performers) {
    const from = project.sets[moveIndex].positions[person.id], to = project.sets[moveIndex + 1].positions[person.id];
    distance = Math.max(distance, Math.hypot(to.x - from.x, to.y - from.y));
  }
  return { yards: distance * fraction, count: worst * move.counts };
}
