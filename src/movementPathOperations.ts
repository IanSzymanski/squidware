import { sampleMovement } from './movementPaths';
import type { Move, PathSegment, PerformerPath, Point, Project } from './types';

const EPSILON = 1e-8;
const same = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) <= EPSILON;
const clone = <T>(value: T): T => structuredClone(value);
export function rescalePaths(paths: Move['paths'], before: number, after: number): Move['paths'] {
  if (![before, after].every(n => Number.isFinite(n) && n > 0)) throw Error('Move durations must be positive finite counts.');
  const count = (n: number) => n === 0 ? 0 : n === before ? after : n / before * after;
  return Object.fromEntries(Object.entries(paths).map(([id, path]) => [id, { segments: path.segments.map(s => ({ ...clone(s), startCount: count(s.startCount), endCount: count(s.endCount) })) }]));
}
export interface ResolvedInterval { segment: PathSegment; from: Point; to: Point }
export function resolveIntervals(project: Project, index: number, performerId: string): ResolvedInterval[] {
  const move = project.moves[index], from = project.sets[index]?.positions[performerId], to = project.sets[index + 1]?.positions[performerId];
  if (!move || !from || !to) throw Error('Choose an existing move and performer.');
  let position = from;
  return (move.paths[performerId]?.segments ?? [{ id: 'implicit-line', kind: 'line', startCount: 0, endCount: move.counts } as const]).map(segment => {
    const arrival = segment.kind === 'hold' ? position : segment.to ?? to;
    const result = { segment: clone(segment), from: { ...position }, to: { ...arrival } }; position = arrival; return result;
  });
}
function canonicalSegments(segments: PathSegment[]): PerformerPath {
  const last = segments.reduce((at, s, i) => s.kind !== 'hold' ? i : at, -1);
  return { segments: segments.map((s, i) => { if (s.kind === 'hold' || i !== last) return s; const { to: _to, ...end } = s; return end; }) };
}
export function reversePaths(project: Project, index: number, ids: readonly string[]): Project {
  const move = project.moves[index];
  if (!move || !ids.length || new Set(ids).size !== ids.length || ids.some(id => !project.performers.some(p => p.id === id))) throw Error('Select existing performers explicitly before reversing.');
  const paths = { ...move.paths }, left = { ...project.sets[index].positions }, right = { ...project.sets[index + 1].positions };
  for (const id of ids) {
    if (paths[id]) paths[id] = canonicalSegments(resolveIntervals(project, index, id).reverse().map(({ segment: s, from }) => {
      const timing = { id: s.id, startCount: move.counts - s.endCount, endCount: move.counts - s.startCount };
      return s.kind === 'hold' ? { ...timing, kind: 'hold' } : s.kind === 'line' ? { ...timing, kind: 'line', to: from }
        : { ...timing, kind: 'cubic', to: from, control1: clone(s.control2), control2: clone(s.control1) };
    }));
    [left[id], right[id]] = [right[id], left[id]];
  }
  return { ...project, sets: project.sets.map((set, i) => i === index ? { ...set, positions: left } : i === index + 1 ? { ...set, positions: right } : set), moves: project.moves.map((m, i) => i === index ? { ...m, paths } : m) };
}
export interface MovementClipboard {
  id: string; epoch: number; sourceMoveId: string; sourcePerformerId: string; sourceLabel: string; sourceSetName: string;
  startCount: number; endCount: number; from: Point; to: Point; transition: Move['transition']; intervals: ResolvedInterval[];
}
export function copyIntervals(project: Project, index: number, performerId: string, segmentIds: readonly string[], wholeMove: boolean, id: string, epoch: number): MovementClipboard {
  const resolved = resolveIntervals(project, index, performerId), selected = new Set(segmentIds);
  if (!selected.size || selected.size !== segmentIds.length || segmentIds.some(id => !resolved.some(r => r.segment.id === id))) throw Error('Select existing intervals explicitly.');
  const indices = resolved.flatMap((r, i) => selected.has(r.segment.id) ? [i] : []), first = indices[0], last = indices.at(-1)!;
  if (indices.length !== last - first + 1) throw Error('Copy one contiguous interval range, including any intervening holds.');
  if (wholeMove && indices.length !== resolved.length) throw Error('Select every interval to include the whole move and its outer holds.');
  const move = project.moves[index];
  return clone({ id, epoch, sourceMoveId: move.id, sourcePerformerId: performerId, sourceLabel: project.performers.find(p => p.id === performerId)!.label, sourceSetName: project.sets[index + 1].name,
    startCount: wholeMove ? 0 : resolved[first].segment.startCount, endCount: wholeMove ? move.counts : resolved[last].segment.endCount,
    from: resolved[first].from, to: resolved[last].to, transition: move.transition, intervals: resolved.slice(first, last + 1) });
}
export type PasteFrame = 'field' | 'translate' | 'fit';
export interface PasteOptions { performerId: string; startCount: number; duration: number; frame: PasteFrame; seed: string; allowTargetTiming: boolean }
export function pasteIntervals(project: Project, index: number, clipboard: MovementClipboard, options: PasteOptions): { project: Project; replaced: number; scale: number; rotation: number } {
  const move = project.moves[index], { performerId: id, startCount: at, duration, frame, seed } = options;
  if (!move || !Number.isFinite(at) || !Number.isFinite(duration) || at < 0 || duration <= 0 || at + duration > move.counts) throw Error('Choose a positive paste duration inside this move.');
  if (!['field','translate','fit'].includes(frame) || !/^[A-Za-z0-9_-]{1,80}$/.test(seed)) throw Error('Choose a supported coordinate frame and operation identity.');
  if (clipboard.transition !== move.transition && !options.allowTargetTiming) throw Error('Review and accept destination easing before pasting between different timing profiles.');
  const resolved = resolveIntervals(project, index, id), from = project.sets[index].positions[id], to = project.sets[index + 1].positions[id], end = at + duration;
  const startPoint = sampleMovement(from, to, move.paths[id], at, move.counts, move.transition), endPoint = sampleMovement(from, to, move.paths[id], end, move.counts, move.transition);
  const sx = clipboard.to.x - clipboard.from.x, sy = clipboard.to.y - clipboard.from.y, tx = endPoint.x - startPoint.x, ty = endPoint.y - startPoint.y;
  const sourceSquared = sx * sx + sy * sy, targetSquared = tx * tx + ty * ty;
  let real = 1, imaginary = 0;
  if (frame === 'fit') {
    if (sourceSquared <= EPSILON ** 2) {
      if (targetSquared > EPSILON ** 2) throw Error('A closed or stationary fragment cannot fit different destination endpoints.');
    } else {
      if (targetSquared <= EPSILON ** 2) throw Error('Fitting would collapse this travel to a point. Choose a different window or coordinate frame.');
      real = (tx * sx + ty * sy) / sourceSquared; imaginary = (ty * sx - tx * sy) / sourceSquared;
    }
  }
  const transform = (point: Point): Point => frame === 'field' ? { ...point } : {
    x: startPoint.x + (point.x - clipboard.from.x) * real - (point.y - clipboard.from.y) * imaginary,
    y: startPoint.y + (point.x - clipboard.from.x) * imaginary + (point.y - clipboard.from.y) * real,
  };
  if (!same(transform(clipboard.from), startPoint) || !same(transform(clipboard.to), endPoint)) throw Error('Copied endpoints do not match this window. Choose Fit both endpoints or a compatible destination.');
  const mapped = (point: Point) => same(point, clipboard.from) ? { ...startPoint } : same(point, clipboard.to) ? { ...endPoint } : transform(point);
  const prefix: PathSegment[] = [], suffix: PathSegment[] = [];
  let replaced = 0;
  for (const [i, { segment: s, to: arrival }] of resolved.entries()) {
    const explicit: PathSegment = s.kind === 'hold' ? clone(s) : { ...clone(s), to: { ...arrival } };
    if (s.endCount <= at) prefix.push(explicit);
    else if (s.startCount >= end) suffix.push(explicit);
    else {
      if (s.kind !== 'hold' && (s.startCount < at || s.endCount > end)) throw Error('Paste boundaries cannot cut an existing travel interval. Use its boundaries, a hold/gap, or replace the whole move.');
      replaced++;
      if (s.kind === 'hold') {
        if (s.startCount < at) prefix.push({ ...s, endCount: at });
        if (s.endCount > end) suffix.push({ ...s, id: s.startCount < at ? `split-${seed}-${i}` : s.id, startCount: end });
      }
    }
  }
  const span = clipboard.endCount - clipboard.startCount;
  if (!(span > 0) || !Number.isFinite(span) || !clipboard.intervals.length) throw Error('The movement clipboard is empty or invalid.');
  const time = (n: number) => n === clipboard.startCount ? at : n === clipboard.endCount ? end : at + (n - clipboard.startCount) / span * duration;
  const inserted = clipboard.intervals.map(({ segment: s, to: arrival }, i): PathSegment => {
    const timing = { id: `paste-${seed}-${i}`, startCount: time(s.startCount), endCount: time(s.endCount) };
    return s.kind === 'hold' ? { ...timing, kind: 'hold' } : s.kind === 'line' ? { ...timing, kind: 'line', to: mapped(arrival) }
      : { ...timing, kind: 'cubic', to: mapped(arrival), control1: mapped(s.control1), control2: mapped(s.control2) };
  });
  const path = canonicalSegments([...prefix, ...inserted, ...suffix]);
  return { project: { ...project, moves: project.moves.map((m, i) => i === index ? { ...m, paths: { ...m.paths, [id]: path } } : m) }, replaced, scale: Math.hypot(real, imaginary), rotation: Math.atan2(imaginary, real) * 180 / Math.PI };
}
