import { clickAccent } from '../meter';
import type { Meter, Project } from '../types';

export interface TempoSpan { count: number; seconds: number; counts: number; secondsPerCount: number }
export interface ClickPlan {
  spans: TempoSpan[]; meter: Meter; anchorTime: number; seconds: number; speed: number;
  start: number; end: number; loop: boolean; clicks: boolean;
  /** Before show time starts, counts are held and only these lead-in clicks run. */
  countIn?: { startTime: number; counts: number; startCount: number; secondsPerCount: number };
}
export interface ScheduledClick { time: number; count: number; accent: 'bar' | 'group' | 'beat'; phase: 'show' | 'count-in' }
export function tempoSpans(project: Project): TempoSpan[] {
  let count = 0, seconds = 0;
  return project.moves.map(move => {
    const span = { count, seconds, counts: move.counts, secondsPerCount: 60 / move.tempo };
    count += move.counts; seconds += move.counts * span.secondsPerCount;
    return span;
  });
}
export function countAt(spans: TempoSpan[], seconds: number): number {
  const span = spans.find(s => seconds < s.seconds + s.counts * s.secondsPerCount) ?? spans.at(-1);
  return span ? span.count + (seconds - span.seconds) / span.secondsPerCount : 0;
}
export function secondsAt(spans: TempoSpan[], count: number): number {
  const span = spans.find(s => count < s.count + s.counts) ?? spans.at(-1);
  return span ? span.seconds + (count - span.count) * span.secondsPerCount : 0;
}
/** Compare phase across a loop edge without mistaking a few milliseconds of
 * device skew for an entire range of drift and dropping its boundary click. */
export function clockDifference(predicted: number, actual: number, length: number, loop: boolean): number {
  if (!loop || length <= 0) return Math.abs(predicted - actual);
  const distance = ((predicted - actual) % length + length) % length;
  return Math.min(distance, length - distance);
}

/** A short rolling queue, driven by AudioWorklet render blocks, not UI timers.
 * Replacing the plan discards every queued click, including an active tail. */
export class ClickSchedule {
  private through: number;
  constructor(readonly plan: ClickPlan, from: number) { this.through = from; }
  until(endTime: number): ScheduledClick[] {
    const p = this.plan, from = this.through, events: ScheduledClick[] = [];
    this.through = endTime;
    if (endTime <= from || p.end <= p.start) return events;
    const lead = p.countIn;
    if (lead) {
      for (let i = 0; i < lead.counts; i++) {
        const time = lead.startTime + i * lead.secondsPerCount / p.speed;
        if (time >= from && time < endTime) events.push({ time, count: lead.startCount - lead.counts + i,
          accent: clickAccent(i, p.meter), phase: 'count-in' });
      }
    }
    const begin = Math.max(from, lead ? p.anchorTime : from);
    if (endTime <= begin || !p.clicks) return events;
    const length = p.end - p.start;
    const position = p.seconds + (begin - p.anchorTime) * p.speed;
    let cycle = p.loop ? Math.floor((position - p.start) / length) : 0;
    // Each window is 100ms; the loop is bounded by actual clicks at supported
    // tempos, even for one-count rehearsal ranges at maximum playback speed.
    for (;;) {
      const cycleOffset = p.loop ? cycle * length : 0;
      const low = Math.max(p.start, p.seconds + (begin - p.anchorTime) * p.speed - cycleOffset);
      const high = Math.min(p.end, p.seconds + (endTime - p.anchorTime) * p.speed - cycleOffset);
      if (high >= low) {
        const first = Math.ceil(countAt(p.spans, low) - 1e-8) || 0;
        const last = Math.floor(countAt(p.spans, high) + 1e-8);
        for (let count = first; count <= last; count++) {
          const seconds = secondsAt(p.spans, count);
          if (seconds < p.start - 1e-8 || seconds > p.end + 1e-8 || (p.loop && seconds >= p.end - 1e-8)) continue;
          const time = p.anchorTime + (seconds + cycleOffset - p.seconds) / p.speed;
          if (time >= begin - 1e-9 && time < endTime - 1e-9) events.push({ time, count, accent: clickAccent(count, p.meter), phase: 'show' });
        }
      }
      if (!p.loop || p.anchorTime + (p.end + cycleOffset - p.seconds) / p.speed >= endTime) break;
      cycle++;
    }
    return events;
  }
}
