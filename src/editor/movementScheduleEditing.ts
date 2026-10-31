import { uid } from '../domain';
import { PROJECT_LIMITS } from '../projectValidation';
import type { PathSegment, PerformerPath, Point, Project } from '../types';

export interface ScheduleRow {
  id: string; kind: PathSegment['kind']; start: string; end: string;
  x: string; y: string; c1x: string; c1y: string; c2x: string; c2y: string;
}
export interface ScheduleEdit {
  moveId: string; performerId: string; path: PerformerPath | null;
  revision: number; epoch: number;
}
export function newScheduleRow(from: Point, to: Point, counts: number, start = '0'): ScheduleRow {
  return { id: uid(), kind: 'line', start, end: String(counts), x: String(to.x), y: String(to.y),
    c1x: String(from.x + (to.x - from.x) / 3), c1y: String(from.y + (to.y - from.y) / 3),
    c2x: String(from.x + (to.x - from.x) * 2 / 3), c2y: String(from.y + (to.y - from.y) * 2 / 3) };
}
export function scheduleRows(project: Project, index: number, id: string): ScheduleRow[] {
  const move = project.moves[index], from = project.sets[index].positions[id], to = project.sets[index + 1].positions[id];
  let previous = from;
  return (move.paths[id]?.segments ?? [{ id: uid(), kind: 'line', startCount: 0, endCount: move.counts } as const]).map(segment => {
    const end = segment.kind === 'hold' ? previous : segment.to ?? to;
    const row = { ...newScheduleRow(previous, end, segment.endCount, String(segment.startCount)), id: segment.id, kind: segment.kind };
    if (segment.kind === 'cubic') Object.assign(row, { c1x: String(segment.control1.x), c1y: String(segment.control1.y), c2x: String(segment.control2.x), c2y: String(segment.control2.y) });
    previous = end;
    return row;
  });
}
export function pathFromRows(rows: ScheduleRow[]): PerformerPath | null {
  if (!rows.length) return null;
  if (rows.length > PROJECT_LIMITS.pathSegments) throw new Error(`Use at most ${PROJECT_LIMITS.pathSegments} intervals per performer.`);
  const last = rows.reduce((last, row, i) => row.kind !== 'hold' ? i : last, -1);
  function number(value: string, label: string): number {
    if (!value.trim() || !Number.isFinite(Number(value))) throw new Error(`Enter a finite number for ${label}.`);
    return Number(value);
  }
  return { segments: rows.map((row, i): PathSegment => {
    if (!['line','cubic','hold'].includes(row.kind)) throw new Error(`Choose a supported movement for interval ${i + 1}.`);
    const label = `interval ${i + 1}`, common = { id: row.id, startCount: number(row.start, `${label} departure/start`), endCount: number(row.end, `${label} arrival/end`) };
    if (row.kind === 'hold') return { ...common, kind: 'hold' };
    const target = i === last ? {} : { to: { x: number(row.x, `${label} arrival X`), y: number(row.y, `${label} arrival Y`) } };
    return row.kind === 'cubic' ? { ...common, ...target, kind: 'cubic', control1: { x: number(row.c1x, `${label} control 1 X`), y: number(row.c1y, `${label} control 1 Y`) }, control2: { x: number(row.c2x, `${label} control 2 X`), y: number(row.c2y, `${label} control 2 Y`) } }
      : { ...common, ...target, kind: 'line' };
  }) };
}

/** Clone caller-owned geometry so later draft edits cannot mutate history. */
export function editMovementSchedule(project: Project, edit: ScheduleEdit): Project {
  const index = project.moves.findIndex(move => move.id === edit.moveId);
  if (index < 0 || !project.performers.some(p => p.id === edit.performerId)) throw new Error('Choose an existing move and performer.');
  const paths = { ...project.moves[index].paths };
  if (edit.path) paths[edit.performerId] = structuredClone(edit.path);
  else delete paths[edit.performerId];
  return { ...project, moves: project.moves.map((move, i) => i === index ? { ...move, paths } : move) };
}
