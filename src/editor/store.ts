import { createDemoProject, parseProject, setStartCount, totalCounts, validateProject, validateProjectEdit } from '../domain';
import type { Project } from '../types';
import { executeCommand } from './commands';
import type { CommandArguments, CommandContext, CommandId, ExternalCommandId } from './commands';
import { createEditorState } from './state';
import type { EditorState, SessionSlice } from './state';

export const AUTOSAVE_KEY = 'squidware.autosave.v1';
type Equality<T> = (a: T, b: T) => boolean;
export interface EditorStore {
  getState: () => EditorState;
  subscribe: (listener: () => void) => () => void;
  subscribeSelector: <T>(selector: (state: EditorState) => T, listener: () => void, equal?: Equality<T>) => () => void;
  setValue: <S extends SessionSlice, K extends keyof EditorState[S]>(slice: S, key: K, value: EditorState[S][K] | ((previous: EditorState[S][K]) => EditorState[S][K])) => void;
  dispatch: <I extends CommandId>(id: I, ...args: CommandArguments[I] extends undefined ? [args?: undefined] : [args: CommandArguments[I]]) => boolean | Promise<boolean>;
  registerExternal: (id: ExternalCommandId, handler: () => void | Promise<void>) => () => void;
}

export function recoverProject(storage?: Pick<Storage, 'getItem'> | (() => Pick<Storage, 'getItem'>)): { project: Project; recoveryError?: string } {
  const project = createDemoProject();
  try {
    const saved = (typeof storage === 'function' ? storage() : storage)?.getItem(AUTOSAVE_KEY);
    return { project: saved ? parseProject(saved) : project };
  } catch (error) { return { project, recoveryError: (error as Error).message }; }
}

export function createEditorStore(project: Project, recoveryError?: string): EditorStore {
  let state = createEditorState(validateProject(project), recoveryError);
  const listeners = new Set<() => void>();
  const external = new Map<ExternalCommandId, () => void | Promise<void>>();
  let transactionDepth = 0;
  let changed = false;
  const publish = (next: EditorState) => {
    if (next === state) return;
    state = next; changed = true;
    if (!transactionDepth) { changed = false; listeners.forEach(listener => listener()); }
  };
  const patch: CommandContext['patch'] = (slice, update) => {
    const current = state[slice] as unknown as Record<string, unknown>;
    if (Object.entries(update).every(([key, value]) => Object.is(current[key], value))) return;
    publish({ ...state, [slice]: { ...state[slice], ...update } });
  };
  const reconcile = (nextProject: Project, arrive = false) => {
    const activeIndex = Math.min(state.selection.activeIndex, nextProject.sets.length - 1);
    const selectedIds = state.selection.selectedIds.filter(id => nextProject.performers.some(p => p.id === id));
    if (activeIndex !== state.selection.activeIndex || selectedIds.length !== state.selection.selectedIds.length) patch('selection', { activeIndex, selectedIds });
    const count = arrive ? setStartCount(nextProject, activeIndex) : Math.min(state.playback.count, totalCounts(nextProject));
    patch('playback', arrive ? { count, playing: false } : { count });
  };
  const context: CommandContext = {
    getState: () => state,
    patch,
    edit: change => {
      const next = change(state.project.present);
      if (JSON.stringify(next) === JSON.stringify(state.project.present)) return;
      validateProjectEdit(state.project.present, next);
      publish({ ...state, project: { past: [...state.project.past.slice(-79), state.project.present], present: next, future: [] } });
      reconcile(next);
    },
    load: project => {
      const next = validateProject(project);
      publish({ ...state, project: { present: next, past: [], future: [] } });
      patch('selection', { activeIndex: 0, selectedIds: [] }); patch('playback', { count: 0, playing: false });
      patch('ui', { projectEpoch: state.ui.projectEpoch + 1, dialog: null, pendingDraft: false });
    },
    history: direction => {
      const history = state.project;
      if (direction === 'undo' && history.past.length) publish({ ...state, project: { past: history.past.slice(0, -1), present: history.past.at(-1)!, future: [history.present, ...history.future] } });
      if (direction === 'redo' && history.future.length) publish({ ...state, project: { past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1) } });
      reconcile(state.project.present, true);
    },
    external: id => {
      const handler = external.get(id);
      if (!handler) throw new Error(`The ${id} controller is not available.`);
      return handler();
    },
  };
  const store: EditorStore = {
    getState: () => state,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    subscribeSelector: (selector, listener, equal = Object.is) => {
      let selected = selector(state);
      return store.subscribe(() => { const next = selector(state); if (!equal(selected, next)) { selected = next; listener(); } });
    },
    setValue: (slice, key, value) => {
      const previous = state[slice][key];
      const next = typeof value === 'function' ? (value as (valueBefore: typeof previous) => typeof previous)(previous) : value;
      patch(slice, { [key]: next } as unknown as Partial<EditorState[typeof slice]>);
    },
    dispatch: (id, ...args) => {
      transactionDepth++;
      try {
        const result = executeCommand(context, id, args[0] as CommandArguments[typeof id]);
        return result instanceof Promise ? result.catch(error => { patch('ui', { toast: (error as Error).message }); return false; }) : result;
      }
      catch (error) { patch('ui', { toast: (error as Error).message }); return false; }
      finally { transactionDepth--; if (!transactionDepth && changed) { changed = false; listeners.forEach(listener => listener()); } }
    },
    registerExternal: (id, handler) => { external.set(id, handler); return () => { if (external.get(id) === handler) external.delete(id); }; },
  };
  return store;
}
