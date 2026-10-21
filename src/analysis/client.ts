import type { AnalysisInput, AnalysisRequest, AnalysisResponse, AnalysisResult } from './input';

export type AnalysisState = { input: AnalysisInput | null; status: 'pending' | 'ready' | 'error'; result?: AnalysisResult; error?: string };
export interface AnalysisWorker {
  postMessage(message: AnalysisRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<AnalysisResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
}

/** Owns one worker, monotonic revisions, coalesced requests and a bounded wait. */
export class AnalysisClient {
  private worker?: AnalysisWorker;
  private revision = 0;
  private scheduled?: ReturnType<typeof setTimeout>;
  private watchdog?: ReturnType<typeof setTimeout>;
  private input: AnalysisInput | null = null;
  private disposed = false;
  constructor(private createWorker: () => AnalysisWorker, private publish: (state: AnalysisState) => void, private timeoutMs = 15000) {}

  request(input: AnalysisInput | null) {
    if (this.disposed) return;
    this.input = input;
    const revision = ++this.revision;
    clearTimeout(this.scheduled); clearTimeout(this.watchdog);
    this.publish({ input, status: input ? 'pending' : 'ready' });
    // Clear flags immediately; only the last snapshot in a burst is cloned.
    this.scheduled = setTimeout(() => {
      try {
        if (!input && !this.worker) return;
        if (!this.worker) {
          const worker = this.createWorker(); this.worker = worker;
          worker.onmessage = ({ data }) => {
            if (this.disposed || worker !== this.worker || data.revision !== this.revision) return;
            clearTimeout(this.watchdog);
            if ('error' in data) this.fail(data.error);
            else this.publish({ input: this.input, status: 'ready', result: data.result });
          };
          worker.onerror = worker.onmessageerror = () => { if (worker === this.worker) this.fail('Transition check is unavailable. Retry to check this move.'); };
        }
        this.worker.postMessage({ revision, input });
        if (input) this.watchdog = setTimeout(() => this.fail('Transition check timed out. Retry to check this move.'), this.timeoutMs);
      } catch { this.fail('Transition check could not start. Retry to check this move.'); }
    }, 0);
  }
  private fail(error: string) {
    if (this.disposed) return;
    clearTimeout(this.watchdog);
    this.worker?.terminate(); this.worker = undefined;
    this.publish({ input: this.input, status: 'error', error });
  }
  dispose() {
    this.disposed = true; this.revision++;
    clearTimeout(this.scheduled); clearTimeout(this.watchdog);
    this.worker?.terminate(); this.worker = undefined;
  }
}
