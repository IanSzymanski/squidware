import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { addFrameSource, requestFrame } from './frameSources';

function queue() {
  const callbacks = new Map<number, FrameRequestCallback>(); let next = 0;
  return { callbacks, requestAnimationFrame: (callback: FrameRequestCallback) => { callbacks.set(++next, callback); return next; }, cancelAnimationFrame: (id: number) => { callbacks.delete(id); },
    tick() { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback(0)); } };
}
let clock = 0;
beforeEach(() => {
  clock += 100000; vi.spyOn(performance, 'now').mockImplementation(() => clock);
  // Frame history is module state: editor frames at 60 Hz beside an open 3D window give every test the editor as its clock.
  const settle = queue(), idle = queue(), remove = addFrameSource(idle);
  for (let i = 0; i < 30; i++) { requestFrame(() => {}, settle); clock += 16; settle.tick(); }
  remove();
});
afterEach(() => { vi.restoreAllMocks(); });
/** A playback loop like usePlaybackController's: each run publishes and requests the next frame. */
function playback(editor: ReturnType<typeof queue>) {
  const state = { runs: 0, cancel: () => {} };
  const frame = () => { state.runs++; state.cancel = requestFrame(frame, editor); };
  state.cancel = requestFrame(frame, editor);
  return state;
}
/** Times (ms from now) of a window painting every `period` ms, with a deterministic jitter of up to `jitter` ms. */
function every(period: number, until: number, { from = period, jitter = 0, seed = 7 } = {}) {
  const times: number[] = []; let s = seed;
  for (let t = from; t < until; t += period) { s = (s * 1103515245 + 12345) % 2147483648; times.push(t + (s / 2147483648 * 2 - 1) * jitter); }
  return times;
}
/** Times of a window repeating a pattern of frame intervals. */
function pattern(intervals: number[], until: number, from = intervals[0]) {
  const times: number[] = [];
  for (let t = from, i = 1; t < until; t += intervals[i++ % intervals.length]) times.push(t);
  return times;
}
type Control = 'pause' | 'resume' | 'restart';
/** Plays the editor's and the 3D window's frames in time order (the 3D window first on a tie) through a playback loop.
 * Controls pause, resume, or cancel and at once restart the loop (as a project edit during playback does). Returns
 * each run with its time and the window whose frame ran it. */
function simulate(editorTimes: number[], popoutTimes: number[], controls: [number, Control][] = []) {
  const editor = queue(), popout = queue(), remove = addFrameSource(popout), start = clock, runs: { at: number; by: string }[] = [];
  let by = '', at = 0, playing = true, cancel = () => {};
  const frame = () => { runs.push({ at, by }); cancel = requestFrame(frame, editor); };
  cancel = requestFrame(frame, editor);
  const events = [...editorTimes.map(at => ({ at, by: 'editor' })), ...popoutTimes.map(at => ({ at, by: '3d' })), ...controls.map(([at, by]) => ({ at, by }))]
    .sort((a, b) => a.at - b.at || (a.by === '3d' ? -1 : b.by === '3d' ? 1 : 0));
  for (const event of events) {
    clock = start + event.at; at = event.at; by = event.by;
    if (event.by === 'pause') { cancel(); playing = false; } else if (event.by === 'resume') { playing = true; cancel = requestFrame(frame, editor); }
    else if (event.by === 'restart') { if (playing) { cancel(); cancel = requestFrame(frame, editor); } } else (event.by === 'editor' ? editor : popout).tick();
  }
  cancel(); remove();
  return runs;
}
/** Runs per second and the largest gap between runs from `from` to `until` ms. */
function cadence(runs: { at: number }[], from: number, until: number) {
  const times = runs.map(run => run.at).filter(at => at >= from && at < until);
  return { perSecond: times.length * 1000 / (until - from), maxGap: Math.max(...times.slice(1).map((at, i) => at - times[i])) };
}

