import { PROJECT_LIMITS, validateLegacyProject } from './projectValidation';
import { validateSnapSettings } from './snapping';
import { validateAnalysisRules, validateMarchingDirections } from './analysis/rules';
import { validateRehearsal } from './rehearsal';
import { validateMeter } from './meter';
import { compileScore, validateScore } from './score';
import type { GeometryValidation } from './projectValidation';
import type { DrillSet, LegacyDrillSet, LegacyProject, Move, OpeningTiming, Project, LinePathSegment } from './types';
export type { Move, OpeningTiming, LinePathSegment, PerformerPath } from './types';
export type PictureSet = DrillSet;
export type ProjectV2 = Project;

function invalid(path: string, reason: string): never {
  throw new Error(`Invalid project: ${path} ${reason}`);
}
function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(path, 'must be an object.');
  return value as Record<string, unknown>;
}
function identifier(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.length || value.length > PROJECT_LIMITS.text.id
    || !/^[A-Za-z0-9_-]+$/.test(value) || ['__proto__', 'constructor', 'prototype'].includes(value)) {
    invalid(path, `must be an ID of at most ${PROJECT_LIMITS.text.id} letters, numbers, underscores or hyphens, excluding reserved keys.`);
  }
  return value;
}
function numeric(value: unknown, path: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    invalid(path, `must be ${integer ? 'an integer' : 'a finite number'} from ${min} to ${max}.`);
  }
  return value;
}
function timing(value: unknown, path: string): OpeningTiming {
  const data = object(value, path);
  if (data.transition !== 'linear' && data.transition !== 'ease') invalid(`${path}.transition`, 'must be linear or ease.');
  return {
    tempo: numeric(data.tempo, `${path}.tempo`, PROJECT_LIMITS.tempo.min, PROJECT_LIMITS.tempo.max),
    transition: data.transition,
  };
}
function versionError(version: unknown): never {
  if (typeof version === 'number' && Number.isInteger(version) && version > 2) {
    throw new Error(`This project uses schema version ${version}. Update Squidware to a version that supports it before opening or saving this file. Supported format versions: 1 and 2.`);
  }
  return invalid('schemaVersion', 'must be 1 or 2. Open a supported Squidware project (.squid) file.');
}
function assertSize(content: string): void {
  if (content.length > PROJECT_LIMITS.projectBytes || new TextEncoder().encode(content).byteLength > PROJECT_LIMITS.projectBytes) {
    throw new Error(`Project file is too large. The limit is ${PROJECT_LIMITS.projectBytes / 1024 / 1024} MiB of UTF-8 text.`);
  }
}

function picture(set: LegacyDrillSet): PictureSet {
  return { id: set.id, name: set.name, notes: set.notes, positions: set.positions };
}
function legacySets(sets: PictureSet[], moves: Move[], opening: OpeningTiming): LegacyDrillSet[] {
  return sets.map((set, index) => {
    const incoming = index === 0 ? opening : moves[index - 1];
    return { id: set.id, name: set.name, counts: index === 0 ? 0 : moves[index - 1].counts,
      tempo: incoming.tempo, notes: set.notes, transition: incoming.transition, positions: set.positions };
  });
}

/** Pure migration: validates v1 first, preserves all existing identities, invents only move IDs. */
export function migrateProjectV1(input: unknown): ProjectV2 {
  const legacy = validateLegacyProject(input);
  const { schemaVersion: _version, sets, ...common } = legacy;
  return {
    schemaVersion: 2, ...common, sets: sets.map(picture),
    moves: sets.slice(1).map((set, index) => ({
      id: `move-v1-${index + 1}`, fromSetId: sets[index].id, toSetId: set.id,
      counts: set.counts, tempo: set.tempo, transition: set.transition, paths: {},
    })),
    openingTiming: { tempo: sets[0].tempo, transition: sets[0].transition },
  };
}

