import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalysisClient } from './client';
import type { AnalysisState, AnalysisWorker } from './client';
import { transitionInput } from './input';
import type { AnalysisRequest, AnalysisResponse } from './input';
import { createDemoProject } from '../domain';

class FakeWorker implements AnalysisWorker {
  onmessage: AnalysisWorker['onmessage'] = null;
  onerror: AnalysisWorker['onerror'] = null;
  onmessageerror: AnalysisWorker['onmessageerror'] = null;
  messages: AnalysisRequest[] = [];
  terminate = vi.fn();
  postMessage(data: AnalysisRequest) { this.messages.push(data); }
  reply(data: AnalysisResponse) { this.onmessage?.({ data } as MessageEvent<AnalysisResponse>); }
}
const input = transitionInput(createDemoProject(), 1, 0, { minimumSpacing: 1, maximumStride: 1.25 })!;
const result = { issues: [], stats: { mode: 'full' as const, changedPerformers: 64, possiblePairs: 2016, exactPairs: 4, elapsedMs: 1 } };
afterEach(() => vi.useRealTimers());
describe('worker lifecycle and result ownership', () => {
  it('coalesces edits and rejects late edits, undo, set changes and same-ID loads', () => {
    vi.useFakeTimers();
    const worker = new FakeWorker(), states: AnalysisState[] = [];
    const client = new AnalysisClient(() => worker, state => states.push(state));
    client.request(input); vi.advanceTimersByTime(0);
    for (let i = 0; i < 50; i++) client.request({ ...input, projectKey: `${i}:same-id` });
    expect(states.at(-1)?.status).toBe('pending');
    worker.reply({ revision: 1, result }); expect(states.at(-1)?.status).toBe('pending');
    vi.advanceTimersByTime(0); expect(worker.messages).toHaveLength(2);
    worker.reply({ revision: 51, result }); expect(states.at(-1)?.status).toBe('ready');
    client.request(null); worker.reply({ revision: 51, result });
    expect(states.at(-1)).toEqual({ input: null, status: 'ready' });
    vi.advanceTimersByTime(0); expect(worker.messages.at(-1)?.input).toBeNull(); client.dispose();
  });
  it('handles failures, retries with a fresh worker, timeouts and disposal', () => {
    vi.useFakeTimers();
    const first = new FakeWorker(), second = new FakeWorker(), states: AnalysisState[] = [];
    const factory = vi.fn().mockReturnValueOnce(first).mockReturnValue(second);
    const client = new AnalysisClient(factory, state => states.push(state), 100);
    client.request(input); vi.advanceTimersByTime(0); first.onerror?.({} as ErrorEvent);
    expect(states.at(-1)?.status).toBe('error'); expect(first.terminate).toHaveBeenCalledOnce();
    client.request(input); vi.advanceTimersByTime(0);
    first.reply({ revision: 2, result }); expect(states.at(-1)?.status).toBe('pending');
    second.reply({ revision: 2, result }); expect(states.at(-1)?.status).toBe('ready');
    client.request(input); vi.advanceTimersByTime(100);
    expect(states.at(-1)?.error).toContain('timed out'); expect(second.terminate).toHaveBeenCalledOnce();
    const count = states.length; client.dispose(); second.reply({ revision: 3, result });
    expect(states).toHaveLength(count);
  });
  it('reports constructor, postMessage, decoding and analysis errors without synchronous fallback', () => {
    vi.useFakeTimers();
    for (const kind of ['constructor', 'postMessage', 'message', 'analysis']) {
      const worker = new FakeWorker(), states: AnalysisState[] = [];
      if (kind === 'postMessage') worker.postMessage = () => { throw new Error('clone'); };
      const client = new AnalysisClient(() => { if (kind === 'constructor') throw new Error('CSP'); return worker; }, state => states.push(state));
      client.request(input); vi.advanceTimersByTime(0);
      if (kind === 'message') worker.onmessageerror?.({} as MessageEvent);
      if (kind === 'analysis') worker.reply({ revision: 1, error: 'Invalid model' });
      expect(states.at(-1)?.status).toBe('error'); expect(states.at(-1)?.result).toBeUndefined(); client.dispose();
    }
  });
});
