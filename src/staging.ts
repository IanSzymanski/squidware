import { PROJECT_LIMITS } from './projectValidation';
import { isFrontEnsembleModel, type FrontEnsembleModel } from './frontEnsemble';
import type { DrillSet, Point, Project, TimelineSample } from './types';

export const STAGING_LIMITS = { count: 64, name: 60, minSize: .1, maxSize: 40 };

export interface StagingObject { id: string; name: string; model?: FrontEnsembleModel; footprint?: 'circle' }
export interface StagingTransform extends Point {
  width: number; depth: number; height: number; angle: number; visible: boolean;
}
export interface StagingPose extends StagingTransform {
  /** Start and end fractions of the incoming move. Omission uses the full move. */
  travel?: { start: number; end: number };
}
export type StagingSample = StagingObject & StagingTransform;

function invalid(path: string, message: string): never {
  throw new Error(`Invalid project: ${path} ${message}`);
}
function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path, 'must be an object.');
  return value as Record<string, unknown>;
}
function number(value: unknown, low: number, high: number, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) {
    invalid(path, `must be a finite number from ${low} to ${high}.`);
  }
  return value;
}

export function validateStagingObjects(input: unknown, performerIds: ReadonlySet<string>): StagingObject[] | undefined {
  if (input === undefined) return;
  if (!Array.isArray(input) || input.length > STAGING_LIMITS.count) invalid('stagingObjects', `can contain up to ${STAGING_LIMITS.count} objects.`);
  const ids = new Set(performerIds);
  const objects = input.map((value, index): StagingObject => {
    const path = `stagingObjects[${index}]`;
    const { id, name, model, footprint } = record(value, path);
    if (typeof id !== 'string' || id.length > PROJECT_LIMITS.text.id || !/^[A-Za-z0-9_-]+$/.test(id)
      || ['__proto__', 'constructor', 'prototype'].includes(id) || ids.has(id)) invalid(`${path}.id`, 'must be a unique staging ID distinct from performer IDs.');
    if (typeof name !== 'string' || !name.trim() || name.length > STAGING_LIMITS.name || /[\u0000-\u001f]/.test(name)) {
      invalid(`${path}.name`, `must be a nonempty name of up to ${STAGING_LIMITS.name} characters without control characters.`);
    }
    if (model !== undefined && !isFrontEnsembleModel(model)) invalid(`${path}.model`, 'must be a supported front ensemble model.');
    if (footprint !== undefined && footprint !== 'circle') invalid(`${path}.footprint`, 'must be circle when specified.');
    ids.add(id);
    return { id, name: name.trim(), ...(model === undefined ? {} : { model }), ...(footprint === undefined ? {} : { footprint }) };
  });
  return objects.length ? objects : undefined;
}

export function validateStagingPoses(input: unknown, objects: readonly StagingObject[], field: Project['field'], path: string): DrillSet['staging'] {
  if (input === undefined && !objects.length) return;
  const raw = record(input, path);
  if (Object.keys(raw).length !== objects.length || objects.some(({ id }) => !Object.hasOwn(raw, id))) {
    invalid(path, 'must contain one pose for each staging object and no other IDs.');
  }
  if (!objects.length) return;
  return Object.fromEntries(objects.map(({ id }) => {
    const key = `${path}.${id}`;
    const value = record(raw[id], key);
    const { minSize, maxSize } = STAGING_LIMITS;
    const size = (dimension: string) => number(value[dimension], minSize, maxSize, `${key}.${dimension}`);
    const angle = number(value.angle, 0, 360, `${key}.angle`);
    if (angle === 360) invalid(`${key}.angle`, 'must be less than 360 degrees.');
    if (typeof value.visible !== 'boolean') invalid(`${key}.visible`, 'must be true or false.');
    let travel: StagingPose['travel'];
    if (value.travel !== undefined) {
      const range = record(value.travel, `${key}.travel`);
      const start = number(range.start, 0, 1, `${key}.travel.start`), end = number(range.end, 0, 1, `${key}.travel.end`);
      if (start >= end) invalid(`${key}.travel`, 'must end after it starts.');
      if (start !== 0 || end !== 1) travel = { start, end };
    }
    const pose: StagingPose = { x: number(value.x, 0, field.width, `${key}.x`), y: number(value.y, 0, field.height, `${key}.y`),
      width: size('width'), depth: size('depth'), height: size('height'), angle, visible: value.visible, ...(travel ? { travel } : {}) };
    return [id, pose];
  }));
}

const fullTravel = { start: 0, end: 1 };
function transform({ travel: _travel, ...pose }: StagingPose): StagingTransform { return pose; }
export function stagingTurn(from: number, to: number) {
  const delta = to - from;
  return Math.abs(delta) <= 180 ? delta : delta - Math.sign(delta) * 360;
}
export function stagingProgress(to: StagingPose, progress: number) {
  const { start, end } = to.travel ?? fullTravel;
  return Math.min(1, Math.max(0, (progress - start) / (end - start)));
}
export function interpolateStagingPose(from: StagingPose, to: StagingPose, progress: number): StagingTransform {
  if (progress >= 1) return transform(to);
  const t = stagingProgress(to, progress);
  if (t === 0) return transform(from);
  if (t === 1) return { ...transform(to), visible: from.visible };
  const lerp = (a: number, b: number) => a + (b - a) * t;
  const angle = from.angle + stagingTurn(from.angle, to.angle) * t;
  return { x: lerp(from.x, to.x), y: lerp(from.y, to.y), width: lerp(from.width, to.width),
    depth: lerp(from.depth, to.depth), height: lerp(from.height, to.height),
    angle: angle < 0 ? angle + 360 : angle >= 360 ? angle - 360 : angle, visible: from.visible };
}

export function sampleStaging(project: Project, { setIndex, progress }: Pick<TimelineSample, 'setIndex' | 'progress'>): StagingSample[] {
  const from = project.sets[setIndex - 1]?.staging;
  const to = project.sets[setIndex]?.staging;
  if (!to || !project.stagingObjects) return [];
  return project.stagingObjects.map(object => ({ ...object,
    ...(from ? interpolateStagingPose(from[object.id], to[object.id], progress) : transform(to[object.id])) }));
}

/** A new picture inherits placement and visibility, with a fresh incoming move. */
export function copyStaging(set: DrillSet): DrillSet['staging'] {
  return set.staging && Object.fromEntries(Object.entries(set.staging).map(([id, pose]) => [id, transform(pose)]));
}

/** Partition the original linear staging schedule, including stationary portions before and after travel. */
export function splitStaging(from: DrillSet, to: DrillSet, at: number) {
  const middle: Record<string, StagingPose> = {}, arrival: Record<string, StagingPose> = {};
  for (const [id, pose] of Object.entries(to.staging ?? {})) {
    const { start, end } = pose.travel ?? fullTravel;
    function range(offset: number, length: number): StagingPose['travel'] {
      const a = Math.max(0, (start - offset) / length), b = Math.min(1, (end - offset) / length);
      return a < b && (a !== 0 || b !== 1) ? { start: a, end: b } : undefined;
    }
    const first = range(0, at), second = range(at, 1 - at);
    middle[id] = { ...interpolateStagingPose(from.staging![id], pose, at), ...(first ? { travel: first } : {}) };
    arrival[id] = { ...transform(pose), ...(second ? { travel: second } : {}) };
  }
  return { middle, arrival };
}
