import { useSyncExternalStore } from 'react';
import type { Project } from '../types';
import { useShowAnalysis } from './ShowAnalysis';
const opening = { status: 'ready' as const, issues: [] };
const pending = { status: 'pending' as const, issues: [] };
export function useTransitionAnalysis(project: Project, index: number, epoch: number) {
  const service = useShowAnalysis();
  const snapshot = () => {
    const state = service.getSnapshot();
    if (state.project !== project || state.epoch !== epoch) return index === 0 && !project.clearanceRules ? opening : pending;
    if (index === 0) return state.moves[0]?.index === 0 ? state.moves[0] : opening;
    return state.moves[index - 1] ?? pending;
  };
  const state = useSyncExternalStore(service.subscribe, snapshot, snapshot);
  return { ...state, error: 'error' in state ? state.error as string : undefined, retry: service.retry };
}
