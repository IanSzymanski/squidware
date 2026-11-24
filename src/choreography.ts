import { resolveEquipment } from './equipment';
import { PROJECT_LIMITS } from './projectValidation';
import type { ChoreographyCue, ChoreographyPreset, Project, TimelineSample } from './types';

export const CHOREOGRAPHY_LIMITS = {
  cues: 256,
  transitionMin: .25,
  turnout: { min: 10, max: 45, default: 30 },
  depth: { min: .04, max: .14, default: .11 },
};

export const choreographyLabels: Record<ChoreographyPreset, string> = {
  second: 'Second position', plie: 'Plié in second position', 'flag-up': 'Flag up',
};

const track = (preset: ChoreographyPreset) => preset === 'flag-up' ? 'flag' : 'lower body';
const invalid = (message: string): never => { throw new Error(`Invalid project choreography: ${message}`); };

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function finite(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    return invalid(`${label} must be from ${min} to ${max}.`);
  }
  return value;
}

export function validateChoreography(input: unknown, project: Project): ChoreographyCue[] | undefined {
  if (input === undefined) return;
  if (!Array.isArray(input) || input.length > CHOREOGRAPHY_LIMITS.cues) return invalid(`use at most ${CHOREOGRAPHY_LIMITS.cues} cues.`);
  if (input.length === 0) return;
  const moves = new Map(project.moves.map(move => [move.id, move]));
  const roster = new Set(project.performers.map(person => person.id));
  const ids = new Set<string>();
  const intervals = new Map<string, ChoreographyCue[]>();
  const cues = input.map((value, index): ChoreographyCue => {
    const cue = record(value, `Cue ${index + 1}`);
    const { id, moveId, fromSetId, toSetId, preset, performerIds } = cue;
    if (typeof id !== 'string' || id.length > PROJECT_LIMITS.text.id || !/^[A-Za-z0-9_-]+$/.test(id)
      || ['__proto__', 'constructor', 'prototype'].includes(id) || ids.has(id)) return invalid('cue IDs must be unique valid identifiers.');
    ids.add(id);
    const move = typeof moveId === 'string' ? moves.get(moveId) : undefined;
    if (!move || move.fromSetId !== fromSetId || move.toSetId !== toSetId) return invalid('a cued move would lose or change its endpoints. Remove its cues first.');
    if (preset !== 'second' && preset !== 'plie' && preset !== 'flag-up') return invalid('choose a supported pose or flag preset.');
    if (!Array.isArray(performerIds) || performerIds.length === 0 || performerIds.length > roster.size
      || new Set(performerIds).size !== performerIds.length || performerIds.some(person => !roster.has(person))) {
      return invalid('select existing performers only. Remove or reassign their cues before deleting performers.');
    }
    const start = finite(cue.start, 0, move.counts, 'Start count');
    const end = finite(cue.end, 0, move.counts, 'End count');
    if (end <= start) return invalid('end count must be after start count.');
    if ((end - start) / 2 < CHOREOGRAPHY_LIMITS.transitionMin) {
      return invalid(`allow at least ${2 * CHOREOGRAPHY_LIMITS.transitionMin} counts for entering and leaving the cue.`);
    }
    const transition = finite(cue.transition, CHOREOGRAPHY_LIMITS.transitionMin, (end - start) / 2, 'Each transition');
    const common = { id, moveId: move.id, fromSetId: move.fromSetId, toSetId: move.toSetId, performerIds: [...performerIds] as string[], start, end, transition };
    let result: ChoreographyCue;
    if (preset === 'flag-up') result = { ...common, preset };
    else {
      const turnout = finite(cue.turnout, CHOREOGRAPHY_LIMITS.turnout.min, CHOREOGRAPHY_LIMITS.turnout.max, 'Turnout');
      result = preset === 'second' ? { ...common, preset, turnout } : { ...common, preset, turnout,
        depth: finite(cue.depth, CHOREOGRAPHY_LIMITS.depth.min, CHOREOGRAPHY_LIMITS.depth.max, 'Plié depth') };
    }
    for (const person of common.performerIds) {
      const key = `${move.id}/${track(preset)}/${person}`;
      const personCues = intervals.get(key);
      if (personCues) personCues.push(result);
      else intervals.set(key, [result]);
    }
    return result;
  });
  for (const entries of intervals.values()) {
    entries.sort((a, b) => a.start - b.start);
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].start < entries[i - 1].end) return invalid(`${track(entries[i].preset)} cues overlap for a performer on this move.`);
    }
  }
  return cues;
}

export function incompatibleFlagPerformers(project: Project, ids: readonly string[]) {
  const wanted = new Set(ids);
  const defaults = new Map(project.sections.map(section => [section.id, section.equipment]));
  return project.performers.filter(person => wanted.has(person.id)
    && resolveEquipment(person.appearance, defaults.get(person.sectionId)).key !== 'flag');
}

export interface LowerBodyCuePose {
  /** Fraction of full second-position width, independent of flexion. */
  spread: number;
  turnout: number;
  drop: number;
}

export const neutralCuePose: LowerBodyCuePose = { spread: 0, turnout: 0, drop: 0 };

export function compileChoreography(project: Project) {
  if (!project.choreography?.length) return;
  const indexes = new Map(project.moves.map((move, index) => [move.id, index + 1]));
  const cuesByArrival = new Map<number, ChoreographyCue[]>();
  const lowerBodyIds = new Set<string>(), flagIds = new Set<string>();
  for (const cue of project.choreography) {
    const arrival = indexes.get(cue.moveId);
    if (arrival === undefined) continue;
    const list = cuesByArrival.get(arrival);
    if (list) list.push(cue);
    else cuesByArrival.set(arrival, [cue]);
    const ids = cue.preset === 'flag-up' ? flagIds : lowerBodyIds;
    cue.performerIds.forEach(id => ids.add(id));
  }
  return { cuesByArrival, lowerBodyIds, flagIds };
}

const smooth = (fraction: number) => fraction * fraction * (3 - 2 * fraction);

/** Timeline timing comes from the same absolute show count as the drill positions. */
export function sampleChoreography(compiled: ReturnType<typeof compileChoreography>, timing: Pick<TimelineSample, 'setIndex' | 'localCount'>) {
  if (!compiled) return;
  const { cuesByArrival, lowerBodyIds, flagIds } = compiled;
  const lowerBody = new Map<string, LowerBodyCuePose>(), flags = new Map<string, number>();
  for (const cue of cuesByArrival.get(timing.setIndex) ?? []) {
    const count = timing.localCount;
    if (count < cue.start || count >= cue.end) continue;
    const entry = Math.min(1, (count - cue.start) / cue.transition, (cue.end - count) / cue.transition);
    if (cue.preset === 'flag-up') {
      cue.performerIds.forEach(id => flags.set(id, smooth(entry)));
    } else {
      const spread = smooth(cue.preset === 'plie' ? Math.min(1, entry * 2) : entry);
      const drop = cue.preset === 'plie' ? cue.depth * smooth(Math.max(0, entry * 2 - 1)) : 0;
      const pose = { spread, turnout: cue.turnout * spread, drop };
      cue.performerIds.forEach(id => lowerBody.set(id, pose));
    }
  }
  return { lowerBodyIds, flagIds, lowerBody, flags };
}

export type ChoreographySample = NonNullable<ReturnType<typeof sampleChoreography>>;
