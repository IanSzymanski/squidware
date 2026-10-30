import { validateAudioAnchors } from './audioAlignment';
import type { Project, TempoMap } from './types';
import { PROJECT_LIMITS } from './projectValidation';

export interface TempoSpan {
  count: number; seconds: number; counts: number; secondsPerCount: number;
  tempo?: number; endTempo?: number; holdSeconds?: number;
}
export interface CompiledTempo { spans: TempoSpan[]; totalCounts: number; totalSeconds: number }
const cache = new WeakMap<Project, CompiledTempo>();
const maxCount = PROJECT_LIMITS.counts.max * (PROJECT_LIMITS.sets - 1);
function object(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function number(value: unknown, label: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value)) throw Error(`${label} must be ${integer ? 'a whole number' : 'finite'} from ${min} to ${max}.`);
  return value;
}
export function validateTempoMap(input: unknown, total = maxCount): TempoMap {
  const data = object(input, 'tempoMap');
  if (data.version !== 1) throw Error('Unsupported tempoMap version. Update Squidware before opening this project.');
  for (const key of ['regions', 'holds']) if (!Array.isArray(data[key]) || data[key].length > PROJECT_LIMITS.tempoEvents) throw Error(`tempoMap.${key} must contain at most ${PROJECT_LIMITS.tempoEvents} events.`);
  const regions = (data.regions as unknown[]).map((raw, i) => {
    const r = object(raw, `tempoMap region ${i + 1}`), label = `tempoMap region ${i + 1}`;
    const startCount = number(r.startCount, `${label} start count`, 0, total, true), endCount = number(r.endCount, `${label} end count`, 1, total, true);
    if (endCount <= startCount) throw Error(`${label} must end after its start count.`);
    return { startCount, endCount, startTempo: number(r.startTempo, `${label} start BPM`, PROJECT_LIMITS.tempo.min, PROJECT_LIMITS.tempo.max), endTempo: number(r.endTempo, `${label} end BPM`, PROJECT_LIMITS.tempo.min, PROJECT_LIMITS.tempo.max) };
  }).sort((a, b) => a.startCount - b.startCount);
  for (let i = 1; i < regions.length; i++) if (regions[i].startCount < regions[i - 1].endCount) throw Error('tempoMap regions cannot overlap. Adjacent regions are allowed.');
  const holds = (data.holds as unknown[]).map((raw, i) => {
    const h = object(raw, `tempoMap fermata ${i + 1}`);
    return { count: number(h.count, `tempoMap fermata ${i + 1} count`, 0, Math.max(0, total - 1), true), seconds: number(h.seconds, `tempoMap fermata ${i + 1} seconds`, .001, PROJECT_LIMITS.holdSeconds) };
  }).sort((a, b) => a.count - b.count);
  if (holds.length && total === 0) throw Error('Add a move before adding a fermata.');
  for (let i = 1; i < holds.length; i++) if (holds[i].count === holds[i - 1].count) throw Error('tempoMap fermatas must use distinct counts.');
  return { version: 1, regions, holds };
}
export function spanSeconds(span: TempoSpan, counts = span.counts): number {
  if (span.holdSeconds !== undefined) return span.holdSeconds;
  const tempo = span.tempo ?? 60 / span.secondsPerCount, delta = (span.endTempo ?? tempo) - tempo;
  if (Math.abs(delta) < 1e-10) return counts * 60 / tempo;
  const slope = delta / span.counts;
  return 60 / slope * Math.log1p(slope * counts / tempo);
}
function spanCount(span: TempoSpan, seconds: number): number {
  if (span.holdSeconds !== undefined) return 0;
  const tempo = span.tempo ?? 60 / span.secondsPerCount, delta = (span.endTempo ?? tempo) - tempo;
  if (Math.abs(delta) < 1e-10) return seconds * tempo / 60;
  const slope = delta / span.counts;
  return tempo / slope * Math.expm1(seconds * slope / 60);
}
/** Immutable project snapshots are cache keys; callers replace a snapshot when editing its timing. */
export function compileTempo(project: Project): CompiledTempo {
  const known = cache.get(project); if (known) return known;
  const totalCounts = project.moves.reduce((sum, m) => sum + m.counts, 0);
  const map = project.tempoMap ? validateTempoMap(project.tempoMap, totalCounts) : { regions: [], holds: [] };
  const cuts = new Set([0, totalCounts]); let count = 0;
  const moves = project.moves.map(m => { const start = count; count += m.counts; cuts.add(count); return { ...m, start }; });
  map.regions.forEach(r => { cuts.add(r.startCount); cuts.add(r.endCount); }); map.holds.forEach(h => cuts.add(h.count));
  const anchors = validateAudioAnchors(project.audioAnchors ?? [], totalCounts);
  anchors.forEach(a => cuts.add(a.count));
  const sorted = [...cuts].sort((a, b) => a - b), spans: TempoSpan[] = []; let seconds = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i], end = sorted[i + 1], move = moves.find(m => start < m.start + m.counts)!;
    const region = map.regions.find(r => r.startCount <= start && start < r.endCount);
    const bpm = (at: number) => region ? region.startTempo + (region.endTempo - region.startTempo) * (at - region.startCount) / (region.endCount - region.startCount) : move.tempo;
    const tempo = bpm(start), hold = map.holds.find(h => h.count === start);
    if (hold) { spans.push({ count: start, seconds, counts: 0, secondsPerCount: 60 / tempo, tempo, holdSeconds: hold.seconds }); seconds += hold.seconds; }
    const span = { count: start, seconds, counts: end - start, secondsPerCount: 60 / tempo, tempo, endTempo: bpm(end) };
    spans.push(span); seconds += spanSeconds(span);
  }
  // Each cut includes anchor counts, so no span crosses a warp boundary.
  // Scale nominal elapsed time, including fermatas, between successive anchors.
  const knots = [{ count: 0, seconds: 0 }, ...anchors].map(a => ({ ...a, nominal: secondsAt(spans, a.count) }));
  const scales = knots.slice(1).map((k, i) => (k.seconds - knots[i].seconds) / (k.nominal - knots[i].nominal));
  if (scales.some(scale => !Number.isFinite(scale) || scale < .05 || scale > 20)) throw Error('Audio alignment intervals must be between 0.05× and 20× their written duration. Check the counts and recording times.');
  const aligned = anchors.length ? spans.map(span => {
    const index = Math.max(0, knots.findIndex(k => k.count > span.count) - 1);
    const segment = span.count >= knots.at(-1)!.count ? knots.length - 1 : index;
    const knot = knots[segment], scale = scales[Math.min(segment, scales.length - 1)];
    return { ...span, seconds: knot.seconds + (span.seconds - knot.nominal) * scale,
      secondsPerCount: span.secondsPerCount * scale,
      ...(span.tempo === undefined ? {} : { tempo: span.tempo / scale, endTempo: (span.endTempo ?? span.tempo) / scale }),
      ...(span.holdSeconds === undefined ? {} : { holdSeconds: span.holdSeconds * scale }) };
  }) : spans;
  const result = { spans: aligned, totalCounts, totalSeconds: aligned.length ? aligned.at(-1)!.seconds + spanSeconds(aligned.at(-1)!) : 0 };
  cache.set(project, result); return result;
}
export function secondsAt(spans: TempoSpan[], count: number): number {
  const hold = spans.find(s => s.holdSeconds !== undefined && s.count === count);
  if (hold) return hold.seconds; // Arrival is the beginning of the fermata.
  const span = spans.find(s => s.counts > 0 && count < s.count + s.counts) ?? [...spans].reverse().find(s => s.counts > 0);
  return span ? span.seconds + spanSeconds(span, count - span.count) : 0;
}
export function countAt(spans: TempoSpan[], seconds: number): number {
  const span = spans.find(s => seconds < s.seconds + spanSeconds(s)) ?? spans.at(-1);
  return span ? span.count + spanCount(span, seconds - span.seconds) : 0;
}
export function tempoAt(project: Project, count: number): number {
  const spans = compileTempo(project).spans;
  const span = spans.find(s => s.counts > 0 && count < s.count + s.counts) ?? spans.at(-1);
  if (!span) return project.openingTiming.tempo;
  const start = span.tempo ?? 60 / span.secondsPerCount;
  return start + ((span.endTempo ?? start) - start) * Math.max(0, Math.min(1, (count - span.count) / span.counts));
}
export function holdAt(project: Project, seconds: number) {
  const span = compileTempo(project).spans.find(s => s.holdSeconds !== undefined && seconds >= s.seconds && seconds < s.seconds + s.holdSeconds);
  return span ? { count: span.count, remaining: span.seconds + span.holdSeconds! - seconds } : null;
}
export function moveTempoText(project: Project, index: number): string {
  if (index === 0) return `${project.openingTiming.tempo} BPM`;
  const start = project.moves.slice(0, index - 1).reduce((n, m) => n + m.counts, 0), end = start + project.moves[index - 1].counts;
  const regions = project.tempoMap?.regions.filter(r => r.startCount < end && r.endCount > start) ?? [];
  const holds = project.tempoMap?.holds.filter(h => h.count >= start && h.count < end) ?? [];
  if (!regions.length && !holds.length) return `${project.moves[index - 1].tempo} BPM`;
  return [`Base ${project.moves[index - 1].tempo} BPM`, ...regions.map(r => `${r.startCount}–${r.endCount}: ${r.startTempo === r.endTempo ? r.startTempo : `${r.startTempo}→${r.endTempo}`} BPM`), ...holds.map(h => `Hold ${h.count}: ${h.seconds}s`)].join(' · ');
}
