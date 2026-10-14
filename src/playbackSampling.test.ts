import { describe, expect, it } from 'vitest';
import { createPerformanceFixture } from './performanceFixtures';
import { sampleProject, sampleTimeline, setStartCount, totalCounts } from './domain';

describe('geometry-free playback sampling', () => {
  it('agrees with the shared position engine at every arrival, fractional move and endpoint', () => {
    const project = createPerformanceFixture('maximum');
    for (let index = 0; index < project.sets.length; index++) {
      const arrival = setStartCount(project, index);
      for (const count of [arrival, arrival - 0.1, arrival + 0.1]) {
        const { positions: _positions, ...timing } = sampleProject(project, count);
        expect(sampleTimeline(project, count)).toEqual(timing);
      }
    }
    for (const count of [NaN, Infinity, -10, totalCounts(project) + 100]) {
      const { positions: _positions, ...timing } = sampleProject(project, count);
      expect(sampleTimeline(project, count)).toEqual(timing);
    }
  });

  it('never reads roster positions when the clock or scrubber only needs timing', () => {
    const project = createPerformanceFixture('maximum');
    const guarded = { ...project, sets: project.sets.map(set => ({ ...set,
      get positions(): never { throw new Error('Clock must not interpolate geometry'); },
    })) };
    for (const count of [0, .1, 32, 32.1, totalCounts(project)]) expect(sampleTimeline(guarded, count).setIndex).toBeGreaterThanOrEqual(0);
  });
});
