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
  it('renders a late-delivered recording-start cue and keeps later beats on their media anchor', () => {
    vi.stubGlobal('currentTime', .2);
    const processor = new Worklet(), messages: { count: number; time: number }[] = [];
    processor.port.postMessage = message => messages.push(message as { count: number; time: number });
    processor.port.onmessage!({ data: { type: 'diagnostics', diagnostics: true } });
    processor.port.onmessage!({ data: { type: 'plan', plan: { ...plan, anchorTime: .1, seconds: .75, cue: { time: .11, count: 3 } } } });
    let audible = false;
    for (let frame = 9600; frame < 26000; frame += 128) {
      const output = block(processor, frame); audible = output.some(value => value !== 0) || audible;
    }
    expect(audible).toBe(true);
    expect(messages[0].count).toBe(3); expect(messages[0].time).toBeCloseTo(.2 + 128 / 48000);
    expect(messages[1]).toMatchObject({ count: 4, time: .35 });
  });
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
  it.each([.46,.56])('keeps already rendered beats through media reanchors at %ss without losing queued future beats', reanchor => {
    vi.stubGlobal('currentTime', 0);
    const processor = new Worklet(), messages: { count: number; time: number }[] = [];
    processor.port.postMessage = message => messages.push(message as { count: number; time: number });
    processor.port.onmessage!({ data: { type: 'diagnostics', diagnostics: true } });
    const continuous = { ...plan, sequence: 7, anchorTime: 0, loop: false };
    processor.port.onmessage!({ data: { type: 'plan', plan: continuous } });
    const boundary = Math.ceil(reanchor * 48000 / 128) * 128;
    for (let frame = 0; frame < boundary; frame += 128) block(processor, frame);
    const heardSecondBeat = messages.some(event => event.count === 2);
    expect(heardSecondBeat).toBe(reanchor > .5);
    // A buffering stop cancels lookahead; it must retain what actually sounded.
    vi.stubGlobal('currentTime', boundary / 48000);
    processor.port.onmessage!({ data: { type: 'plan', plan: null } });
    processor.port.onmessage!({ data: { type: 'plan', plan: { ...continuous, anchorTime: boundary / 48000, seconds: .4 } } });
    const pcm: { time: number; audible: boolean }[] = [];
    for (let frame = boundary; frame < 85000; frame += 128) pcm.push({time:frame/48000,audible:block(processor,frame).some(value=>value!==0)});
    expect(messages.map(event => event.count)).toEqual([0,1,2,3,4,5,6]);
    if (heardSecondBeat) {
      const duplicateTime = boundary / 48000 + .1;
      expect(pcm.filter(b=>b.time>=duplicateTime && b.time<duplicateTime+.03).every(b=>!b.audible)).toBe(true);
    }
    expect(messages.find(event=>event.count===3)!.time).toBeCloseTo(boundary / 48000 + .35);
    // An explicit seek/start is a new sequence and may sound the same count.
    vi.stubGlobal('currentTime', 2);
    processor.port.onmessage!({ data: { type: 'plan', plan: { ...continuous, sequence: 8, anchorTime: 2, seconds: .4 } } });
    for (let frame = 96000; frame < 103000; frame += 128) block(processor, frame);
    expect(messages.at(-1)!.count).toBe(2);
  });
  it('allows the same show counts on subsequent loop cycles within one sequence', () => {
    vi.stubGlobal('currentTime', 0);
    const processor = new Worklet(), counts: number[] = [];
    processor.port.postMessage = message => counts.push((message as { count: number }).count);
    processor.port.onmessage!({ data: { type: 'diagnostics', diagnostics: true } });
    processor.port.onmessage!({ data: { type: 'plan', plan: { ...plan, sequence: 9, anchorTime: 0 } } });
    for (let frame = 0; frame < 100000; frame += 128) block(processor, frame);
    expect(counts).toEqual([0,1,2,3,4,5,0,1,2]);
  });
  it('cancels an active click and every queued beat when a stop/seek replaces the plan', () => {
    vi.stubGlobal('currentTime', 0);
    const processor = new Worklet(); processor.port.onmessage!({ data: { type: 'plan', plan } });
    for (let frame = 0; frame < 5120; frame += 128) block(processor, frame);
    processor.port.onmessage!({ data: { type: 'plan', plan: null } });
    for (let frame = 5120; frame < 24000; frame += 128) expect(block(processor, frame).every(value => value === 0)).toBe(true);
  });
});