/** Canonical v2 validation. Geometry/roster limits share the existing v1 validator. */
export function validateProjectV2(input: unknown, geometry: GeometryValidation = {}): ProjectV2 {
  const data = object(input, 'root');
  if (data.schemaVersion === 1) invalid('schemaVersion', 'must be 2 for v2 validation. Use migrateProjectV1 or parseProjectV2 to migrate a v1 file.');
  if (data.schemaVersion !== 2) versionError(data.schemaVersion);
  if (!Array.isArray(data.sets) || data.sets.length < 1 || data.sets.length > PROJECT_LIMITS.sets) {
    invalid('sets', `must contain 1 to ${PROJECT_LIMITS.sets} items.`);
  }
  const sets = data.sets.map((value, index) => {
    const path = `sets[${index}]`;
    const set = object(value, path);
    for (const key of ['counts', 'tempo', 'transition']) {
      if (Object.hasOwn(set, key)) invalid(`${path}.${key}`, 'belongs on the incoming move in schema v2; opening timing belongs in openingTiming.');
    }
    return { id: identifier(set.id, `${path}.id`), name: set.name, notes: set.notes, positions: set.positions };
  });
  if (!Array.isArray(data.moves) || data.moves.length !== sets.length - 1) {
    invalid('moves', `must contain exactly ${sets.length - 1} adjacent moves for ${sets.length} sets.`);
  }
  // Validate common properties and all geometry before constructing any path maps.
  // Temporary valid timing lets the same geometry validator service both versions.
  const base = validateLegacyProject({ ...data, schemaVersion: 1, sets: sets.map((set, index) => ({
    ...set, counts: index === 0 ? 0 : 1, tempo: 120, transition: 'linear',
  })) }, geometry);
  const performerIds = new Set(base.performers.map(performer => performer.id));
  const selectionGroups = data.selectionGroups === undefined ? undefined : (() => {
    if (!Array.isArray(data.selectionGroups) || data.selectionGroups.length > PROJECT_LIMITS.selectionGroups) invalid('selectionGroups', `must contain 0 to ${PROJECT_LIMITS.selectionGroups} groups.`);
    const seen = new Set<string>(), names = new Set<string>();
    return data.selectionGroups.map((value, index) => {
      const path = `selectionGroups[${index}]`, group = object(value, path), id = identifier(group.id, `${path}.id`);
      if (seen.has(id)) invalid(`${path}.id`, 'duplicates a group ID.');
      seen.add(id);
      if (typeof group.name !== 'string' || !group.name.trim() || group.name.length > PROJECT_LIMITS.text.groupName || /[\u0000-\u001f]/.test(group.name)) invalid(`${path}.name`, `must be a nonempty name of at most ${PROJECT_LIMITS.text.groupName} characters without control characters.`);
      const name = group.name.trim(), key = name.toLowerCase();
      if (names.has(key)) invalid(`${path}.name`, 'duplicates a group name.');
      names.add(key);
      if (!Array.isArray(group.performerIds) || group.performerIds.length > PROJECT_LIMITS.performers) invalid(`${path}.performerIds`, 'must be a bounded list of performer IDs.');
      const ids = group.performerIds.map((value, i) => identifier(value, `${path}.performerIds[${i}]`));
      if (new Set(ids).size !== ids.length || ids.some(id => !performerIds.has(id))) invalid(`${path}.performerIds`, 'must contain unique, existing performer IDs.');
      return { id, name, performerIds: ids };
    });
  })();
  const seenMoves = new Set<string>();
  const moves: Move[] = data.moves.map((value, index) => {
    const path = `moves[${index}]`;
    const move = object(value, path);
    const moveId = identifier(move.id, `${path}.id`);
    if (seenMoves.has(moveId)) invalid(`${path}.id`, `duplicates move ID "${moveId}".`);
    seenMoves.add(moveId);
    const fromSetId = identifier(move.fromSetId, `${path}.fromSetId`);
    const toSetId = identifier(move.toSetId, `${path}.toSetId`);
    if (fromSetId !== base.sets[index].id || toSetId !== base.sets[index + 1].id) {
      invalid(path, `must connect adjacent sets "${base.sets[index].id}" → "${base.sets[index + 1].id}" in timeline order; dangling, skipped or reversed endpoints are unsupported.`);
    }
    const counts = numeric(move.counts, `${path}.counts`, PROJECT_LIMITS.counts.min, PROJECT_LIMITS.counts.max, true);
    const moveTiming = timing(move, path);
    const rawPaths = object(move.paths, `${path}.paths`);
    const keys = Object.keys(rawPaths);
    if (keys.length > base.performers.length) invalid(`${path}.paths`, 'cannot contain more entries than the roster.');
    for (const key of keys) {
      if (!performerIds.has(key)) invalid(`${path}.paths.${key}`, 'references an unknown performer.');
    }
    const paths = Object.fromEntries(base.performers.filter(performer => Object.hasOwn(rawPaths, performer.id)).map(performer => {
      const performerPath = `${path}.paths.${performer.id}`;
      const raw = object(rawPaths[performer.id], performerPath);
      if (!Array.isArray(raw.segments) || raw.segments.length !== 1) {
        invalid(`${performerPath}.segments`, 'must contain one supported line segment. Multiple segments require a newer path implementation.');
      }
      const segmentPath = `${performerPath}.segments[0]`;
      const segment = object(raw.segments[0], segmentPath);
      if (segment.kind !== 'line') invalid(`${segmentPath}.kind`, 'is unsupported. Update Squidware before opening projects with curved, hold or other path segments.');
      const line: LinePathSegment = {
        id: identifier(segment.id, `${segmentPath}.id`), kind: 'line',
        startCount: numeric(segment.startCount, `${segmentPath}.startCount`, 0, 0, true),
        endCount: numeric(segment.endCount, `${segmentPath}.endCount`, counts, counts, true),
      };
      return [performer.id, { segments: [line] }];
    }));
    return { id: moveId, fromSetId, toSetId, counts, ...moveTiming, paths, ...(move.marchingDirections === undefined ? {} : { marchingDirections: validateMarchingDirections(move.marchingDirections, performerIds, `${path}.marchingDirections`) }) };
  });
  const { schemaVersion: _version, sets: checkedSets, ...common } = base;
  const project: Project = { schemaVersion: 2, ...common, ...(data.score === undefined ? {} : { score: validateScore(data.score) }), ...(data.meter === undefined ? {} : { meter: validateMeter(data.meter) }), ...(data.analysisRules === undefined ? {} : { analysisRules: validateAnalysisRules(data.analysisRules, new Set(base.sections.map(s => s.id))) }), ...(data.rehearsal === undefined ? {} : { rehearsal: validateRehearsal(data.rehearsal) }), ...(selectionGroups === undefined ? {} : { selectionGroups }), ...(data.snapping === undefined ? {} : { snapping: validateSnapSettings(data.snapping) }), sets: checkedSets.map(picture), moves, openingTiming: timing(data.openingTiming, 'openingTiming') };
  if (project.score) compileScore(project);
  return project;
}

