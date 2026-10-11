import { useReducer } from 'react';
import type { Project } from './types';
import { createDemoProject, parseProject } from './domain';

export const AUTOSAVE_KEY = 'squidware.autosave.v1';
interface History { past: Project[]; present: Project; future: Project[]; recoveryError?: string }
type Action = { type: 'change'; change: (project: Project) => Project } | { type: 'load'; project: Project } | { type: 'undo' } | { type: 'redo' };
function initial(): History {
  let project = createDemoProject();
  try { const saved = localStorage.getItem(AUTOSAVE_KEY); if (saved) project = parseProject(saved); }
  catch (error) { return { past: [], present: project, future: [], recoveryError: (error as Error).message }; }
  return { past: [], present: project, future: [] };
}
function reducer(state: History, action: Action): History {
  if (action.type === 'load') return { past: [], present: action.project, future: [] };
  if (action.type === 'undo') {
    if (!state.past.length) return state;
    return { past: state.past.slice(0, -1), present: state.past.at(-1)!, future: [state.present, ...state.future] };
  }
  if (action.type === 'redo') {
    if (!state.future.length) return state;
    return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) };
  }
  const next = action.change(state.present);
  if (JSON.stringify(next) === JSON.stringify(state.present)) return state;
  return { past: [...state.past.slice(-79), state.present], present: next, future: [] };
}
export function useProject() {
  const [history, dispatch] = useReducer(reducer, undefined, initial);
  return { project: history.present, recoveryError: history.recoveryError, canUndo: !!history.past.length, canRedo: !!history.future.length,
    change: (change: (project: Project) => Project) => dispatch({ type: 'change', change }),
    load: (project: Project) => dispatch({ type: 'load', project }),
    undo: () => dispatch({ type: 'undo' }), redo: () => dispatch({ type: 'redo' }) };
}