it('runs a frame from the editor window alone, and once per vsync when a 3D window paints in the same vsync', () => {
  const editor = queue(), popout = queue();
  const solo = playback(editor);
  expect([editor.callbacks.size, popout.callbacks.size]).toEqual([1, 0]);
  for (let frame = 1; frame <= 3; frame++) { clock += 16; editor.tick(); expect(solo.runs).toBe(frame); }
  solo.cancel();
  const remove = addFrameSource(popout);
  const both = playback(editor);
  expect([editor.callbacks.size, popout.callbacks.size]).toEqual([1, 1]);
  // Either window may paint first within a vsync; each vsync still runs exactly one frame.
  for (let frame = 1; frame <= 30; frame++) {
    clock += 16.7;
    if (frame % 3) { editor.tick(); clock += 3; popout.tick(); } else { popout.tick(); clock += 3; editor.tick(); }
    expect(both.runs).toBe(frame);
  }
  both.cancel(); remove();
});

it('without a 3D window is requestAnimationFrame itself: one request on the editor, no clock reads, the same cancel', () => {
  const editor = queue(), callback = vi.fn(), ask = vi.spyOn(editor, 'requestAnimationFrame'), drop = vi.spyOn(editor, 'cancelAnimationFrame'), now = vi.mocked(performance.now);
  now.mockClear();
  const cancel = requestFrame(callback, editor);
  expect(ask).toHaveBeenCalledTimes(1); expect(ask).toHaveBeenCalledWith(callback);
  editor.tick(); expect(callback).toHaveBeenCalledTimes(1);
  requestFrame(callback, editor)(); expect(drop).toHaveBeenCalledWith(2); expect(editor.callbacks.size).toBe(0);
  cancel(); expect(now).not.toHaveBeenCalled();
});

it('runs every frame from the editor when both windows paint at 60 Hz, aligned or offset by up to a frame', () => {
  for (const offset of [0, 1, 8, 15, -5]) for (const jitter of [0, 3]) {
    const runs = simulate(every(16.7, 2000, { jitter }), every(16.7, 2000, { from: 16.7 + offset, jitter, seed: 11 }));
    expect(runs.length).toBe(every(16.7, 2000).length);
    expect(runs.every(run => run.by === 'editor')).toBe(true);
  }
});

it('keeps a slow but painting editor as the clock while a faster 3D window paints in between', () => {
  const editor = queue(), popout = queue(), remove = addFrameSource(popout);
  const loop = playback(editor), second = (frame: number) => { for (let i = 0; i < 3 + frame % 3; i++) { clock += 300 / (3 + frame % 3); popout.tick(); } editor.tick(); };
  // A heavy show paints the editor every 300 ms; cheap 3D window frames come three to five times as often. Dropping
  // from 60 Hz, the editor's first slow frame looks like a stall, and the 3D window fills in until the next one.
  for (const frame of [0, 0]) { const filled = loop.runs; second(frame); expect(loop.runs - filled).toBeLessThanOrEqual(4); }
  for (let frame = 1; frame <= 20; frame++) { const before = loop.runs; second(frame); expect(loop.runs).toBe(before + 1); }
  loop.cancel(); remove();
});

it('publishes about once per editor frame beside a faster 3D window while a shown editor paints about four times a second', () => {
  // The popout-3d suite's software-rendered editor beside a lightweight 3D window. Once the editor's first two frames
  // show its pace, only the editor runs, also through an editor frame 540 ms late every two seconds: that stall is
  // shorter than four of its frame intervals, so the 3D window does not fill it in.
  const steady = every(250, 15000, { jitter: 60 }), stalling = steady.map((at, i) => at + Math.floor(i / 8) * 290);
  for (const editorTimes of [steady, stalling]) {
    const runs = simulate(editorTimes, every(110, 20000, { jitter: 20, seed: 3 }));
    if (editorTimes === steady) expect(runs.filter(run => run.at > editorTimes[1] && run.at <= editorTimes.at(-1)!).every(run => run.by === 'editor')).toBe(true);
    for (let from = 1000; from + 3000 <= 15000; from += 500) {
      const frames = editorTimes.filter(at => at >= from && at < from + 3000).length, published = runs.filter(run => run.at >= from && run.at < from + 3000).length;
      expect(published).toBeLessThanOrEqual(frames);
    }
  }
});

