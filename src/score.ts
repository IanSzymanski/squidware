import { clickAccent, DEFAULT_METER, validateMeter } from './meter';
import { PROJECT_LIMITS } from './projectValidation';
import type { Meter, ScoreMap } from './types';

export interface ScoreSource { meter?: Meter; score?: ScoreMap; moves: readonly { counts: number }[] }
export interface ScoreSpan { count: number; barStart: number; measure: number; meter: Meter }
export interface CompiledScore { spans: ScoreSpan[]; marks: ScoreMap['marks']; total: number }
export const defaultScore = (): ScoreMap => ({ firstMeasure: 1, pickupCounts: 0, changes: [], marks: [] });
const fail = (message: string): never => { throw new Error(`Score map: ${message}`); };
const integer = (value: unknown, min: number, max: number, label: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) fail(`${label} must be an integer from ${min} to ${max}.`);
  return value as number;
};
export function validateScore(input: unknown): ScoreMap {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('use a map with firstMeasure, pickupCounts, changes and marks.');
  const s = input as ScoreMap;
  const firstMeasure = integer(s.firstMeasure, 1, PROJECT_LIMITS.scoreMeasures, 'First full measure');
  const pickupCounts = integer(s.pickupCounts, 0, 31, 'Pickup counts');
  if (!Array.isArray(s.changes) || s.changes.length > PROJECT_LIMITS.scoreEvents || !Array.isArray(s.marks) || s.marks.length > PROJECT_LIMITS.scoreEvents) fail(`use at most ${PROJECT_LIMITS.scoreEvents} meter changes and rehearsal marks each.`);
  const bound = PROJECT_LIMITS.counts.max * (PROJECT_LIMITS.sets - 1);
  const changes = s.changes.map((c, i) => {
    if (!c || typeof c !== 'object') fail(`Meter change ${i + 1} needs a count and meter.`);
    return { count: integer(c.count, 1, bound, `Meter change ${i + 1} count`), meter: validateMeter(c.meter) };
  });
  const marks = s.marks.map((m, i) => {
    if (!m || typeof m !== 'object') fail(`Rehearsal mark ${i + 1} needs a count and label.`);
    if (typeof m.label !== 'string' || !m.label.trim() || m.label.length > PROJECT_LIMITS.text.groupName || /[\u0000-\u001f]/.test(m.label)) fail(`Rehearsal mark ${i + 1} needs a nonempty label of at most ${PROJECT_LIMITS.text.groupName} characters without control characters.`);
    return { count: integer(m.count, 0, bound, `Rehearsal mark ${i + 1} count`), label: m.label.trim() };
  });
  if (new Set(changes.map(c => c.count)).size !== changes.length) fail('two meter changes cannot share a count.');
  if (new Set(marks.map(m => m.count)).size !== marks.length) fail('combine rehearsal labels at the same count.');
  if (new Set(marks.map(m => m.label.toLowerCase())).size !== marks.length) fail('rehearsal labels must be unique.');
  return { firstMeasure, pickupCounts, changes: changes.sort((a,b)=>a.count-b.count), marks: marks.sort((a,b)=>a.count-b.count) };
}
/** Absolute drill counts remain denominator beats, at the written counts/minute.
 * A meter change starts a new bar; it cannot truncate a preceding bar or pickup. */
