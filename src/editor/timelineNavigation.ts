import { sampleTimeline, setStartCount, setTiming, totalCounts } from '../domain';
import type { Project } from '../types';

export const formatTimelineCount = (count: number) => String(Math.round(count * 1000) / 1000);

/** A count viewport, independent of tempos, geometry and saved production data. */
export function timelineWindow(duration: number, width: number, zoom: number, start: number) {
  const maxZoom = Math.max(1, duration * 24 / Math.max(1, width));
  const boundedZoom = Math.max(1, Math.min(maxZoom, zoom));
  const span = duration > 0 ? duration / boundedZoom : 1;
  return { zoom: boundedZoom, maxZoom, span, start: Math.max(0, Math.min(Math.max(0, duration - span), start)) };
}

export function timelineReadout(project: Project, count: number) {
  const bounded = Math.max(0, Math.min(totalCounts(project), count));
  const sample = sampleTimeline(project, bounded);
  const set = project.sets[sample.setIndex];
  return { ...sample, count: bounded, name: set.name, counts: setTiming(project, sample.setIndex).counts,
    arrival: setStartCount(project, sample.setIndex), opening: sample.setIndex === 0,
    arrived: sample.setIndex === 0 || sample.progress === 1 };
}

/** Prefer real set arrivals; add whole-count subdivisions only with room. */
export function timelineLabels(project: Project, start: number, span: number, width: number) {
  const duration = totalCounts(project), end = Math.min(duration, start + span);
  const candidates = new Map<number, number>();
  project.sets.forEach((_, index) => candidates.set(setStartCount(project, index), 1));
  candidates.set(0, 0); candidates.set(duration, 0);
  const desiredStep = Math.max(1, span * 64 / Math.max(1, width));
  const power = 10 ** Math.floor(Math.log10(desiredStep));
  const step = [1, 2, 5, 10].map(n => n * power).find(n => n >= desiredStep)!;
  for (let count = Math.ceil(start / step) * step; count <= end; count += step) {
    if (!candidates.has(count)) candidates.set(count, 2);
  }
  const selected: number[] = [];
  for (const [count] of [...candidates].filter(([c]) => c >= start && c <= end).sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
    if (selected.every(other => Math.abs(count - other) / span * width >= 48)) selected.push(count);
  }
  return selected.sort((a, b) => a - b);
}