it('keeps a slow shown editor with frequent long frames as the clock, publishing once per editor frame', () => {
  // Measured on a slow CI host: the 500-performer show paints the shown editor every 250 ms or so with frames of 640-700
  // ms between (11 frames in three seconds), beside a 3D window painting five times a second. Filling each long frame in
  // from the 3D window published 16 times in those three seconds, 1.45 per editor frame, rendering both windows each time.
  // Dropping from 60 Hz, the first long frame still looks like a stop (as above); after that only the editor runs.
  const editorTimes = pattern([220, 260, 690, 240, 280, 640, 230, 300, 250, 700, 260, 240], 15000);
  const runs = simulate(editorTimes, every(200, 15000, { jitter: 40, seed: 5 }));
  expect(runs.filter(run => run.at > 2000).every(run => run.by === 'editor')).toBe(true);
  for (let from = 2000; from + 3000 <= 15000; from += 500) {
    const frames = editorTimes.filter(at => at >= from && at < from + 3000).length;
    expect(runs.filter(run => run.at >= from && run.at < from + 3000).length).toBeLessThanOrEqual(frames);
  }
});

it('lets a visible 3D window drive frames while the editor window is stopped or throttled, then hands back without double runs', () => {
  const editor = queue(), popout = queue(), remove = addFrameSource(popout);
  const loop = playback(editor);
  for (let frame = 1; frame <= 3; frame++) { clock += 16; popout.tick(); editor.tick(); }
  expect(loop.runs).toBe(3);
  // Minimized: the editor stops painting. The 3D window takes over at its first frame after the editor missed four of its
  // frames (64 ms at 60 Hz), then runs every frame it paints.
  const runs: number[] = [];
  for (let frame = 0; frame < 20; frame++) { clock += 16; popout.tick(); runs.push(loop.runs - 3); }
  const first = runs.findIndex(count => count > 0);
  expect(first + 1).toBe(5);
  expect(runs.slice(first)).toEqual(runs.slice(first).map((_, i) => i + 1));
  // A throttled editor frame now and then does not take the clock back or run a second frame.
  for (let second = 0; second < 3; second++) {
    const before = loop.runs; clock += 2; editor.tick(); expect(loop.runs).toBe(before);
    for (let frame = 1; frame <= 30; frame++) { clock += 16; popout.tick(); expect(loop.runs).toBe(before + frame); }
  }
  // Restored: within two frames the editor is the clock again, and no vsync runs twice.
  const before = loop.runs, perVsync: number[] = [];
  for (let frame = 0; frame < 10; frame++) { const start = loop.runs; clock += 16.7; popout.tick(); clock += 3; editor.tick(); perVsync.push(loop.runs - start); }
  expect(perVsync.every(count => count <= 1)).toBe(true); expect(perVsync.slice(2)).toEqual(Array(8).fill(1));
  expect(loop.runs - before).toBeGreaterThanOrEqual(8);
  loop.cancel(); remove();
});

it('lets a slow 3D window drive frames while a throttled editor still paints about once a second', () => {
  const editor = queue(), popout = queue(), remove = addFrameSource(popout);
  const loop = playback(editor);
  for (let frame = 1; frame <= 3; frame++) { clock += 16; popout.tick(); editor.tick(); }
  expect(loop.runs).toBe(3);
  /** Runs per frame over one second: the 3D window paints `frames` times, then the throttled editor paints once. */
  const second = (frames: number) => {
    const runs: number[] = [], step = (tick: () => void) => { const before = loop.runs; tick(); runs.push(loop.runs - before); };
    for (let i = 0; i < frames; i++) step(() => { clock += 1000 / frames; popout.tick(); });
    step(() => { clock += 3; editor.tick(); });
    return runs;
  };
  // A heavy 3D window paints five frames a second while the editor gets one: the 3D window takes over at its second
  // frame (its first follows the editor's last run), then every 3D frame shows a new count and editor frames run none.
  expect(second(5)).toEqual([0, 1, 1, 1, 1, 0]);
  for (let i = 0; i < 3; i++) expect(second(5)).toEqual([1, 1, 1, 1, 1, 0]);
  // Shown again: the editor takes the clock back within three frames, and every vsync runs exactly one.
  const perVsync: number[] = [], by: string[] = [];
  for (let frame = 0; frame < 10; frame++) {
    const start = loop.runs; clock += 16.7; popout.tick(); const between = loop.runs; clock += 3; editor.tick();
    perVsync.push(loop.runs - start); by.push(loop.runs > between ? 'editor' : '3d');
  }
  expect(perVsync).toEqual(Array(10).fill(1)); expect(by.slice(3)).toEqual(Array(7).fill('editor'));
  // Throttled again, the editor hands over the same way.
  expect(second(5)).toEqual([0, 1, 1, 1, 1, 0]);
  // Slowing down, the 3D window keeps the clock while it paints faster than the throttled editor.
  expect(second(3)).toEqual([1, 1, 1, 0]); expect(second(2)).toEqual([1, 1, 0]);
  // The 3D window stops painting (hidden) while the editor stays throttled: each editor frame runs again.
  for (let frame = 1; frame <= 3; frame++) { const before = loop.runs; clock += 1000; editor.tick(); expect(loop.runs).toBe(before + 1); }
  // A 3D window three times as fast as the throttled editor takes the clock at its second frame (before this change it
  // had to paint four frames over 500 ms, so the editor kept the clock at one frame a second).
  expect(second(3)).toEqual([0, 1, 1, 0]);
  for (let i = 0; i < 2; i++) expect(second(3)).toEqual([1, 1, 1, 0]);
  loop.cancel(); remove();
});

