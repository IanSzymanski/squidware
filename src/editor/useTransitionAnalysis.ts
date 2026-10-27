import { useSyncExternalStore } from 'react';
import type { Project } from '../types';
import { useShowAnalysis } from './ShowAnalysis';
const opening = { status: 'ready' as const, issues: [] };
const pending = { status: 'pending' as const, issues: [] };
export function useTransitionAnalysis(project: Project, index: number, epoch: number) {
  const service = useShowAnalysis();
  const snapshot = () => {
    const state = service.getSnapshot();
    return index === 0 ? opening : state.project !== project || state.epoch !== epoch ? pending : state.moves[index - 1] ?? pending;
  };
  const state = useSyncExternalStore(service.subscribe, snapshot, snapshot);
  return { ...state, error: 'error' in state ? state.error as string : undefined, retry: service.retry };
}
