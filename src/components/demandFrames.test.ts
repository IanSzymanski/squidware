import { afterEach, expect, it, vi } from 'vitest';
import { createDemandFrames } from './demandFrames';

afterEach(() => vi.unstubAllGlobals());
function frameQueue() {
  const callbacks = new Map<number, FrameRequestCallback>();
  let next = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callbacks.set(++next, callback); return next; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
  return { callbacks, tick() { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback(0)); } };
}

it('coalesces scene changes, drains camera damping and stops when settled', () => {
  const queue = frameQueue();
  const render = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValue(false);
  const frames = createDemandFrames(render, vi.fn());
  for (let i = 0; i < 20; i++) frames.invalidate();
  expect(queue.callbacks.size).toBe(1);
  queue.tick(); queue.tick(); queue.tick();
  expect(render).toHaveBeenCalledTimes(3);
  expect(queue.callbacks.size).toBe(0);
  frames.invalidate(); queue.tick();
  expect(render).toHaveBeenCalledTimes(4);
  expect(queue.callbacks.size).toBe(0);
});

it('preserves an invalidation raised during rendering and cancels teardown work', () => {
  const queue = frameQueue();
  const frames = createDemandFrames(() => { frames.invalidate(); return false; }, vi.fn());
  frames.invalidate(); queue.tick();
  expect(queue.callbacks.size).toBe(1);
  frames.dispose();
  expect(queue.callbacks.size).toBe(0);
  frames.invalidate();
  expect(queue.callbacks.size).toBe(0);
});

it('stops after a graphics failure and delivers the error once', () => {
  const queue = frameQueue();
  const error = new Error('graphics failure');
  const onError = vi.fn();
  const frames = createDemandFrames(() => { throw error; }, onError);
  frames.invalidate(); queue.tick(); frames.invalidate();
  expect(onError).toHaveBeenCalledExactlyOnceWith(error);
  expect(queue.callbacks.size).toBe(0);
});
