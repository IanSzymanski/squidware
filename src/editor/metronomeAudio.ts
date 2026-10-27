import processorUrl from './metronomeProcessor.ts?worker&url';
import type { ClickPlan } from './clickSchedule';

/** One node per mounted editor. Loading can finish after stop or disposal. */
export class MetronomeAudio {
  private node: AudioWorkletNode | null = null;
  private loading: Promise<void> | null = null;
  private plan: ClickPlan | null = null;
  private disposed = false;
  constructor(private context: AudioContext, private failed: () => void) { this.prepare(); }
  update(plan: ClickPlan | null) {
    this.plan = plan;
    if (this.node) { this.node.port.postMessage({ type: 'plan', plan }); return; }
    if (plan) this.prepare();
  }
  private prepare() {
    if (this.loading || this.disposed) return;
    this.loading = Promise.resolve().then(() => this.context.audioWorklet.addModule(processorUrl)).then(() => {
      if (this.disposed) return;
      this.node = new AudioWorkletNode(this.context, 'squidware-metronome', { numberOfInputs: 0, outputChannelCount: [1] });
      this.node.onprocessorerror = () => { if (!this.disposed) this.failed(); };
      this.node.connect(this.context.destination);
      this.node.port.postMessage({ type: 'plan', plan: this.plan });
    }).catch(() => { if (!this.disposed) this.failed(); });
  }
  dispose() { this.disposed = true; this.plan = null; this.node?.port.postMessage({ type: 'plan', plan: null }); this.node?.disconnect(); this.node?.port.close(); }
}
