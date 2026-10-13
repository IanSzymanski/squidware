import type { LegacyDrillSet, LegacyProject, Performer, Point, Section } from './types';

export const PROJECT_LIMITS = {
  performers: 500,
  sets: 128,
  sections: 64,
  projectBytes: 10 * 1024 * 1024,
  counts: { min: 1, max: 1024 },
  tempo: { min: 20, max: 400 },
  audioOffsetSeconds: { min: -3600, max: 3600 },
  text: { id: 128, title: 160, ensemble: 160, sectionName: 80, performerLabel: 32, performerName: 120, setName: 160, notes: 10_000 },
} as const;
const FIELD_HEIGHT_TOLERANCE = 0.001;
const defaultField: LegacyProject['field'] = { width: 100, height: 160 / 3, preset: 'college' };
/** Only immutable editor edits may reuse geometry from an already validated snapshot. */
export interface GeometryValidation { validatedPositions?: ReadonlySet<Record<string, Point>> }

function invalid(path: string, reason: string): never { throw new Error(`Invalid project: ${path} ${reason}`); }
function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(path, 'must be an object.');
  return value as Record<string, unknown>;
}
function string(value: unknown, path: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) invalid(path, `must be ${allowEmpty ? 'a' : 'a nonempty'} string of at most ${max} characters.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) invalid(path, 'contains unsupported control characters.');
  return value;
}
function number(value: unknown, path: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    invalid(path, `must be ${integer ? 'an integer' : 'a finite number'} from ${min} to ${max}.`);
  }
  return value;
}
function array(value: unknown, path: string, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) invalid(path, `must contain ${min} to ${max} items.`);
  return value;
}
function id(value: unknown, path: string): string {
  const result = string(value, path, PROJECT_LIMITS.text.id);
  if (!/^[A-Za-z0-9_-]+$/.test(result) || ['__proto__', 'constructor', 'prototype'].includes(result)) invalid(path, 'must use letters, numbers, underscores, or hyphens and cannot be a reserved key.');
  return result;
}

export function setCountLimits(index: number): { min: number; max: number } {
  return index === 0 ? { min: 0, max: 0 } : PROJECT_LIMITS.counts;
}

/** Validates editor patches using the same rules as file imports. Never clamps values. */
export function validateSetUpdate(update: Partial<LegacyDrillSet>, index: number): void {
  const path = `sets[${index}]`;
  const counts = setCountLimits(index);
  if (Object.hasOwn(update, 'counts')) number(update.counts, `${path}.counts`, counts.min, counts.max, true);
  if (Object.hasOwn(update, 'tempo')) number(update.tempo, `${path}.tempo`, PROJECT_LIMITS.tempo.min, PROJECT_LIMITS.tempo.max);
  if (Object.hasOwn(update, 'name')) string(update.name, `${path}.name`, PROJECT_LIMITS.text.setName);
  if (Object.hasOwn(update, 'notes')) string(update.notes, `${path}.notes`, PROJECT_LIMITS.text.notes, true);
  if (Object.hasOwn(update, 'transition') && update.transition !== 'linear' && update.transition !== 'ease') invalid(`${path}.transition`, 'must be linear or ease.');
}
function uniqueIds<T extends { id: string }>(items: T[], path: string): T[] {
  const seen = new Set<string>();
  items.forEach(item => {
    if (seen.has(item.id)) invalid(path, `contains duplicate ID "${item.id}".`);
    seen.add(item.id);
  });
  return items;
}

/** Rebuilds a bounded, canonical schema; unknown properties are discarded. */
export function validateLegacyProject(input: unknown, geometry: GeometryValidation = {}): LegacyProject {
  const data = object(input, 'root');
  if (data.schemaVersion !== 1) invalid('schemaVersion', 'must be 1. This file may require a newer version of Squidware.');
  const fieldData = object(data.field, 'field');
  if (fieldData.preset !== 'college' && fieldData.preset !== 'high-school') invalid('field.preset', 'must be college or high-school.');
  const width = number(fieldData.width, 'field.width', 100, 100);
  number(fieldData.height, 'field.height', defaultField.height - FIELD_HEIGHT_TOLERANCE, defaultField.height + FIELD_HEIGHT_TOLERANCE);
  const field: LegacyProject['field'] = { width, height: defaultField.height, preset: fieldData.preset };
  const sections = uniqueIds(array(data.sections, 'sections', 1, PROJECT_LIMITS.sections).map((item, index): Section => {
    const path = `sections[${index}]`;
    const section = object(item, path);
    const color = string(section.color, `${path}.color`, 7);
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) invalid(`${path}.color`, 'must be a six-digit hex color, such as #38bdf8.');
    return { id: id(section.id, `${path}.id`), name: string(section.name, `${path}.name`, PROJECT_LIMITS.text.sectionName), color };
  }), 'sections');
  const sectionIds = new Set(sections.map(section => section.id));
  const performers = uniqueIds(array(data.performers, 'performers', 0, PROJECT_LIMITS.performers).map((item, index): Performer => {
    const path = `performers[${index}]`;
    const performer = object(item, path);
    const sectionId = id(performer.sectionId, `${path}.sectionId`);
    if (!sectionIds.has(sectionId)) invalid(`${path}.sectionId`, `references unknown section "${sectionId}".`);
    return { id: id(performer.id, `${path}.id`), label: string(performer.label, `${path}.label`, PROJECT_LIMITS.text.performerLabel), name: string(performer.name, `${path}.name`, PROJECT_LIMITS.text.performerName, true), sectionId };
  }), 'performers');
  const performerIds = new Set(performers.map(performer => performer.id));
  const sets = uniqueIds(array(data.sets, 'sets', 1, PROJECT_LIMITS.sets).map((item, index): LegacyDrillSet => {
    const path = `sets[${index}]`;
    const set = object(item, path);
    const rawPositions = object(set.positions, `${path}.positions`);
    const positions = geometry.validatedPositions?.has(rawPositions as Record<string, Point>)
      ? rawPositions as Record<string, Point>
      : (() => {
        const keys = Object.keys(rawPositions);
        if (keys.length !== performers.length) invalid(`${path}.positions`, `must contain exactly one position for each of the ${performers.length} performers.`);
        keys.forEach(key => { if (!performerIds.has(key)) invalid(`${path}.positions`, `contains unknown performer "${key}".`); });
        return Object.fromEntries(performers.map(performer => {
          if (!Object.hasOwn(rawPositions, performer.id)) invalid(`${path}.positions`, `is missing performer "${performer.id}".`);
          const point = object(rawPositions[performer.id], `${path}.positions.${performer.id}`);
          return [performer.id, {
            x: number(point.x, `${path}.positions.${performer.id}.x`, 0, field.width),
            y: number(point.y, `${path}.positions.${performer.id}.y`, 0, field.height),
          }];
        }));
      })();
    if (set.transition !== 'linear' && set.transition !== 'ease') invalid(`${path}.transition`, 'must be linear or ease.');
    return {
      id: id(set.id, `${path}.id`), name: string(set.name, `${path}.name`, PROJECT_LIMITS.text.setName),
      counts: number(set.counts, `${path}.counts`, setCountLimits(index).min, setCountLimits(index).max, true),
      tempo: number(set.tempo, `${path}.tempo`, PROJECT_LIMITS.tempo.min, PROJECT_LIMITS.tempo.max), notes: string(set.notes, `${path}.notes`, PROJECT_LIMITS.text.notes, true), transition: set.transition, positions,
    };
  }), 'sets');
  return {
    schemaVersion: 1, id: id(data.id, 'id'), title: string(data.title, 'title', PROJECT_LIMITS.text.title), ensemble: string(data.ensemble, 'ensemble', PROJECT_LIMITS.text.ensemble, true),
    field, sections, performers, sets, audioOffsetSeconds: number(data.audioOffsetSeconds, 'audioOffsetSeconds', PROJECT_LIMITS.audioOffsetSeconds.min, PROJECT_LIMITS.audioOffsetSeconds.max),
  };
}

