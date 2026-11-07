import { expect, it, vi } from 'vitest';
import { addFrameSource, requestFrame } from './frameSources';

function queue() {
  const callbacks = new Map<number, FrameRequestCallback>(); let next = 0;
  return { callbacks, requestAnimationFrame: (callback: FrameRequestCallback) => { callbacks.set(++next, callback); return next; }, cancelAnimationFrame: (id: number) => { callbacks.delete(id); },
    tick() { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback(0)); } };
}

it('runs a playback frame once, from whichever window paints first, while a 3D window is a source', () => {
  const editor = queue(), popout = queue(), callback = vi.fn();
  requestFrame(callback, editor); expect(editor.callbacks.size).toBe(1); expect(popout.callbacks.size).toBe(0);
  editor.tick(); expect(callback).toHaveBeenCalledTimes(1);
  const remove = addFrameSource(popout);
  requestFrame(callback, editor); expect([editor.callbacks.size, popout.callbacks.size]).toEqual([1, 1]);
  popout.tick(); expect(callback).toHaveBeenCalledTimes(2); expect(editor.callbacks.size).toBe(0);
  editor.tick(); expect(callback).toHaveBeenCalledTimes(2);
  const cancel = requestFrame(callback, editor); cancel();
  expect([editor.callbacks.size, popout.callbacks.size]).toEqual([0, 0]);
  remove(); requestFrame(callback, editor); expect(popout.callbacks.size).toBe(0);
});