it('drives at the 3D window rate while the editor is throttled to about one frame a second', () => {
  // The editor paints at 60 Hz for a second, then is covered: Chromium gives it one frame a second. The 3D window paints at 5 Hz.
  const runs = simulate([...every(16.7, 1000), ...every(1000, 12000, { from: 1900 })], every(200, 12000, { jitter: 5 }));
  expect(cadence(runs, 1000, 12000).maxGap).toBeLessThanOrEqual(2 * 210);
  const steady = cadence(runs, 3000, 12000);
  expect(steady.perSecond).toBeGreaterThanOrEqual(4.8); expect(steady.maxGap).toBeLessThanOrEqual(210);
  expect(runs.filter(run => run.at >= 3000).every(run => run.by === '3d')).toBe(true);
});

it('keeps driving through uneven throttled editor frames (1000, 760 and 240 ms apart)', () => {
  // An early throttled editor frame (240 ms after the previous one) does not hand the clock back.
  for (const period of [200, 143]) {
    const runs = simulate([...every(16.7, 1000), ...pattern([1000, 760, 240], 14000, 2000)], every(period, 14000, { jitter: 5 }));
    // From the moment the editor is throttled, including its first early frame, the 3D window keeps the clock.
    expect(cadence(runs, 1000, 14000).maxGap).toBeLessThanOrEqual(2 * period + 10);
    const steady = cadence(runs, 3000, 14000);
    expect(steady.perSecond).toBeGreaterThanOrEqual(1000 / period * .95); expect(steady.maxGap).toBeLessThanOrEqual(period + 10);
  }
});

it('runs 3D frames that cluster early in each throttled editor gap', () => {
  // The 3D window paints six frames in the 105 ms after each editor frame, then nothing until the next one 774 ms later.
  const editorTimes = every(774, 12000, { jitter: 10 }), runs = simulate(editorTimes, editorTimes.flatMap(at => [1, 2, 3, 4, 5, 6].map(i => at + 5 + i * 16.7)));
  const steady = runs.filter(run => run.at >= 3000);
  expect(steady.every(run => run.by === '3d')).toBe(true);
  expect(steady.length / editorTimes.filter(at => at >= 3000).length).toBeGreaterThanOrEqual(5.9);
  expect(Math.min(...steady.slice(1).map((run, i) => run.at - steady[i].at))).toBeGreaterThan(16);
});

it('resumes at the first 3D window frame when playback restarts while the editor is stopped', () => {
  // Minimized editor, 5 Hz 3D window: pauses and resumes, and project edits that restart the loop, skip no 3D frame.
  const popout = every(200, 9000, { jitter: 5 });
  const runs = simulate([16, 32, 48], popout, [[2010, 'pause'], [2700, 'resume'], [4410, 'pause'], [5100, 'resume'], [6050, 'restart'], [6650, 'restart'], [7210, 'restart']]);
  for (const resumed of [2700, 5100]) expect(runs.find(run => run.at > resumed)!.at).toBe(popout.find(at => at > resumed));
  const playing = popout.filter(at => at > 1000 && !(at > 2010 && at < 2700) && !(at > 4410 && at < 5100));
  expect(runs.filter(run => run.at > 1000).map(run => run.at)).toEqual(playing);
});

