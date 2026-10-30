import { expect, it } from 'vitest';
import { countToSeconds, createDemoProject, exportCoordinatesCsv, parseProject, sampleProject, secondsToCount, serializeProject } from './domain';
import { compileTempo, holdAt } from './tempo';
import { validateAudioAnchors } from './audioAlignment';
import { audioAnchorText, parseAudioAnchorText } from './editor/audioAnchorText';
import { createEditorStore } from './editor/store';
import { ClickSchedule, tempoSpans } from './editor/clickSchedule';
import { RehearsalClock } from './editor/rehearsalClock';
import { splitTransition } from './editor/splitTransition';
import { projectV2AsLegacy } from './projectV2';

function fixture() {
  const p = createDemoProject(); p.sets = p.sets.slice(0, 3);
  p.moves = p.moves.slice(0, 2).map(m => ({ ...m, counts: 16, tempo: 120, transition: 'linear' as const, paths: {} }));
  return { ...p, audioOffsetSeconds: .4, audioAnchors: [{ count: 8, seconds: 5 }, { count: 16, seconds: 9 }, { count: 24, seconds: 15 }] };
}
it('aligns known variable-tempo arrivals, interpolates elapsed time and extrapolates the final interval', () => {
  const p = fixture();
  for (const [count, seconds] of [[0, 0], [4, 2.5], [8, 5], [12, 7], [16, 9], [20, 12], [24, 15], [28, 18], [32, 21]]) {
    expect(countToSeconds(p, count)).toBeCloseTo(seconds, 12);
    expect(secondsToCount(p, seconds)).toBeCloseTo(count, 12);
  }
  for (let c = 0; c <= 32; c += .125) {
    expect(secondsToCount(p, countToSeconds(p, c))).toBeCloseTo(c, 10);
    expect(sampleProject(p, c)).toEqual(sampleProject({ ...p, audioAnchors: undefined }, c));
  }
  const split = splitTransition(p, { moveId: p.moves[0].id, count: 5 });
  for (const c of [0, 4, 5, 8, 14, 16, 24, 32]) expect(countToSeconds(split, c)).toBeCloseTo(countToSeconds(p, c), 10);
});
it('preserves the analytic shape of ramps and scales fermatas, including anchors on held counts', () => {
  const p = { ...fixture(), tempoMap: { version: 1 as const, regions: [{ startCount: 0, endCount: 16, startTempo: 120, endTempo: 240 }], holds: [{ count: 8, seconds: 2 }] } };
  const first = 8 * Math.log(1.5), second = 8 * Math.log(2 / 1.5) + 2;
  expect(countToSeconds(p, 4)).toBeCloseTo(8 * Math.log(1.25) * 5 / first, 11);
  expect(countToSeconds(p, 12)).toBeCloseTo(5 + (2 + 8 * Math.log(1.75 / 1.5)) * 4 / second, 11);
  const hold = 2 * 4 / second;
  expect(holdAt(p, 5 + hold / 2)?.remaining).toBeCloseTo(hold / 2, 11);
  expect(secondsToCount(p, 5 + hold / 2)).toBe(8);
  for (let c = 0; c <= 32; c += .125) expect(secondsToCount(p, countToSeconds(p, c))).toBeCloseTo(c, 9);
});
it('shares aligned seeks, offset, speeds, loops and fallback with the authoritative media clock and beat scheduler', () => {
  const p = fixture(); let now = 0;
  const media = { currentTime: 0, duration: 60, readyState: 4, paused: true, ended: false, seeking: false, error: null, playbackRate: 1,
    play: async () => { media.paused = false; }, pause: () => { media.paused = true; }, load() {} };
  const clock = new RehearsalClock({ totalSeconds: 21, rangeStart: 5, rangeEnd: 15, offset: .4, media, now: () => now });
  clock.update({ playing: true, speed: .75, loop: true }, countToSeconds(p, 8)); expect(media.currentTime).toBeCloseTo(5.4);
  media.currentTime = 9.4; now = 7; expect(secondsToCount(p, clock.sample().seconds)).toBeCloseTo(16);
  clock.update({ playing: true, speed: 1.5, loop: true }); expect(media.playbackRate).toBe(1.5);
  media.currentTime = 15.4; now = 11; expect(clock.sample().seconds).toBeCloseTo(5); expect(media.currentTime).toBeCloseTo(5.4);
  for (const speed of [.5, .75, 1, 1.25, 1.5]) {
    const schedule = new ClickSchedule({ spans: tempoSpans(p), meter: { numerator: 4, denominator: 4, grouping: [4] }, anchorTime: 0, seconds: 0, speed, start: 0, end: 21, loop: false, clicks: true }, 0);
    const events = schedule.until(21 / speed);
    expect(events.map(e => e.count)).toEqual(Array.from({ length: 32 }, (_, i) => i));
    expect(events.find(e => e.count === 8)?.time).toBeCloseTo(5 / speed, 10);
    expect(events.find(e => e.count === 16)?.time).toBeCloseTo(9 / speed, 10);
    expect(events.find(e => e.count === 24)?.time).toBeCloseTo(15 / speed, 10);
  }
  const silent = new RehearsalClock({ totalSeconds: 21, offset: .4, now: () => now });
  silent.update({ playing: true, speed: .5, loop: false }, 5); now += 8; expect(secondsToCount(p, silent.sample().seconds)).toBeCloseTo(16);
});
it('rejects contradictory, unsafe and outside-show anchors, malformed rows and old wire formats', () => {
  for (const anchors of [null, [{ count: 0, seconds: 1 }], [{ count: 33, seconds: 1 }], [{ count: .5, seconds: 1 }], [{ count: 2, seconds: NaN }], [{ count: 2, seconds: 0 }], [{ count: 2, seconds: 86401 }], [{ count: 2, seconds: 2 }, { count: 2, seconds: 3 }], [{ count: 2, seconds: 2 }, { count: 4, seconds: 1 }], Array(257).fill({ count: 2, seconds: 1 })]) expect(() => validateAudioAnchors(anchors, 32)).toThrow();
  for (const seconds of [.000001, 1000]) expect(() => compileTempo({ ...fixture(), audioAnchors: [{ count: 8, seconds }] })).toThrow(/intervals/);
  for (const text of ['1,', 'Count,Time', '1,2,3', '1,2\n2,1']) expect(() => parseAudioAnchorText(text, .4, 32)).toThrow();
  expect(parseAudioAnchorText('8\t5.4\n16\t9.4', .4, 32)).toEqual(fixture().audioAnchors.slice(0, 2));
  expect(parseAudioAnchorText(audioAnchorText(fixture().audioAnchors, .4), .4, 32)).toEqual(fixture().audioAnchors);
  for (const schemaVersion of [1, 2, 3]) expect(() => parseProject(JSON.stringify({ ...fixture(), schemaVersion }))).toThrow(/requires schema version 4/);
  expect(() => parseProject(JSON.stringify({ ...fixture(), schemaVersion: 6 }))).toThrow(/Update Squidware/);
  expect(() => projectV2AsLegacy(fixture())).toThrow(/cannot be downgraded/);
});
it('commits offset and anchors in one named action, rejects stale edits and truncation, and retains portable metadata', () => {
  const p = fixture(), { audioAnchors, ...plain } = p, store = createEditorStore(plain), initial = store.getState();
  store.setValue('ui','pendingDraft',true); expect(store.dispatch('audio.align-open')).toBe(false); store.setValue('ui','pendingDraft',false);
  const request = { anchors: audioAnchors, offset: .8, revision: initial.project.revision, epoch: initial.ui.projectEpoch };
  expect(store.dispatch('audio.align-save', request)).toBe(true);
  const saved = store.getState().project.present;
  expect(store.getState().project.past.at(-1)?.name).toBe('Align recording');
  expect(saved.sets).toEqual(p.sets); expect(saved.moves).toEqual(p.moves);
  expect(JSON.parse(serializeProject(saved)).schemaVersion).toBe(4);
  expect(parseProject(serializeProject(saved))).toEqual(saved);
  expect(exportCoordinatesCsv(saved)).toContain('Recording arrival seconds');
  expect(store.dispatch('audio.align-save', request)).toBe(false);
  expect(store.dispatch('set.update', { index: 2, update: { counts: 1 } })).toBe(false);
  expect(store.getState().project.present).toBe(saved);
  store.dispatch('history.undo'); expect(store.getState().project.present).toEqual(plain);
  store.dispatch('history.redo'); expect(store.getState().project.present).toEqual(saved);
  const state = store.getState(); expect(store.dispatch('audio.align-save', { ...request, anchors: [], revision: state.project.revision })).toBe(true);
  expect(JSON.parse(serializeProject(store.getState().project.present)).schemaVersion).toBe(2);
});
it('supports 256 anchors with tempo events on maximum-length moves', () => {
  const p = fixture(); p.moves.forEach(m => { m.counts = 1024; });
  p.audioAnchors = Array.from({ length: 256 }, (_, i) => ({ count: (i + 1) * 8, seconds: (i + 1) * 4.1 }));
  expect(parseProject(serializeProject(p)).audioAnchors).toEqual(p.audioAnchors);
  expect(compileTempo(p).spans).toHaveLength(256);
  for (const c of [0, .1, 8, 1000.5, 2048]) expect(secondsToCount(p, countToSeconds(p, c))).toBeCloseTo(c, 9);
});
