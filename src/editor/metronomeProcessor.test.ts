import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ClickPlan } from './clickSchedule';

class ProcessorStub {
  port: { onmessage: ((event: { data: unknown }) => void) | null; postMessage: (message: unknown) => void } = { onmessage: null, postMessage() {} };
}
type Processor = ProcessorStub & { process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean };
let Worklet: new () => Processor;
beforeAll(async () => {
  vi.stubGlobal('AudioWorkletProcessor', ProcessorStub);
  vi.stubGlobal('sampleRate', 48000); vi.stubGlobal('currentTime', 0);
  vi.stubGlobal('registerProcessor', (name: string, constructor: new () => Processor) => { expect(name).toBe('squidware-metronome'); Worklet = constructor; });
  await import('./metronomeProcessor');
});
afterAll(() => vi.unstubAllGlobals());
function block(processor: Processor, frame: number) {
  vi.stubGlobal('currentTime', frame / 48000);
  const out = new Float32Array(128);
  expect(processor.process([], [[out]])).toBe(true);
  return out;
}
const plan: ClickPlan = { spans: [{ count: 0, seconds: 0, counts: 6, secondsPerCount: .25 }], meter: { numerator: 6, denominator: 8, grouping: [3,3] },
  anchorTime: .1, seconds: 0, speed: 1, start: 0, end: 1.5, loop: true, clicks: true };

describe('actual click PCM from the production audio processor', () => {
  it('renders distinct accent frequencies with sample-accurate onsets and bounded amplitude without UI callbacks', () => {
    vi.stubGlobal('currentTime', 0);
    const processor = new Worklet(); processor.port.onmessage!({ data: { type: 'plan', plan } });
    const pcm = new Float32Array(128 * 600);
    for (let frame = 0; frame < pcm.length; frame += 128) pcm.set(block(processor, frame), frame);
    const onsets: number[] = [];
    for (let i = 0; i < pcm.length; i++) if (Math.abs(pcm[i]) > .002 && (onsets.length === 0 || i - onsets.at(-1)! > 4800)) onsets.push(i);
    expect(onsets).toHaveLength(6);
    onsets.forEach((frame, i) => {
      expect(Math.abs(frame / 48000 - (.1 + i * .25))).toBeLessThan(2 / 48000);
      let crossings = 0;
      for (let sample = frame + 48; sample < frame + 528; sample++) if (pcm[sample - 1] <= 0 && pcm[sample] > 0) crossings++;
      expect(Math.abs(crossings * 100 - (i === 0 ? 1320 : i === 3 ? 990 : 660))).toBeLessThan(110);
    });
    expect(Math.max(...pcm.map(Math.abs))).toBeLessThan(.121);
  });
  it('cancels an active click and every queued beat when a stop/seek replaces the plan', () => {
    vi.stubGlobal('currentTime', 0);
    const processor = new Worklet(); processor.port.onmessage!({ data: { type: 'plan', plan } });
    for (let frame = 0; frame < 5120; frame += 128) block(processor, frame);
    processor.port.onmessage!({ data: { type: 'plan', plan: null } });
    for (let frame = 5120; frame < 24000; frame += 128) expect(block(processor, frame).every(value => value === 0)).toBe(true);
  });
});
