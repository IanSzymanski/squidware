import { PROJECT_LIMITS, validateLegacyProject } from '../projectValidation';
import type { FormationKind, OpeningTiming, Point, Project } from '../types';

export interface ShowTemplate {
  kind: 'show'; name: string; field: Project['field']; openingTiming: OpeningTiming;
  sections: { name: string; color: string; count: number }[];
}
export type FormationGeometry =
  | { kind: 'parametric'; shape: FormationKind; width: number; height: number; columns: number }
  | { kind: 'snapshot'; points: Point[] };
export interface FormationTemplate {
  kind: 'formation'; name: string; sourceCount: number;
  coordinateFrame: 'yards-relative-center'; geometry: FormationGeometry;
}
export type Template = ShowTemplate | FormationTemplate;
export interface TemplateLibrary { format: 'squidware-template-library'; version: 1; entries: Template[] }
export const TEMPLATE_LIMITS = { entries: 100, bytes: 1024 * 1024 } as const;

function invalid(path: string, reason: string): never { throw new Error(`Invalid template library: ${path} ${reason}`); }
function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(path, 'must be an object.');
  return value as Record<string, unknown>;
}
function text(value: unknown, path: string, max: number = PROJECT_LIMITS.text.title): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) invalid(path, `must be nonempty text of at most ${max} characters without control characters.`);
  return value;
}
function numeric(value: unknown, path: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) invalid(path, `must be ${integer ? 'an integer' : 'a finite number'} from ${min} to ${max}.`);
  return value;
}
function array(value: unknown, path: string, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) invalid(path, `must contain ${min} to ${max} items.`);
  return value;
}

/** An allowlist reconstruction: unknown metadata never survives import or export. */
export function validateTemplate(input: unknown): Template {
  const data = object(input, 'entry');
  const name = text(data.name, 'entry.name');
  if (data.kind === 'show') {
    const sections = array(data.sections, 'sections', 1, PROJECT_LIMITS.sections).map((value, i) => {
      const section = object(value, `sections[${i}]`);
      return { name: text(section.name, `sections[${i}].name`, PROJECT_LIMITS.text.sectionName),
        color: section.color, count: numeric(section.count, `sections[${i}].count`, 0, PROJECT_LIMITS.performers, true) };
    });
    if (sections.reduce((sum, section) => sum + section.count, 0) > PROJECT_LIMITS.performers) invalid('sections', `must total at most ${PROJECT_LIMITS.performers} performers.`);
    // Reuse the production field and color contract rather than inventing a new one.
    const defaults = validateLegacyProject({ schemaVersion: 1, id: 'template', title: name, ensemble: '',
      field: data.field, sections: sections.map((section, i) => ({ ...section, id: `section-${i}` })),
      performers: [], sets: [{ id: 'opening', name: 'Opening set', counts: 0, tempo: 120, transition: 'linear', notes: '', positions: {} }], audioOffsetSeconds: 0 });
    const timing = object(data.openingTiming, 'openingTiming');
    if (timing.transition !== 'linear' && timing.transition !== 'ease') invalid('openingTiming.transition', 'must be linear or ease.');
    return { kind: 'show', name, field: defaults.field,
      sections: defaults.sections.map((section, i) => ({ name: section.name, color: section.color, count: sections[i].count })),
      openingTiming: { tempo: numeric(timing.tempo, 'openingTiming.tempo', PROJECT_LIMITS.tempo.min, PROJECT_LIMITS.tempo.max), transition: timing.transition } };
  }
  if (data.kind !== 'formation') invalid('entry.kind', 'must be show or formation.');
  if (data.coordinateFrame !== 'yards-relative-center') invalid('coordinateFrame', 'must be yards-relative-center.');
  const sourceCount = numeric(data.sourceCount, 'sourceCount', 1, PROJECT_LIMITS.performers, true);
  const raw = object(data.geometry, 'geometry');
  let geometry: FormationGeometry;
  if (raw.kind === 'parametric') {
    if (!['line', 'arc', 'circle', 'block', 'curve'].includes(raw.shape as string)) invalid('geometry.shape', 'must be a supported formation shape.');
    geometry = { kind: 'parametric', shape: raw.shape as FormationKind,
      width: numeric(raw.width, 'geometry.width', .1, 200), height: numeric(raw.height, 'geometry.height', 0, 200),
      columns: numeric(raw.columns, 'geometry.columns', 1, PROJECT_LIMITS.performers, true) };
  } else if (raw.kind === 'snapshot') {
    geometry = { kind: 'snapshot', points: array(raw.points, 'geometry.points', sourceCount, sourceCount).map((value, i) => {
      const point = object(value, `geometry.points[${i}]`);
      return { x: numeric(point.x, `geometry.points[${i}].x`, -100, 100), y: numeric(point.y, `geometry.points[${i}].y`, -160 / 3, 160 / 3) };
    }).sort((a, b) => a.x - b.x || a.y - b.y) };
  } else invalid('geometry.kind', 'must be parametric or snapshot.');
  return { kind: 'formation', name, sourceCount, coordinateFrame: 'yards-relative-center', geometry };
}

export function validateTemplateLibrary(input: unknown): TemplateLibrary {
  const data = object(input, 'root');
  if (data.format !== 'squidware-template-library') invalid('format', 'must be squidware-template-library.');
  if (data.version !== 1) invalid('version', 'is unsupported. This app supports template library version 1; newer files may require an update to Squidware.');
  return { format: 'squidware-template-library', version: 1,
    entries: array(data.entries, 'entries', 0, TEMPLATE_LIMITS.entries).map(validateTemplate) };
}
function assertSize(content: string): void {
  if (content.length > TEMPLATE_LIMITS.bytes || new TextEncoder().encode(content).byteLength > TEMPLATE_LIMITS.bytes) invalid('file', 'exceeds the 1 MiB UTF-8 limit.');
}
export function parseTemplateLibrary(content: string): TemplateLibrary {
  assertSize(content);
  let value: unknown;
  try { value = JSON.parse(content); } catch { return invalid('file', 'must contain valid JSON.'); }
  return validateTemplateLibrary(value);
}
export function serializeTemplateLibrary(input: TemplateLibrary): string {
  const content = JSON.stringify(validateTemplateLibrary(input), null, 2) + '\n';
  assertSize(content);
  return content;
}
