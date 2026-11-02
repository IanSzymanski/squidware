import { ClickSchedule } from './clickSchedule';
import type { ClickPlan, ScheduledClick } from './clickSchedule';

// AudioWorklet globals are supplied by Chromium's audio rendering thread.
declare const currentTime: number, sampleRate: number;
declare class AudioWorkletProcessor { port: MessagePort }
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class MetronomeProcessor extends AudioWorkletProcessor {
  private scheduler: ClickSchedule | null = null;
  private queue: (ScheduledClick & { reported?: boolean })[] = [];
  private diagnostics = false;
  private sequence: number | undefined;
  private lastShowCount = -Infinity;
  constructor() {
    super();
    this.port.onmessage = ({ data }: MessageEvent<{ type: string; plan?: ClickPlan; diagnostics?: boolean }>) => {
      if (data.type === 'diagnostics') { this.diagnostics = !!data.diagnostics; return; }
      // The control message itself can arrive late under load. Place its
      // one-time startup cue in an upcoming audio block, while preserving the
      // media anchor used by every following beat.
      const plan = data.plan?.cue ? { ...data.plan, cue: { ...data.plan.cue,
        time: Math.max(data.plan.cue.time, currentTime + 128 / sampleRate) } } : data.plan;
      if (plan && (plan.sequence === undefined || plan.sequence !== this.sequence)) {
        this.sequence = plan.sequence;
        this.lastShowCount = -Infinity;
      }
      // A buffering stop cancels lookahead but retains beats already rendered.
      this.scheduler = plan ? new ClickSchedule(plan, currentTime) : null;
      this.queue = [];
    };
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0]?.[0];
    if (!output) return true;
    const end = currentTime + output.length / sampleRate;
    if (this.scheduler) this.queue.push(...this.scheduler.until(end + .1));
    const continuous = this.sequence !== undefined && !this.scheduler?.plan.loop;
    for (const event of this.queue) {
      // Reanchoring to a slower media device can put an already heard beat back
      // in the future. Suppress its new onset, while allowing an active tail,
      // explicit seeks/restarts and normal repeating rehearsal loop cycles.
      if (continuous && !event.reported && event.phase === 'show' && event.count <= this.lastShowCount) continue;
      const start = Math.max(0, Math.ceil((event.time - currentTime) * sampleRate));
      const frequency = event.accent === 'bar' ? 1320 : event.accent === 'group' ? 990 : 660;
      for (let i = start; i < output.length; i++) {
        const elapsed = currentTime + i / sampleRate - event.time;
        if (elapsed >= 0 && elapsed < .04) output[i] += .12 * Math.sin(2 * Math.PI * frequency * elapsed) * Math.exp(-150 * elapsed);
      }
      if (!event.reported && start < output.length && event.time + .04 > currentTime) {
        event.reported = true;
        if (continuous && event.phase === 'show') this.lastShowCount = event.count;
        if (this.diagnostics) this.port.postMessage({ type: 'click', time: event.time, count: event.count,
          accent: event.accent, phase: event.phase, renderTime: currentTime + start / sampleRate });
      }
    }
    this.queue = this.queue.filter(event => event.time + .04 >= end);
    return true;
  }
}
registerProcessor('squidware-metronome', MetronomeProcessor);
