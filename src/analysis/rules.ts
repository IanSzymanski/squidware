import { PROJECT_LIMITS } from '../projectValidation';
import type { AnalysisOverrides, AnalysisThresholds, DirectionRules, MarchingDirection, Performer, Project, ProjectAnalysisRules } from '../types';
export const DEFAULT_ANALYSIS_RULES: Readonly<AnalysisThresholds> = { minimumSpacing: 1, maximumStride: 1.25 };
export const MARCHING_DIRECTIONS = ['forward', 'backward', 'sideways'] as const;
const invalid = (path: string, message: string): never => { throw new Error(`Invalid project: ${path} ${message}`); };
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path, 'must be an object.');
  return value as Record<string, unknown>;
}
function overrides(value: unknown, path: string, required = false): AnalysisOverrides {
  const data = object(value, path), result: AnalysisOverrides = {};
  for (const key of ['minimumSpacing', 'maximumStride'] as const) {
    if (data[key] === undefined && !required) continue;
    const n = data[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < PROJECT_LIMITS.analysisThreshold.min || n > PROJECT_LIMITS.analysisThreshold.max) invalid(`${path}.${key}`, 'must be a finite number from 0.1 to 5.');
    result[key] = n as number;
  }
  return result;
}
function directions(value: unknown, path: string): DirectionRules {
  const data = object(value, path), result: DirectionRules = {};
  for (const key of Object.keys(data)) if (!MARCHING_DIRECTIONS.includes(key as MarchingDirection)) invalid(`${path}.${key}`, 'is an unsupported marching direction.');
  for (const key of MARCHING_DIRECTIONS) if (Object.hasOwn(data, key)) result[key] = overrides(data[key], `${path}.${key}`);
  return result;
}
export function validateAnalysisRules(value: unknown, sectionIds: ReadonlySet<string>): ProjectAnalysisRules {
  const data = object(value, 'analysisRules');
  const defaults = overrides(data.defaults, 'analysisRules.defaults', true) as AnalysisThresholds;
  const sections = data.sections === undefined ? undefined : (() => {
    if (!Array.isArray(data.sections) || data.sections.length > PROJECT_LIMITS.sections) invalid('analysisRules.sections', `must contain at most ${PROJECT_LIMITS.sections} section overrides.`);
    const seen = new Set<string>();
    return (data.sections as unknown[]).map((value, i) => {
      const path = `analysisRules.sections[${i}]`, s = object(value, path);
      if (typeof s.sectionId !== 'string' || !sectionIds.has(s.sectionId) || seen.has(s.sectionId)) invalid(`${path}.sectionId`, 'must reference a unique existing section.');
      seen.add(s.sectionId as string);
      return { sectionId: s.sectionId as string, ...overrides(s, path), ...(s.directions === undefined ? {} : { directions: directions(s.directions, `${path}.directions`) }) };
    });
  })();
  return { defaults, ...(data.directions === undefined ? {} : { directions: directions(data.directions, 'analysisRules.directions') }), ...(sections === undefined ? {} : { sections }) };
}
export function validateMarchingDirections(value: unknown, performerIds: ReadonlySet<string>, path: string): Record<string, MarchingDirection> {
  const data = object(value, path);
  if (Object.keys(data).length > PROJECT_LIMITS.performers) invalid(path, 'exceeds the roster limit.');
  for (const [key, value] of Object.entries(data)) if (!performerIds.has(key) || !MARCHING_DIRECTIONS.includes(value as MarchingDirection)) invalid(`${path}.${key}`, 'must assign forward, backward or sideways to an existing performer.');
  return Object.fromEntries([...performerIds].filter(id => Object.hasOwn(data, id)).map(id => [id, data[id] as MarchingDirection]));
}
export interface ResolvedAnalysisRules extends AnalysisThresholds { direction: MarchingDirection | 'unknown'; context: string }
/** Direction is an explicit move declaration, never an inference from the travel vector. */
export function resolveAnalysisRules(project: Project, moveIndex: number, performer: Performer, base?: Partial<AnalysisThresholds>): ResolvedAnalysisRules {
  const rules = project.analysisRules, section = rules?.sections?.find(s => s.sectionId === performer.sectionId);
  const direction = project.moves[moveIndex]?.marchingDirections?.[performer.id] ?? 'unknown';
  const resolved = { ...DEFAULT_ANALYSIS_RULES, ...rules?.defaults, ...base, ...section,
    ...(direction === 'unknown' ? {} : { ...rules?.directions?.[direction], ...section?.directions?.[direction] }) };
  const sectionName = project.sections.find(s => s.id === performer.sectionId)?.name ?? performer.sectionId;
  return { minimumSpacing: resolved.minimumSpacing, maximumStride: resolved.maximumStride, direction,
    context: `${sectionName} · ${direction === 'unknown' ? 'direction unknown' : `${direction} declared`}` };
}
export function strideRuleText(rule: ResolvedAnalysisRules): string {
  return ` Limit ${rule.maximumStride} yd/count (minimum ${Number((5 / rule.maximumStride).toFixed(2))} steps per 5 yd); ${rule.context}.`;
}
export function spacingRuleText(a: ResolvedAnalysisRules, b: ResolvedAnalysisRules): string {
  const context = a.context === b.context ? a.context : `${a.context} / ${b.context}`;
  return ` Minimum ${Math.max(a.minimumSpacing, b.minimumSpacing)} yd (${context}).`;
}
