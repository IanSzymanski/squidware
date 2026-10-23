import { PROJECT_LIMITS } from './projectValidation';
import type { Project, RehearsalAnchor, RehearsalFocus, RehearsalPassage } from './types';

const invalid = (path: string, reason: string): never => { throw new Error(`Invalid project: ${path} ${reason}`); };
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path, 'must be an object.');
  return value as Record<string, unknown>;
}
function id(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > PROJECT_LIMITS.text.id || ['__proto__', 'constructor', 'prototype'].includes(value)) invalid(path, 'must be a supported ID.');
  return value as string;
}
function text(value: unknown, path: string, max: number, empty = false): string {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) invalid(path, `must be ${empty ? '' : 'nonempty '}text of at most ${max} characters without unsupported control characters.`);
  return value as string;
}
function anchor(value: unknown, path: string): RehearsalAnchor {
  const a = object(value, path);
  if (a.kind === 'set') return { kind: 'set', setId: id(a.setId, `${path}.setId`) };
  if (a.kind !== 'move') invalid(`${path}.kind`, 'must be set or move.');
  if (typeof a.count !== 'number' || !Number.isFinite(a.count) || a.count < 0 || a.count > PROJECT_LIMITS.counts.max) invalid(`${path}.count`, `must be a finite count from 0 to ${PROJECT_LIMITS.counts.max}.`);
  return { kind: 'move', moveId: id(a.moveId, `${path}.moveId`), fromSetId: id(a.fromSetId, `${path}.fromSetId`), toSetId: id(a.toSetId, `${path}.toSetId`), count: a.count as number };
}
/** Missing references are retained, so deleting/reordering cannot silently retarget a passage. */
export function validateRehearsal(value: unknown): RehearsalPassage[] {
  if (!Array.isArray(value) || value.length > PROJECT_LIMITS.rehearsalPassages) invalid('rehearsal', `must contain 0 to ${PROJECT_LIMITS.rehearsalPassages} passages.`);
  const seen = new Set<string>();
  return (value as unknown[]).map((value, index) => {
    const path = `rehearsal[${index}]`, p = object(value, path), key = id(p.id, `${path}.id`);
    if (seen.has(key)) invalid(`${path}.id`, 'duplicates a passage ID.');
    seen.add(key);
    const f = object(p.focus, `${path}.focus`);
    let focus: RehearsalFocus;
    if (f.kind === 'all') focus = { kind: 'all' };
    else if (f.kind === 'section') focus = { kind: 'section', sectionId: id(f.sectionId, `${path}.focus.sectionId`) };
    else if (f.kind === 'performers') {
      if (!Array.isArray(f.performerIds) || !f.performerIds.length || f.performerIds.length > PROJECT_LIMITS.performers) invalid(`${path}.focus.performerIds`, 'must be a nonempty bounded list of performer IDs.');
      const performerIds = (f.performerIds as unknown[]).map((value, i) => id(value, `${path}.focus.performerIds[${i}]`));
      if (new Set(performerIds).size !== performerIds.length) invalid(`${path}.focus.performerIds`, 'must contain unique IDs.');
      focus = { kind: 'performers', performerIds };
    } else return invalid(`${path}.focus.kind`, 'must be all, section or performers.');
    return { id: key, name: text(p.name, `${path}.name`, PROJECT_LIMITS.text.setName), notes: text(p.notes, `${path}.notes`, PROJECT_LIMITS.text.notes, true),
      start: anchor(p.start, `${path}.start`), ...(p.end === undefined ? {} : { end: anchor(p.end, `${path}.end`) }), focus };
  });
}
const startCount = (project: Project, index: number) => project.moves.slice(0, index).reduce((sum, move) => sum + move.counts, 0);
export function resolveAnchor(project: Project, target: RehearsalAnchor): { count: number; label: string; error?: string } {
  if (target.kind === 'set') {
    const index = project.sets.findIndex(set => set.id === target.setId);
    return index < 0 ? { count: 0, label: 'Missing set', error: 'Target set was deleted. Choose a new target.' }
      : { count: startCount(project, index), label: `Set ${index + 1} · ${project.sets[index].name} · arrival` };
  }
  const index = project.moves.findIndex(move => move.id === target.moveId), move = project.moves[index];
  if (!move) return { count: 0, label: 'Missing move', error: 'Target move was deleted. Choose a new target.' };
  if (move.fromSetId !== target.fromSetId || move.toSetId !== target.toSetId) return { count: 0, label: 'Changed move', error: 'Move endpoints changed. Choose a new target.' };
  if (target.count > move.counts) return { count: 0, label: 'Count outside move', error: `Target count ${target.count} exceeds the move’s ${move.counts} counts. Choose a new count.` };
  return { count: startCount(project, index) + target.count, label: `Move to set ${index + 2} · ${project.sets[index + 1].name} · local count ${target.count}` };
}
export function anchorAtCount(project: Project, count: number): RehearsalAnchor {
  let start = 0;
  for (let i = 0; i < project.sets.length; i++) {
    if (Math.abs(count - start) < 1e-8) return { kind: 'set', setId: project.sets[i].id };
    const move = project.moves[i];
    if (move && count < start + move.counts) return { kind: 'move', moveId: move.id, fromSetId: move.fromSetId, toSetId: move.toSetId, count: count - start };
    if (move) start += move.counts;
  }
  return { kind: 'set', setId: project.sets.at(-1)!.id };
}
export function resolveFocus(project: Project, focus: RehearsalFocus) {
  if (focus.kind === 'all') return { ids: project.performers.map(p => p.id), label: 'Full ensemble' };
  if (focus.kind === 'section') {
    const section = project.sections.find(s => s.id === focus.sectionId);
    const ids = project.performers.filter(p => p.sectionId === focus.sectionId).map(p => p.id);
    return { ids, label: section?.name ?? 'Missing section', error: !section ? 'Focus section was deleted. Choose a new focus.' : !ids.length ? 'Focus section has no performers. Choose a new focus.' : undefined };
  }
  const existing = new Set(project.performers.map(p => p.id));
  const ids = focus.performerIds.filter(id => existing.has(id));
  return { ids, label: `${focus.performerIds.length} saved performers`, error: ids.length !== focus.performerIds.length ? 'Saved performers were deleted. Choose a new focus.' : undefined };
}
export function resolvePassage(project: Project, passage: RehearsalPassage) {
  const start = resolveAnchor(project, passage.start), end = passage.end ? resolveAnchor(project, passage.end) : undefined;
  const focus = resolveFocus(project, passage.focus);
  const error = start.error ?? end?.error ?? (end && end.count <= start.count ? 'Range end must follow its start. Choose new targets.' : undefined) ?? focus.error;
  return { start, end, focus, error };
}
export function activePassage(project: Project, id: string | null) { return project.rehearsal?.find(p => p.id === id); }
export function rehearsalBounds(project: Project, id: string | null) {
  const passage = activePassage(project, id), resolved = passage ? resolvePassage(project, passage) : undefined;
  return resolved && !resolved.error && resolved.end ? { start: resolved.start.count, end: resolved.end.count } : { start: 0, end: startCount(project, project.moves.length) };
}
