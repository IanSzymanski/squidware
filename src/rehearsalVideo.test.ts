import { describe, expect, it } from 'vitest';
import { countToSeconds, createDemoProject, sampleProject, setStartCount } from './domain';
import { countAtVideoFrame, videoTiming } from './rehearsalVideo';

describe('rehearsal video timing', () => {
  it('uses the engine’s ramp and hold, and samples the exact final picture', () => {
    const base = createDemoProject();
    const endCount = setStartCount(base, 1);
    const project = { ...base, tempoMap: { version: 1 as const, regions: [{ startCount: 0, endCount, startTempo: 120, endTempo: 240 }], holds: [{ count: 4, seconds: 1 }] } };
    const fps = 24;
    const timing = videoTiming(project, 0, 1, fps);
    const heldFrame = Math.ceil((countToSeconds(project, 4) + .25) * fps);
    expect(countAtVideoFrame(project, timing, heldFrame, fps)).toBe(4);
    const last = countAtVideoFrame(project, timing, timing.frames - 1, fps);
    expect(last).toBeCloseTo(endCount, 8);
    expect(sampleProject(project, last).positions).toEqual(project.sets[1].positions);
  });

  it('starts excerpts at their set arrival on the aligned soundtrack timeline', () => {
    const base = createDemoProject();
    const count = setStartCount(base, 1);
    const project = { ...base, audioAnchors: [{ count, seconds: 11.25 }] };
    const timing = videoTiming(project, 1, 2, 30);
    expect(timing.start).toBeCloseTo(11.25, 8);
    expect(countAtVideoFrame(project, timing, 0, 30)).toBeCloseTo(count, 8);
    expect(countAtVideoFrame(project, timing, timing.frames - 1, 30)).toBeCloseTo(setStartCount(project, 2), 8);
  });
});
