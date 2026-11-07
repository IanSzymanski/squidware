/** A yield for long, budgeted jobs in a background worker that does not wait on a timer. Each worker that runs one
 * creates a single instance and passes it to every pause of its job: the movement and assignment comparison workers
 * (`formationTransition.worker.ts`, `assignment.worker.ts`, 20-second budget) and the per-move check worker
 * (`analysis/analysis.worker.ts`, behind AnalysisClient's 15-second watchdog). `src/workerWiring.test.ts` proves each one.
 *
 * A zero-delay setTimeout is clamped to at least 4 ms once nested, and macOS can coalesce worker timers far more, so
 * a job that yields often spent most of its wall-clock budget waiting: the group movement check ran at about 10% CPU
 * and still exceeded its 20-second budget on macOS CI, and with worker timers held to a 40 to 72 ms minimum a heavy
 * detailed move check took 25 to over 40 seconds instead of about 3.5. A message on a private channel is a plain task
 * instead. Any message the worker has already received (a newer request that cancels this job) still runs first,
 * because it was queued before the yield. Waiters resume in order, so an outdated job paused at a yield is never
 * stranded. */
export function messageYield(): () => Promise<void> {
  const channel = new MessageChannel(), waiting: (() => void)[] = [];
  channel.port1.onmessage = () => waiting.shift()?.();
  // Node (unit tests) would otherwise keep the process alive for an open port; workers have no unref.
  (channel.port1 as unknown as { unref?: () => void }).unref?.();
  return () => new Promise<void>(resolve => { waiting.push(resolve); channel.port2.postMessage(null); });
}