it('cancels and at once restarts (a project edit during playback) without skipping a 3D frame at 60 Hz', () => {
  const popout = every(16.7, 3000, { jitter: .5 }), restarts = every(250, 3000, { from: 1008 }).map(at => [at, 'restart'] as [number, Control]);
  const runs = simulate([16, 32, 48], popout, restarts);
  expect(runs.filter(run => run.at > 500).map(run => run.at)).toEqual(popout.filter(at => at > 500));
});

it('lets a faster 3D window drive beside a shown editor painting about twice a second (slower than the throttle threshold)', () => {
  // Such an editor cannot show smooth playback; the 3D window can. Each 3D frame runs, never two in one frame.
  const runs = simulate(every(520, 12000, { jitter: 30 }), every(100, 12000, { jitter: 8, seed: 5 }));
  const steady = cadence(runs, 3000, 12000);
  expect(steady.perSecond).toBeGreaterThanOrEqual(9.5); expect(steady.maxGap).toBeLessThanOrEqual(120);
  expect(runs.filter(run => run.at >= 3000).every(run => run.by === '3d')).toBe(true);
});

it('keeps a 3D window that drove before a pause as the clock on resume, until the editor paints normally again', () => {
  const editor = queue(), popout = queue(), remove = addFrameSource(popout);
  let loop = playback(editor);
  clock += 16; editor.tick();
  // Minimized during playback: the 3D window drives, then playback pauses and the editor is shown again.
  for (let frame = 0; frame < 20; frame++) { clock += 16; popout.tick(); }
  expect(loop.runs).toBeGreaterThan(10);
  loop.cancel(); clock += 2000;
  // Resumed with a heavy show: the editor paints every 270 ms, the 3D window every 200 ms. The 3D window runs its first
  // frame at once. The editor's first frame measures the pause as one long interval; its third (810 ms) is its second
  // in a row less than 400 ms apart, so it takes the clock there, after the 3D window's fourth frame ran, and every
  // later frame is the editor's. (Before, its second frame ended the stop on one short interval: two 3D frames ran.)
  loop = playback(editor);
  const next = { editor: clock + 270, popout: clock + 200 }, ran: string[] = [];
  for (let event = 0; event < 30; event++) {
    const which = next.editor <= next.popout ? 'editor' : 'popout', before = loop.runs;
    clock = next[which]; next[which] += which === 'editor' ? 270 : 200;
    (which === 'editor' ? editor : popout).tick(); if (loop.runs > before) ran.push(which);
  }
  expect(ran.slice(0, 4)).toEqual(['popout', 'popout', 'popout', 'popout']);
  expect(ran.length).toBeGreaterThan(10); expect(ran.slice(4)).toEqual(ran.slice(4).map(() => 'editor'));
  loop.cancel(); remove();
});

it('hands the clock to a shown editor at its third frame after a resume, whatever history it had', () => {
  // The popout-3d suite's sequence: playback with the editor hidden (Chromium's uneven one frame a second) while the 3D
  // window drives, a pause, then the editor shown, painting every 270 or 350 ms beside a 3D window painting every 200 ms.
  // The throttled history (a smoothed interval near 600 ms) used to keep the 3D window driving for five to eight editor
  // frames, re-rendering both windows each time. Two editor intervals in a row under 400 ms now end it at once.
  for (const period of [270, 350]) {
    const resumed = 4900, shown = every(period, 9000, { from: 5020, jitter: period / 5 });
    const runs = simulate([...every(16.7, 500), ...pattern([1000, 760, 240], 4000, 1500), ...shown],
      [...every(263, 4000, { jitter: 60 }), ...every(200, 9000, { from: 4960, jitter: 30, seed: 3 })], [[4000, 'pause'], [resumed, 'resume']]);
    // The 3D window runs no frame after the editor's third; the editor runs from its third or fourth, then every frame.
    expect(runs.filter(run => run.by === '3d' && run.at > shown[2])).toEqual([]);
    const ran = runs.filter(run => run.by === 'editor' && run.at > resumed).map(run => run.at);
    expect(shown.indexOf(ran[0])).toBeGreaterThanOrEqual(0); expect(shown.indexOf(ran[0])).toBeLessThanOrEqual(3);
    expect(ran).toEqual(shown.slice(shown.indexOf(ran[0])));
    for (let from = resumed; from + 3000 <= 9000; from += 500) {
      const frames = shown.filter(at => at >= from && at < from + 3000).length;
      expect(runs.filter(run => run.at >= from && run.at < from + 3000).length).toBeLessThanOrEqual(frames * 1.2 + 2);
    }
  }
});