export function compileScore(source: ScoreSource): CompiledScore {
  const meter = validateMeter(source.meter ?? DEFAULT_METER), score = validateScore(source.score ?? defaultScore());
  const total = source.moves.reduce((sum, move) => sum + move.counts, 0);
  if (score.pickupCounts >= meter.numerator) fail(`Pickup counts must be smaller than the opening ${meter.numerator}-count bar.`);
  const spans: ScoreSpan[] = [{ count: 0, barStart: score.pickupCounts ? score.pickupCounts - meter.numerator : 0,
    measure: score.firstMeasure - (score.pickupCounts ? 1 : 0), meter }];
  for (const change of score.changes) {
    if (change.count > total) fail(`Meter change at count ${change.count} is beyond the show's ${total} counts. Remove or relocate it before shortening the show.`);
    const previous = spans.at(-1)!;
    const offset = change.count - previous.barStart;
    if (offset % previous.meter.numerator !== 0) {
      const next = previous.barStart + Math.ceil(offset / previous.meter.numerator) * previous.meter.numerator;
      fail(`Meter change at count ${change.count} is inside a bar. The next bar starts at count ${next}.`);
    }
    spans.push({ count: change.count, barStart: change.count, measure: previous.measure + offset / previous.meter.numerator, meter: change.meter });
  }
  for (const mark of score.marks) if (mark.count > total) fail(`Rehearsal mark “${mark.label}” at count ${mark.count} is beyond the show's ${total} counts. Remove or relocate it before shortening the show.`);
  return { spans, marks: score.marks, total };
}
export function scoreSpanAt(map: Pick<CompiledScore, 'spans'>, count: number): ScoreSpan {
  if (Math.abs(count - Math.round(count)) < 1e-8) count = Math.round(count);
  for (let i = map.spans.length - 1; i >= 0; i--) if (map.spans[i].count <= count) return map.spans[i];
  return map.spans[0];
}
export function scorePosition(map: CompiledScore, count: number) {
  if (!Number.isFinite(count) || count < 0 || count > map.total) return fail(`Count must be between 0 and ${map.total}.`);
  if (Math.abs(count - Math.round(count)) < 1e-8) count = Math.round(count);
  const span = scoreSpanAt(map, count), offset = count - span.barStart;
  return { measure: span.measure + Math.floor(offset / span.meter.numerator), beat: offset % span.meter.numerator + 1,
    meter: span.meter, mark: map.marks.filter(m => m.count <= count).at(-1)?.label ?? '' };
}
export function countForScore(map: CompiledScore, measure: number, beat: number): number {
  if (!Number.isInteger(measure) || !Number.isFinite(beat) || beat < 1) fail('Choose an integer measure and a beat of at least 1.');
  for (let i = map.spans.length - 1; i >= 0; i--) {
    const span = map.spans[i];
    if (beat >= span.meter.numerator + 1) continue;
    const count = span.barStart + (measure - span.measure) * span.meter.numerator + beat - 1;
    if (count >= span.count && (i === map.spans.length - 1 ? count <= map.total : count < map.spans[i + 1].count)) return count;
  }
  return fail(`Measure ${measure}, beat ${beat} is outside the written show or the pickup's available beats.`);
}
export function scoreLabel(map: CompiledScore, count: number): string {
  const p = scorePosition(map,count);
  return `M${p.measure} · beat ${Number(p.beat.toFixed(3))}`;
}
export function scoreAccent(count: number, spans: ScoreSpan[]): 'bar' | 'group' | 'beat' {
  const s = scoreSpanAt({spans},count);
  return clickAccent(count - s.barStart,s.meter);
}
/** Bounded labels at every zoom, even with 130,048 one-count measures. */
export function scoreTicks(map: CompiledScore, start: number, end: number, width: number) {
  const ticks: {count:number;label:string}[] = [];
  const spacing = Math.max(1,(end-start)/Math.max(1,Math.floor(width/85)));
  map.spans.forEach((span,i)=>{
    const high = Math.min(end,map.spans[i+1]?.count ?? map.total), low = Math.max(start,span.count);
    const stride = Math.max(1,Math.ceil(spacing/span.meter.numerator));
    let bar = Math.ceil((low-span.barStart)/span.meter.numerator/stride)*stride;
    for(let count=span.barStart+bar*span.meter.numerator;count<=high;bar+=stride,count=span.barStart+bar*span.meter.numerator) {
      if(count>=span.count && count>=start && (i===map.spans.length-1 || count<map.spans[i+1].count) && (!ticks.length || count-ticks.at(-1)!.count>=spacing*.75)) ticks.push({count,label:`M${span.measure+bar}`});
    }
  });
  return ticks;
}
