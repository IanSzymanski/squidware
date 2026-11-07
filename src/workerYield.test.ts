import { afterEach, describe, expect, it, vi } from 'vitest';
import { messageYield } from './workerYield';

describe('messageYield', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('resumes without any timer firing, so clamped or coalesced timers cannot stretch a budgeted job', async () => {
    vi.useFakeTimers();
    const pause = messageYield();
    // Fake timers never advance here, so a setTimeout(0) yield would stay pending and time the test out.
    for (let i = 0; i < 3; i++) await pause();
  }, 2000);

  it('resumes every waiter in order when an outdated job and a new one pause together', async () => {
    const pause = messageYield(), order: number[] = [];
    await Promise.all([1, 2, 3].map(n => pause().then(() => { order.push(n); })));
    expect(order).toEqual([1, 2, 3]);
  });

  it('lets a job yield many times in sequence', async () => {
    const pause = messageYield();
    for (let i = 0; i < 1000; i++) await pause();
    expect(true).toBe(true);
  });
});
