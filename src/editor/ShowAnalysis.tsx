import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ShowAnalysis } from '../analysis/show';
import { useEditorStore } from './react';
const Context = createContext<ShowAnalysis | null>(null);
export function ShowAnalysisProvider({ children }: { children: ReactNode }) {
  const store = useEditorStore();
  const [service] = useState(() => new ShowAnalysis(store, () => new Worker(new URL('../analysis/analysis.worker.ts', import.meta.url), { type: 'module' })));
  useEffect(() => { service.start(); return () => service.dispose(); }, [service]);
  return <Context.Provider value={service}>{children}</Context.Provider>;
}
export function useShowAnalysis() {
  const service = useContext(Context);
  if (!service) throw Error('Show analysis needs its provider.');
  return service;
}
export function useShowChecks() {
  const service = useShowAnalysis();
  return useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot);
}

export function reviewProblem(service: ShowAnalysis, store: ReturnType<typeof useEditorStore>, finding: import('../analysis/show').Finding) {
  const checks = service.getSnapshot();
  if (!checks.moves.some(m => m.moveId === finding.moveId && m.status === 'ready' && m.issues.includes(finding.issue))) return;
  if (store.dispatch('analysis.problem-review', { epoch: checks.epoch, moveId: finding.moveId, atCount: finding.issue.atCount ?? 0, ids: finding.issue.performerIds }) === true) service.select(finding);
}