it('keeps a 3D window driving through a resume or a stop while the editor stays throttled, also through a short interval', () => {
  // Chromium's throttled editor paints an early frame 240 ms after the previous one now and then, never two in a row. A
  // single short interval must not hand the clock back (the 3D window would then wait about four of them, a second).
  const popout = every(200, 9000, { jitter: 5 }), resumed = 4100;
  const cases: [string, number[], [number, Control][]][] = [
    // Throttled history, resumed while the editor is still hidden: its first intervals after the resume are 760 and 240 ms.
    ['throttled history', [...every(16.7, 500), ...pattern([1000, 760, 240], 9000, 1500)], [[4000, 'pause'], [resumed, 'resume']]],
    // Minimized (no editor frames), resumed while still throttled: the pause, then 240 ms, then 1000 ms.
    ['stopped history', [...every(16.7, 500), ...pattern([760, 240, 1000], 9000, resumed + 300)], [[4000, 'pause'], [resumed, 'resume']]],
    // Minimized during playback: the 60 Hz editor's next frames come 600, 250 and 1000 ms apart.
    ['stop during playback', [...every(16.7, 1000), ...pattern([760, 250, 1000], 9000, 1583)], []],
  ];
  for (const [label, editorTimes, controls] of cases) {
    expect(cadence(simulate(editorTimes, popout, controls), controls.length ? resumed : 1100, 9000).maxGap, label).toBeLessThanOrEqual(210);
  }
});

it('cancels every pending request, including a 3D window frame re-requested after the editor ran', () => {
  const editor = queue(), popout = queue(), remove = addFrameSource(popout), callback = vi.fn();
  clock += 16; const first = requestFrame(callback, editor); editor.tick(); first();
  expect(callback).toHaveBeenCalledTimes(1);
  const cancel = requestFrame(callback, editor);
  popout.tick(); expect(callback).toHaveBeenCalledTimes(1);
  expect([editor.callbacks.size, popout.callbacks.size]).toEqual([1, 1]);
  cancel(); expect([editor.callbacks.size, popout.callbacks.size]).toEqual([0, 0]);
  clock += 1000; editor.tick(); popout.tick(); expect(callback).toHaveBeenCalledTimes(1);
  // A removed or closing window is no longer asked; the editor still delivers.
  remove();
  const broken = { requestAnimationFrame: () => { throw new Error('closed'); }, cancelAnimationFrame: () => { throw new Error('closed'); } };
  const removeBroken = addFrameSource(broken);
  requestFrame(callback, editor); expect(popout.callbacks.size).toBe(0);
  clock += 16; editor.tick(); expect(callback).toHaveBeenCalledTimes(2);
  removeBroken();
});

it('stops re-requesting a removed 3D window, and the editor runs frames again after a driving window closes', () => {
  const editor = queue(), popout = queue(), remove = addFrameSource(popout);
  const loop = playback(editor);
  clock += 16; editor.tick();
  for (let frame = 0; frame < 20; frame++) { clock += 16; popout.tick(); }
  expect(loop.runs).toBeGreaterThan(10);
  remove(); clock += 16; popout.tick();
  expect(popout.callbacks.size).toBe(0);
  // The closed window's last frame runs nothing; the editor runs its next frame and every one after it.
  const before = loop.runs;
  for (let frame = 1; frame <= 3; frame++) { clock += 16; editor.tick(); }
  expect(loop.runs).toBe(before + 3);
  loop.cancel();
});
