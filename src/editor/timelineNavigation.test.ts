import { describe, expect, it } from 'vitest';
import { createDemoProject, sampleTimeline, setStartCount, totalCounts } from '../domain';
import { createPerformanceFixture } from '../performanceFixtures';
import { createEditorStore } from './store';
import { formatTimelineCount, timelineLabels, timelineReadout, timelineWindow } from './timelineNavigation';

describe('timeline count navigation', () => {
  it('shows the opening picture, fractional incoming counts, exact arrivals and the final boundary', () => {
    const project = createDemoProject();
    expect(timelineReadout(project, 0)).toMatchObject({ opening: true, arrived: true, setIndex: 0, localCount: 0, counts: 0 });
    const boundary = setStartCount(project, 1);
    expect(timelineReadout(project, boundary - .25)).toMatchObject({ setIndex: 1, localCount: boundary - .25, arrived: false });
    expect(timelineReadout(project, boundary)).toMatchObject({ setIndex: 1, localCount: boundary, arrived: true });
    expect(timelineReadout(project, boundary + .25)).toMatchObject({ setIndex: 2, localCount: .25, arrived: false });
    expect(timelineReadout(project, Infinity)).toMatchObject({ setIndex: project.sets.length - 1, arrived: true });
    expect(formatTimelineCount(3.125)).toBe('3.125');
  });
  it('steps by exactly one from fractional counts, pauses and clamps at both ends without editing the production', () => {
    const project = createDemoProject(), store = createEditorStore(project);
    const before = store.getState().project;
    for (const count of [0, .25, setStartCount(project, 1), totalCounts(project) - .25, totalCounts(project)]) {
      for (const direction of [-1, 1] as const) {
        store.dispatch('playback.scrub', { count }); store.setValue('playback', 'playing', true);
        const command = direction === -1 ? 'playback.count-previous' : 'playback.count-next';
        const enabled = direction < 0 ? count > 0 : count < totalCounts(project);
        expect(store.dispatch(command)).toBe(enabled);
        const next = Math.max(0, Math.min(totalCounts(project), count + direction));
        expect(store.getState().playback.count).toBe(next);
        if (enabled) expect(store.getState().playback.playing).toBe(false);
        expect(store.getState().selection.activeIndex).toBe(sampleTimeline(project, next).setIndex);
      }
    }
    expect(store.getState().project).toBe(before);
  });
  it('keeps every arrival in a 128-set show reachable at useful zoom, including one-count and long moves', () => {
    const project = createPerformanceFixture('maximum');
    project.moves.forEach((move, i) => { move.counts = i % 2 ? 1 : 1024; });
    const duration = totalCounts(project);
    for (let i = 0; i < project.sets.length; i++) {
      const arrival = setStartCount(project, i);
      const view = timelineWindow(duration, 450, Infinity, arrival - 3);
      expect(view.start).toBeLessThanOrEqual(arrival);
      expect(view.start + view.span + 1e-8).toBeGreaterThanOrEqual(arrival);
      expect(450 / view.span).toBeCloseTo(24);
      expect(timelineReadout(project, arrival).setIndex).toBe(i);
    }
  });
  it('prioritizes actual arrivals over subdivisions and keeps labels apart as zoom changes', () => {
    const project = createDemoProject(), duration = totalCounts(project);
    const arrival = setStartCount(project, 2);
    const labels = timelineLabels(project, arrival - 1, 8, 600);
    expect(labels).toContain(arrival);
    for (const span of [1, 8, 100, duration]) {
      const result = timelineLabels(project, 0, span, 450);
      expect(result[0]).toBe(0);
      result.slice(1).forEach((count, i) => expect((count - result[i]) / span * 450).toBeGreaterThanOrEqual(48));
    }
    expect(timelineWindow(0, 450, 20, 900)).toMatchObject({ start: 0, span: 1, zoom: 1 });
  });
});
