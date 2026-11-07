import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { addFrameSource, EDITOR_STALL_MS, HANDOVER_FRAMES, requestFrame } from './frameSources';

function queue() {
  const callbacks = new Map<number, FrameRequestCallback>(); let next = 0;
  return { callbacks, requestAnimationFrame: (callback: FrameRequestCallback) => { callbacks.set(++next, callback); return next; }, cancelAnimationFrame: (id: number) => { callbacks.delete(id); },
    tick() { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback(0)); } };
}
let clock = 0;
beforeEach(() => {
  clock += 100000; vi.spyOn(performance, 'now').mockImplementation(() => clock);
  // Frame history is module state: a few editor-only frames give every test the editor as its clock.
  const settle = queue(); for (let i = 0; i < 3; i++) { requestFrame(() => {}, settle); clock += 16; settle.tick(); }
});
afterEach(() => { vi.restoreAllMocks(); });
/** A playback loop like usePlaybackController's: each run publishes and requests the next frame. */
function playback(editor: ReturnType<typeof queue>) {
  const state = { runs: 0, cancel: () => {} };
  const frame = () => { state.runs++; state.cancel = requestFrame(frame, editor); };
  state.cancel = requestFrame(frame, editor);
  return state;
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

it('keeps a slow but painting editor as the clock while a faster 3D window paints in between', () => {
  const editor = queue(), popout = queue(), remove = addFrameSource(popout);
  const loop = playback(editor);
  // A heavy show paints the editor every 300 ms; cheap 3D window frames come three to five times as often.
  for (let frame = 1; frame <= 20; frame++) {
    for (let i = 0; i < 3 + frame % 3; i++) { clock += 300 / (3 + frame % 3); popout.tick(); }
    editor.tick(); expect(loop.runs).toBe(frame);
  }
  loop.cancel(); remove();
});

it('lets a visible 3D window drive frames while the editor window is stopped or throttled, then hands back without double runs', () => {
  const editor = queue(), popout = queue(), remove = addFrameSource(popout);
  const loop = playback(editor);
  for (let frame = 1; frame <= 3; frame++) { clock += 16; popout.tick(); editor.tick(); }
  expect(loop.runs).toBe(3);
  // Minimized: the editor stops painting. The 3D window takes over after a few frames, then runs every frame it paints.
  const runs: number[] = [];
  for (let frame = 0; frame < 20; frame++) { clock += 16; popout.tick(); runs.push(loop.runs - 3); }
  const first = runs.findIndex(count => count > 0);
  expect(first + 1).toBe(Math.max(HANDOVER_FRAMES, Math.ceil(EDITOR_STALL_MS / 16)));
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
  const before = loop.runs;
  for (let frame = 1; frame <= 3; frame++) { clock += 16; editor.tick(); }
  expect(loop.runs).toBe(before + 2);
  loop.cancel();
});