/** Reads either supported wire version and always returns a canonical v2 object. */
export function parseProjectV2(content: string): ProjectV2 {
  assertSize(content);
  let input: unknown;
  try { input = JSON.parse(content.replace(/^\uFEFF/, '')); }
  catch { throw new Error('This is not valid JSON. Open a Squidware project (.squid) file.'); }
  const data = object(input, 'root');
  if (data.schemaVersion === 1) return migrateProjectV1(data);
  if (data.schemaVersion === 2) return validateProjectV2(data);
  return versionError(data.schemaVersion);
}

export function serializeProjectV2(project: ProjectV2): string {
  const content = `${JSON.stringify(validateProjectV2(project))}\n`;
  assertSize(content);
  return content;
}

/** Transitional oracle for compatibility checks; not a file downgrade command.
 * Only the supported single-line paths can reach this adapter through validation.
 */
export function projectV2AsLegacy(input: ProjectV2): LegacyProject {
  const checked = validateProjectV2(input);
  const { schemaVersion: _version, moves, openingTiming, sets, snapping: _snapping, selectionGroups: _groups, rehearsal: _rehearsal, analysisRules: _analysisRules, meter: _meter, score: _score, ...common } = checked;
  return { schemaVersion: 1, ...common, sets: legacySets(sets, moves, openingTiming) };
}
