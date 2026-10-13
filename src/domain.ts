import type { DrillSet, FormationKind, FormationOptions, Performer, Point, Project, Section, TimelineSample, TransitionIssue } from './types';

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
const EPSILON = 1e-8;
const defaultField: Project['field'] = { width: 100, height: 160 / 3, preset: 'college' };
const defaultSections: Section[] = [
  { id: 'brass', name: 'Brass', color: '#c3e889' },
  { id: 'woodwinds', name: 'Woodwinds', color: '#b9a1e5' },
  { id: 'percussion', name: 'Percussion', color: '#85c9dd' },
  { id: 'guard', name: 'Guard', color: '#e3a08b' },
];

export function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `sq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const lerp = (a: number, b: number, progress: number) => a + (b - a) * progress;
const smoothstep = (t: number) => t * t * (3 - 2 * t);

function inverseSmoothstep(progress: number): number {
  let low = 0;
  let high = 1;
  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2;
    if (smoothstep(mid) < progress) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export function clampPoint(point: Point, field: Project['field']): Point {
  return { x: clamp(point.x, 0, field.width), y: clamp(point.y, 0, field.height) };
}

/** Fits a whole shape, preserving relative geometry instead of clipping its dots. */
export function fitFormationToField(points: Point[], field: Project['field']): Point[] {
  if (![field.width, field.height].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('Field dimensions must be positive finite numbers.');
  }
  if (!points.length) return [];
  if (!points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) {
    throw new Error('Formation positions must be finite numbers.');
  }
  const minimumX = Math.min(...points.map(point => point.x));
  const maximumX = Math.max(...points.map(point => point.x));
  const minimumY = Math.min(...points.map(point => point.y));
  const maximumY = Math.max(...points.map(point => point.y));
  const width = maximumX - minimumX;
  const height = maximumY - minimumY;
  if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error('Formation dimensions are too large.');
  const center = { x: minimumX + width / 2, y: minimumY + height / 2 };
  const scale = Math.min(1, width > 0 ? field.width / width : 1, height > 0 ? field.height / height : 1);
  const scaledMinimumX = center.x - width * scale / 2;
  const scaledMaximumX = center.x + width * scale / 2;
  const scaledMinimumY = center.y - height * scale / 2;
  const scaledMaximumY = center.y + height * scale / 2;
  const dx = scaledMinimumX < 0 ? -scaledMinimumX : scaledMaximumX > field.width ? field.width - scaledMaximumX : 0;
  const dy = scaledMinimumY < 0 ? -scaledMinimumY : scaledMaximumY > field.height ? field.height - scaledMaximumY : 0;
  return points.map(point => {
    const transformed = scale === 1
      ? { x: point.x + dx, y: point.y + dy }
      : { x: center.x + (point.x - center.x) * scale + dx, y: center.y + (point.y - center.y) * scale + dy };
    // Group bounds are already fitted; this only absorbs floating-point error
    // such as -3e-15 at a boundary, keeping serialized coordinates valid.
    return clampPoint(transformed, field);
  });
}

export function generateFormation(kind: FormationKind, count: number, options: FormationOptions): Point[] {
  if (!Number.isInteger(count) || count < 0 || count > PROJECT_LIMITS.performers) throw new Error(`Formation size must be an integer from 0 to ${PROJECT_LIMITS.performers}.`);
  if (![options.center.x, options.center.y, options.width, options.height, options.rotation, options.columns].every(Number.isFinite)) {
    throw new Error('Formation dimensions, center, rotation, and columns must be finite numbers.');
  }
  if (options.width < 0 || options.height < 0) throw new Error('Formation width and height cannot be negative.');
  if (!['line', 'arc', 'circle', 'block', 'curve'].includes(kind)) throw new Error('Unknown formation kind.');
  const radians = options.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const columns = clamp(Math.floor(options.columns), 1, Math.max(1, count));
  const rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    let x = 0;
    let y = 0;
    if (count > 1) {
      switch (kind) {
        case 'line': x = (t - 0.5) * options.width; break;
        case 'arc': {
          const angle = Math.PI * (1 - t);
          x = Math.cos(angle) * options.width / 2;
          y = Math.sin(angle) * options.height - options.height / 2;
          break;
        }
        case 'circle': {
          const angle = index / count * Math.PI * 2 - Math.PI / 2;
          x = Math.cos(angle) * options.width / 2;
          y = Math.sin(angle) * options.height / 2;
          break;
        }
        case 'block': {
          const column = index % columns;
          const row = Math.floor(index / columns);
          x = columns === 1 ? 0 : (column / (columns - 1) - 0.5) * options.width;
          y = rows === 1 ? 0 : (row / (rows - 1) - 0.5) * options.height;
          break;
        }
        case 'curve':
          x = (t - 0.5) * options.width;
          y = Math.sin((t - 0.5) * Math.PI * 2) * options.height / 2;
          break;
      }
    }
    return { x: options.center.x + x * cosine - y * sine, y: options.center.y + x * sine + y * cosine };
  });
}

export function transformPositions(
  positions: Record<string, Point>,
  ids: string[],
  transform: { dx?: number; dy?: number; rotation?: number; scale?: number },
  field: Project['field'],
): Record<string, Point> {
  const { dx = 0, dy = 0, rotation = 0, scale = 1 } = transform;
  if (![dx, dy, rotation, scale].every(Number.isFinite) || scale <= 0) throw new Error('Transforms require finite numbers and a positive scale.');
  const selected = [...new Set(ids)].filter(id => Object.hasOwn(positions, id));
  const result = Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { ...point }]));
  if (!selected.length) return result;
  if (rotation % 360 === 0 && scale === 1) {
    // A boundary stops the entire selection, preserving intervals and preventing
    // members from collapsing onto each other during a keyboard nudge.
    const selectedPoints = selected.map(id => positions[id]);
    const boundedDx = clamp(dx, -Math.min(...selectedPoints.map(point => point.x)), field.width - Math.max(...selectedPoints.map(point => point.x)));
    const boundedDy = clamp(dy, -Math.min(...selectedPoints.map(point => point.y)), field.height - Math.max(...selectedPoints.map(point => point.y)));
    selected.forEach(id => { result[id] = { x: positions[id].x + boundedDx, y: positions[id].y + boundedDy }; });
    return result;
  }
  const center = selected.reduce((sum, id) => ({ x: sum.x + positions[id].x / selected.length, y: sum.y + positions[id].y / selected.length }), { x: 0, y: 0 });
  const angle = rotation * Math.PI / 180;
  const transformed = selected.map(id => {
    const x = (positions[id].x - center.x) * scale;
    const y = (positions[id].y - center.y) * scale;
    return {
      x: center.x + x * Math.cos(angle) - y * Math.sin(angle) + dx,
      y: center.y + x * Math.sin(angle) + y * Math.cos(angle) + dy,
    };
  });
  fitFormationToField(transformed, field).forEach((point, index) => { result[selected[index]] = point; });
  return result;
}

export function createBlankProject(): Project {
  return {
    schemaVersion: 1, id: uid(), title: 'Untitled show', ensemble: 'My ensemble',
    field: { ...defaultField }, sections: defaultSections.map(section => ({ ...section })), performers: [],
    sets: [{ id: uid(), name: 'Opening set', counts: 0, tempo: 120, notes: '', transition: 'linear', positions: {} }],
    audioOffsetSeconds: 0,
  };
}

export function createDemoProject(): Project {
  const project = createBlankProject();
  project.title = 'Tidal forces';
  project.ensemble = 'Squidware Marching Ensemble';
  const sizes = [24, 24, 8, 8];
  project.performers = project.sections.flatMap((section, sectionIndex) => Array.from({ length: sizes[sectionIndex] }, (_, index) => ({
    id: `performer-${sectionIndex}-${index + 1}`, label: `${['B', 'W', 'P', 'G'][sectionIndex]}${index + 1}`,
    name: `${section.name} ${index + 1}`, sectionId: section.id,
  })));
  const center = { x: 50, y: 80 / 3 };
  const shapes: Point[][] = [
    generateFormation('block', 64, { center, width: 56, height: 28, rotation: 0, columns: 8 }),
    Array.from({ length: 64 }, (_, index) => {
      const row = Math.floor(index / 16);
      const angle = Math.PI * (index % 16) / 15;
      return { x: 50 - Math.cos(angle) * (34 - row * 4.5), y: 13 + Math.sin(angle) * (24 - row * 3.5) + row * 1.7 };
    }),
    Array.from({ length: 64 }, (_, index) => {
      const ring = Math.floor(index / 16);
      const angle = (index % 16) / 16 * Math.PI * 2 - Math.PI / 2;
      return { x: 50 + Math.cos(angle) * (31 - ring * 6), y: center.y + Math.sin(angle) * (21 - ring * 4) };
    }),
    generateFormation('block', 64, { center, width: 33, height: 25, rotation: 35, columns: 8 }),
    Array.from({ length: 64 }, (_, index) => {
      const row = Math.floor(index / 16);
      const t = (index % 16) / 15;
      return { x: 17 + t * 66, y: 17 + row * 6 + Math.sin(t * Math.PI * 2) * 5 };
    }),
    generateFormation('block', 64, { center: { x: 50, y: 37 }, width: 70, height: 15, rotation: 0, columns: 16 }),
  ];
  const names = ['The gathering', 'Tidal arc', 'Orbital motion', 'The prism', 'Standing wave', 'Final company'];
  project.sets = shapes.map((points, index) => ({
    id: uid(), name: names[index], counts: [0, 32, 32, 24, 32, 32][index],
    tempo: [132, 132, 144, 144, 152, 152][index], notes: [
      'Opening picture. Establish spacing and posture before the first move.',
      'Open the arc toward the front sideline. Keep intervals consistent.',
      'Four concentric orbits. Check crossing paths in the transition inspector.',
      'Rotate into the prism. Arrive together on count 24.',
      'Let the wave breathe. Maintain horizontal alignment through the phrase.',
      'Company front finish. Hold the final picture for the release.',
    ][index], transition: index === 2 || index === 4 ? 'ease' : 'linear',
    positions: Object.fromEntries(project.performers.map((performer, performerIndex) => [performer.id, points[performerIndex]])),
  }));
  return project;
}

export function totalCounts(project: Project): number {
  return project.sets.slice(1).reduce((sum, set) => sum + set.counts, 0);
}

/** The arrival count of a set; its transition starts at the previous set's arrival. */
export function setStartCount(project: Project, index: number): number {
  return project.sets.slice(1, clamp(Math.floor(index) + 1, 1, project.sets.length)).reduce((sum, set) => sum + set.counts, 0);
}

export function sampleProject(project: Project, count: number): TimelineSample {
  if (!project.sets.length) return { positions: {}, setIndex: 0, progress: 0, localCount: 0 };
  const boundedCount = clamp(Number.isFinite(count) ? count : 0, 0, totalCounts(project));
  if (boundedCount === 0 || project.sets.length === 1) {
    return { positions: Object.fromEntries(Object.entries(project.sets[0].positions).map(([id, point]) => [id, { ...point }])), setIndex: 0, progress: 0, localCount: 0 };
  }
  let start = 0;
  for (let index = 1; index < project.sets.length; index += 1) {
    const set = project.sets[index];
    if (boundedCount <= start + set.counts || index === project.sets.length - 1) {
      const localCount = clamp(boundedCount - start, 0, set.counts);
      const progress = set.counts ? localCount / set.counts : 1;
      const positionProgress = set.transition === 'ease' ? smoothstep(progress) : progress;
      const previous = project.sets[index - 1];
      return {
        positions: Object.fromEntries(project.performers.map(performer => {
          const from = previous.positions[performer.id];
          const to = set.positions[performer.id];
          return [performer.id, { x: lerp(from.x, to.x, positionProgress), y: lerp(from.y, to.y, positionProgress) }];
        })), setIndex: index, progress, localCount,
      };
    }
    start += set.counts;
  }
  throw new Error('Unable to sample an invalid show timeline.');
}

export function countToSeconds(project: Project, count: number): number {
  let remaining = clamp(Number.isFinite(count) ? count : 0, 0, totalCounts(project));
  let seconds = 0;
  for (const set of project.sets.slice(1)) {
    const used = Math.min(remaining, set.counts);
    seconds += used * 60 / set.tempo;
    remaining -= used;
    if (remaining <= 0) break;
  }
  return seconds;
}

export function secondsToCount(project: Project, seconds: number): number {
  let remaining = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  let count = 0;
  for (const set of project.sets.slice(1)) {
    const duration = set.counts * 60 / set.tempo;
    if (remaining <= duration) return count + remaining * set.tempo / 60;
    remaining -= duration;
    count += set.counts;
  }
  return count;
}

export function analyzeTransition(project: Project, setIndex: number): TransitionIssue[] {
  if (!Number.isInteger(setIndex) || setIndex < 1 || setIndex >= project.sets.length) return [];
  const destination = project.sets[setIndex];
  const previous = project.sets[setIndex - 1];
  const issues: TransitionIssue[] = [];
  const startCount = setStartCount(project, setIndex - 1);
  project.performers.forEach(performer => {
    const from = previous.positions[performer.id];
    const to = destination.positions[performer.id];
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const peakStride = distance / destination.counts * (destination.transition === 'ease' ? 1.5 : 1);
    if (peakStride > 1.25 + EPSILON) {
      issues.push({ type: 'stride', performerIds: [performer.id], severity: peakStride > 5 / 3 ? 'danger' : 'warning',
        message: `${performer.label}: ${distance.toFixed(1)} yards in ${destination.counts} counts; ${destination.transition === 'ease' ? 'peak ' : ''}${(5 / peakStride).toFixed(1)} steps per 5 yards.`,
        atCount: startCount + destination.counts / 2 });
    }
  });
  for (let a = 0; a < project.performers.length; a += 1) {
    const first = project.performers[a];
    const firstFrom = previous.positions[first.id];
    const firstTo = destination.positions[first.id];
    for (let b = a + 1; b < project.performers.length; b += 1) {
      const second = project.performers[b];
      const secondFrom = previous.positions[second.id];
      const secondTo = destination.positions[second.id];
      const rx = firstFrom.x - secondFrom.x;
      const ry = firstFrom.y - secondFrom.y;
      const vx = (firstTo.x - firstFrom.x) - (secondTo.x - secondFrom.x);
      const vy = (firstTo.y - firstFrom.y) - (secondTo.y - secondFrom.y);
      const velocitySquared = vx * vx + vy * vy;
      const closestProgress = velocitySquared < EPSILON ? 0 : clamp(-(rx * vx + ry * vy) / velocitySquared, 0, 1);
      const distance = Math.hypot(rx + vx * closestProgress, ry + vy * closestProgress);
      if (distance < 1 - EPSILON) {
        const timeProgress = destination.transition === 'ease' ? inverseSmoothstep(closestProgress) : closestProgress;
        const atCount = startCount + timeProgress * destination.counts;
        issues.push({ type: 'collision', performerIds: [first.id, second.id], severity: distance < 0.5 ? 'danger' : 'warning',
          message: `${first.label} / ${second.label}: ${distance.toFixed(2)} yards apart near count ${Number(atCount.toFixed(1))}.`, atCount });
      }
    }
  }
  return issues.sort((a, b) => (a.severity === b.severity ? (a.atCount ?? 0) - (b.atCount ?? 0) : a.severity === 'danger' ? -1 : 1));
}

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
export function validateSetUpdate(update: Partial<DrillSet>, index: number): void {
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
export function validateProject(input: unknown): Project {
  const data = object(input, 'root');
  if (data.schemaVersion !== 1) invalid('schemaVersion', 'must be 1. This file may require a newer version of Squidware.');
  const fieldData = object(data.field, 'field');
  if (fieldData.preset !== 'college' && fieldData.preset !== 'high-school') invalid('field.preset', 'must be college or high-school.');
  const width = number(fieldData.width, 'field.width', 100, 100);
  number(fieldData.height, 'field.height', defaultField.height - FIELD_HEIGHT_TOLERANCE, defaultField.height + FIELD_HEIGHT_TOLERANCE);
  const field: Project['field'] = { width, height: defaultField.height, preset: fieldData.preset };
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
  const sets = uniqueIds(array(data.sets, 'sets', 1, PROJECT_LIMITS.sets).map((item, index): DrillSet => {
    const path = `sets[${index}]`;
    const set = object(item, path);
    const rawPositions = object(set.positions, `${path}.positions`);
    const keys = Object.keys(rawPositions);
    if (keys.length !== performers.length) invalid(`${path}.positions`, `must contain exactly one position for each of the ${performers.length} performers.`);
    keys.forEach(key => { if (!performerIds.has(key)) invalid(`${path}.positions`, `contains unknown performer "${key}".`); });
    const positions = Object.fromEntries(performers.map(performer => {
      if (!Object.hasOwn(rawPositions, performer.id)) invalid(`${path}.positions`, `is missing performer "${performer.id}".`);
      const point = object(rawPositions[performer.id], `${path}.positions.${performer.id}`);
      return [performer.id, {
        x: number(point.x, `${path}.positions.${performer.id}.x`, 0, field.width),
        y: number(point.y, `${path}.positions.${performer.id}.y`, 0, field.height),
      }];
    }));
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

/** Validates an immutable editor edit against an already validated snapshot.
 * Unchanged set objects retain their validated geometry. Roster identity and
 * field-size changes invalidate that assumption and require a complete check.
 * File imports and serialization always use full validation.
 */
export function validateProjectEdit(previous: Project, next: Project): void {
  array(next.sets, 'sets', 1, PROJECT_LIMITS.sets);
  uniqueIds(next.sets, 'sets');
  const rosterChanged = next.performers.length !== previous.performers.length
    || next.performers.some((performer, index) => performer.id !== previous.performers[index].id);
  const dimensionsChanged = next.field.width !== previous.field.width || next.field.height !== previous.field.height;
  if (rosterChanged || dimensionsChanged) { validateProject(next); return; }
  // Retain the actual opening set first so count semantics do not depend on
  // the reduced validation array's indices. All later sets still require >0.
  const changedSets = next.sets.filter((set, index) => index === 0 || set !== previous.sets[index]);
  validateProject({ ...next, sets: changedSets });
}

export function parseProject(text: string): Project {
  assertProjectSize(text);
  let input: unknown;
  try { input = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error('This is not valid JSON. Open a Squidware project (.squid) file.'); }
  return validateProject(input);
}

export function serializeProject(project: Project): string {
  const content = `${JSON.stringify(validateProject(project))}\n`;
  assertProjectSize(content);
  return content;
}

function assertProjectSize(content: string): void {
  if (content.length > PROJECT_LIMITS.projectBytes || new TextEncoder().encode(content).byteLength > PROJECT_LIMITS.projectBytes) {
    throw new Error(`Project file is too large. The limit is ${PROJECT_LIMITS.projectBytes / 1024 / 1024} MiB of UTF-8 text.`);
  }
}

function parseCsv(text: string): string[][] {
  if (text.length > 2_000_000) throw new Error('Roster CSV is too large. The limit is 2 MB.');
  const source = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let closedQuote = false;
  const endCell = () => { row.push(cell); cell = ''; closedQuote = false; };
  const endRow = () => {
    endCell();
    if (row.some(value => value.trim() !== '')) rows.push(row);
    row = [];
    if (rows.length > PROJECT_LIMITS.performers + 1) throw new Error(`A roster can contain at most ${PROJECT_LIMITS.performers} performers.`);
  };
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') { cell += '"'; index += 1; }
        else { quoted = false; closedQuote = true; }
      } else cell += char;
    } else if (char === ',') endCell();
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      endRow();
    } else if (char === '"') {
      if (cell !== '' || closedQuote) throw new Error(`CSV row ${rows.length + 1}: quote must begin a field.`);
      quoted = true;
    } else if (closedQuote) {
      if (char !== ' ' && char !== '\t') throw new Error(`CSV row ${rows.length + 1}: unexpected text after closing quote.`);
    } else cell += char;
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  if (cell || row.length || closedQuote) endRow();
  return rows;
}

export function importRosterCsv(text: string, sections: Section[]): Performer[] {
  if (!sections.length) throw new Error('Create a section before importing a roster.');
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('CSV must contain a header and at least one performer. Use label,name,section.');
  const headers = rows[0].map(header => header.trim().toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error('CSV contains duplicate column headers.');
  const labelIndex = headers.indexOf('label');
  const nameIndex = headers.indexOf('name');
  const sectionIndex = headers.includes('section') ? headers.indexOf('section') : headers.indexOf('sectionid');
  if (labelIndex < 0) throw new Error('CSV must include a label column. Recommended header: label,name,section.');
  const seenLabels = new Set<string>();
  return rows.slice(1).map((row, index) => {
    const rowNumber = index + 2;
    if (row.length !== headers.length) throw new Error(`CSV row ${rowNumber}: expected ${headers.length} columns, found ${row.length}. Quote names containing commas.`);
    const label = row[labelIndex].trim();
    const name = nameIndex >= 0 ? row[nameIndex].trim() : '';
    const sectionName = sectionIndex >= 0 ? row[sectionIndex].trim() : '';
    if (!label || label.length > PROJECT_LIMITS.text.performerLabel) throw new Error(`CSV row ${rowNumber}: label must have 1 to ${PROJECT_LIMITS.text.performerLabel} characters.`);
    if (name.length > PROJECT_LIMITS.text.performerName) throw new Error(`CSV row ${rowNumber}: name must have at most ${PROJECT_LIMITS.text.performerName} characters.`);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(label + name)) throw new Error(`CSV row ${rowNumber}: label or name contains an unsupported control character.`);
    if (seenLabels.has(label.toLowerCase())) throw new Error(`CSV row ${rowNumber}: duplicate label "${label}".`);
    seenLabels.add(label.toLowerCase());
    const section = !sectionName ? sections[0] : sections.find(item => item.name.toLowerCase() === sectionName.toLowerCase() || item.id.toLowerCase() === sectionName.toLowerCase());
    if (!section) throw new Error(`CSV row ${rowNumber}: unknown section "${sectionName}". Available sections: ${sections.map(item => item.name).join(', ')}.`);
    return { id: uid(), label, name, sectionId: section.id };
  });
}

function csvCell(value: string | number): string {
  const raw = String(value);
  // Excel and LibreOffice can interpret formula-like strings even inside CSV quotes.
  const safe = typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function exportCoordinatesCsv(project: Project): string {
  const checked = validateProject(project);
  const rows: (string | number)[][] = [['Set', 'Arrival count', 'Move counts', 'Tempo', 'Label', 'Name', 'Section', 'X (yards)', 'Y (yards)', 'Coordinate', 'Notes']];
  const sectionNames = new Map(checked.sections.map(section => [section.id, section.name]));
  checked.sets.forEach((set, index) => checked.performers.forEach(performer => {
    const point = set.positions[performer.id];
    rows.push([set.name, setStartCount(checked, index), set.counts, set.tempo, performer.label, performer.name, sectionNames.get(performer.sectionId) ?? '', Number(point.x.toFixed(3)), Number(point.y.toFixed(3)), coordinateDescription(point, checked.field), set.notes]);
  }));
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function coordinateDescription(point: Point, field: Project['field']): string {
  const steps = (distance: number) => Number((Math.abs(distance) * 8 / 5).toFixed(2));
  const side = point.x <= field.width / 2 ? 1 : 2;
  const distanceFromGoal = side === 1 ? point.x : field.width - point.x;
  const yardLine = Math.round(distanceFromGoal / 5) * 5;
  const xDifference = distanceFromGoal - yardLine;
  const horizontal = Math.abs(xDifference) < 0.01
    ? `on the ${yardLine}-yard line`
    : `${steps(xDifference)} steps ${xDifference > 0 ? 'inside' : 'outside'} the ${yardLine}-yard line`;
  const hashOffset = field.preset === 'college' ? 20 : 160 / 9;
  const references = [
    { name: 'back sideline', y: 0 }, { name: 'back hash', y: Math.min(hashOffset, field.height / 2) },
    { name: 'front hash', y: Math.max(field.height - hashOffset, field.height / 2) }, { name: 'front sideline', y: field.height },
  ];
  const nearest = references.reduce((best, ref) => Math.abs(point.y - ref.y) < Math.abs(point.y - best.y) ? ref : best);
  const yDifference = point.y - nearest.y;
  const vertical = Math.abs(yDifference) < 0.01
    ? `on ${nearest.name}`
    : `${steps(yDifference)} steps ${yDifference > 0 ? 'in front of' : 'behind'} ${nearest.name}`;
  return `Side ${side}: ${horizontal}; ${vertical}`;
}
