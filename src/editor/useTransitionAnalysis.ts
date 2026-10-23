import { useEffect, useMemo, useRef, useState } from 'react';
import { AnalysisClient } from '../analysis/client';
import type { AnalysisState } from '../analysis/client';
import { transitionInput } from '../analysis/input';
import type { Project } from '../types';

export function useTransitionAnalysis(project: Project, index: number, epoch: number) {
  const input = useMemo(() => transitionInput(project, index, epoch), [project, index, epoch]);
  const [state, setState] = useState<AnalysisState>({ input: null, status: 'ready' });
  const client = useRef<AnalysisClient | null>(null);
  useEffect(() => {
    const next = new AnalysisClient(() => new Worker(new URL('../analysis/analysis.worker.ts', import.meta.url), { type: 'module' }), setState);
    client.current = next;
    return () => { next.dispose(); client.current = null; };
  }, []);
  useEffect(() => { client.current?.request(input); }, [input]);
  // Render can precede effect cleanup. Never show prior-revision flags or a
  // passing state during that window, including undo and same-ID project loads.
  const current: AnalysisState = !input ? { input: null, status: 'ready' }
    : state.input === input ? state : { input, status: 'pending' };
  return { ...current, issues: current.result?.issues ?? [], retry: () => client.current?.request(input) };
}
