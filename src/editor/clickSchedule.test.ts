import { describe, expect, it } from 'vitest';
import { ClickSchedule, clockDifference, countAt, secondsAt, tempoSpans } from './clickSchedule';
import type { ClickPlan, ScheduledClick } from './clickSchedule';
import { createDemoProject, parseProject, serializeProject } from '../domain';
import { createPerformanceFixture } from '../performanceFixtures';
import { clickAccent, DEFAULT_METER, validateMeter } from '../meter';
import { createEditorStore } from './store';

function plan(overrides: Partial<ClickPlan> = {}): ClickPlan {
  return { spans: [{ count: 0, seconds: 0, counts: 6, secondsPerCount: .5 }, { count: 6, seconds: 3, counts: 6, secondsPerCount: 1 }],
    meter: DEFAULT_METER, anchorTime: 10, seconds: 0, speed: 1, start: 0, end: 9, loop: false, clicks: true, ...overrides };
}
function render(p: ClickPlan, from: number, end: number) {
  const scheduler = new ClickSchedule(p, from), events: ScheduledClick[] = [];
  for (let time = from; time < end; time += 128 / 48000) events.push(...scheduler.until(Math.min(end, time + 128 / 48000)));
  return events;
}

describe('audio-thread click lookahead', () => {
  it('cues a recording start once after delayed confirmation without shifting following beats', () => {
    const p = plan({ seconds: 1.6, cue: { count: 3, time: 10.01 } });
    expect(render(p, 10, 11).map(e => [e.count,e.time])).toEqual([[3,10.01],[4,10.4],[5,10.9]]);
    const exact = plan({ seconds: 1.5, cue: { count: 3, time: 10.01 } });
    expect(render(exact, 10, 10.6).map(e => [e.count,e.time])).toEqual([[3,10.01],[4,10.5]]);
  });
  it('preserves queued loop-boundary clicks when the render and media clocks straddle the edge', () => {
    expect(clockDifference(.742, .002, .75, true)).toBeCloseTo(.01);
    expect(clockDifference(.002, .742, .75, true)).toBeCloseTo(.01);
    expect(clockDifference(.742, .002, .75, false)).toBeCloseTo(.74);
    expect(clockDifference(.5, .25, .75, true)).toBeCloseTo(.25);
  });
  it.each([.5,.75,1,1.25,1.5])('keeps exact beat times across tempo boundaries at %s× without rendering frames', speed => {
    const p = plan({ speed });
    const events = render(p, 10, 10 + 9 / speed + .01);
    expect(events.map(e => e.count)).toEqual(Array.from({ length: 13 }, (_, i) => i));
    for (const event of events) expect(event.time).toBeCloseTo(10 + (event.count <= 6 ? event.count * .5 : 3 + event.count - 6) / speed, 9);
  });
  it('uses global meter/grouping across moves and a 4/4 fallback without mutating old projects', () => {
    for (const [meter, expected] of [
      [{ numerator: 3, denominator: 4, grouping: [3] }, ['bar','beat','beat','bar','beat','beat']],
      [{ numerator: 6, denominator: 8, grouping: [3,3] }, ['bar','beat','beat','group','beat','beat']],
      [{ numerator: 7, denominator: 8, grouping: [2,2,3] }, ['bar','beat','group','beat','group','beat','beat']],
    ] as const) expect(Array.from({ length: expected.length }, (_, i) => clickAccent(i, { ...meter, grouping: [...meter.grouping] }))).toEqual(expected);
    const project = createDemoProject();
    expect(parseProject(serializeProject(project)).meter).toBeUndefined();
    expect(() => validateMeter({ numerator: 6, denominator: 8, grouping: [3,2] })).toThrow(/adding/);
    for (const invalid of [null, { numerator: 0 }, { numerator: 4, denominator: 3, grouping: [4] }, { numerator: 4, denominator: 4, grouping: [NaN] }]) expect(() => validateMeter(invalid)).toThrow();
  });
  it('lands a two-bar compound count-in on the requested count and does not repeat it at range loops', () => {
    const p = plan({ meter: { numerator: 6, denominator: 8, grouping: [3,3] }, anchorTime: 13, seconds: 1.5, start: 1.5, end: 3, loop: true,
      countIn: { startTime: 10, counts: 12, startCount: 3, secondsPerCount: .25 } });
    const events = render(p, 10, 16.1);
    expect(events.filter(e => e.phase === 'count-in').map(e => e.time)).toEqual(Array.from({ length: 12 }, (_, i) => 10 + i * .25));
    expect(events.filter(e => e.phase === 'count-in').map(e => e.accent)).toEqual(['bar','beat','beat','group','beat','beat','bar','beat','beat','group','beat','beat']);
    expect(events.filter(e => e.phase === 'show').map(e => [e.time,e.count])).toEqual([[13,3],[13.5,4],[14,5],[14.5,3],[15,4],[15.5,5],[16,3]]);
  });
  it('keeps fractional range boundaries, skips partial initial beats, and never doubles the loop edge', () => {
    const p = plan({ anchorTime: 0, seconds: .25, start: .25, end: 1.25, loop: true });
    expect(render(p, 0, 3).map(e => [e.time,e.count])).toEqual([[.25,1],[.75,2],[1.25,1],[1.75,2],[2.25,1],[2.75,2]]);
    expect(render(plan({ clicks: false, anchorTime: 0 }), 0, 10)).toEqual([]);
  });
  it('maps maximum-size tempo spans without creating one stored event per count', () => {
    const project = createPerformanceFixture('maximum'), spans = tempoSpans(project);
    expect(spans).toHaveLength(127);
    for (const count of [0, .25, 7, 16, 32, 64]) expect(countAt(spans, secondsAt(spans, count))).toBeCloseTo(count);
  });
  it('saves grouping with one undo action while rehearsal options do not dirty an unchanged production', () => {
    const store = createEditorStore(createDemoProject()), original = store.getState().project.present;
    store.dispatch('metronome.configure', { meter: DEFAULT_METER, enabled: true, countInBars: 1, speed: .75 });
    expect(store.getState().project.present).toBe(original);
    store.dispatch('metronome.configure', { meter: { numerator: 6, denominator: 8, grouping: [3,3] }, enabled: true, countInBars: 2, speed: 1.5 });
    expect(store.getState().project.past).toHaveLength(1);
    expect(store.getState().project.past[0].name).toBe('Edit production meter');
    const reopened = parseProject(serializeProject(store.getState().project.present));
    expect(reopened.meter).toEqual({ numerator: 6, denominator: 8, grouping: [3,3] });
    expect(reopened).not.toHaveProperty('countInBars');
    store.dispatch('history.undo'); expect(store.getState().project.present.meter).toBeUndefined();
    store.dispatch('history.redo'); expect(store.getState().project.present.meter).toEqual(reopened.meter);
    expect(store.dispatch('metronome.configure', { meter: DEFAULT_METER, enabled: true, countInBars: 3, speed: 1 })).toBe(false);
    expect(store.getState().playback.countInBars).toBe(2);
  });
});
