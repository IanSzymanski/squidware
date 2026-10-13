import { createDemoProject, parseProject, setStartCount, totalCounts, validateProject, validateProjectEdit } from '../domain';
import type { Project } from '../types';
import { executeCommand } from './commands';
import type { CommandArguments, CommandContext, CommandId, ExternalCommandId } from './commands';
import { createEditorState } from './state';
import type { EditorState, ProjectHistory, SessionSlice } from './state';
import { applyProjectPatches, estimatePatchBytes, projectPatches, retainHistory } from './history';
import type { HistoryPatch } from './history';
import { historyName } from './historyNames';

export const AUTOSAVE_KEY = 'squidware.autosave.v1';
type Equality<T> = (a: T, b: T) => boolean;
export interface EditorStore {
  getState: () => EditorState;
  subscribe: (listener: () => void) => () => void;
  subscribeSelector: <T>(selector: (state: EditorState) => T, listener: () => void, equal?: Equality<T>) => () => void;
  setValue: <S extends SessionSlice, K extends keyof EditorState[S]>(slice: S, key: K, value: EditorState[S][K] | ((previous: EditorState[S][K]) => EditorState[S][K])) => void;
  dispatch: <I extends CommandId>(id: I, ...args: CommandArguments[I] extends undefined ? [args?: undefined] : [args: CommandArguments[I]]) => boolean | Promise<boolean>;
  registerExternal: (id: ExternalCommandId, handler: () => void | Promise<void>) => () => void;
  beginTransaction: (name: string) => void;
  commitTransaction: () => void;
  cancelTransaction: () => void;
  transact: (name: string, action: () => void) => void;
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
  let revisionClock = 0;
  let actionName = 'Edit production';
  let active: { name: string; history: ProjectHistory; selection: EditorState['selection']; playback: EditorState['playback']; error?: Error } | null = null;
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
  const commit = (before: ProjectHistory, next: Project, name: string, revision: number, changes?: HistoryPatch[]) => {
    const patches = changes ?? projectPatches(before.present, next);
    if (!patches.length) {
      if (state.project !== before) publish({ ...state, project: before });
      return;
    }
    const entry = { name, patches, beforeRevision: before.revision, afterRevision: revision, estimatedBytes: estimatePatchBytes(patches) + name.length * 2 + 128 };
    const retained = retainHistory([...before.past, entry]);
    publish({ ...state, project: { present: next, past: retained.past, future: [], revision,
      estimatedBytes: retained.estimatedBytes, droppedEntries: before.droppedEntries + retained.dropped } });
  };
  const commitTransaction = () => {
    if (!active) return;
    if (active.error) { const error = active.error; cancelTransaction(); throw error; }
    const transaction = active; active = null;
    commit(transaction.history, state.project.present, transaction.name, state.project.revision);
  };
  const cancelTransaction = () => {
    if (!active) return;
    const transaction = active; active = null;
    publish({ ...state, project: transaction.history, selection: transaction.selection, playback: transaction.playback });
  };
  const context: CommandContext = {
    getState: () => state,
    patch,
    edit: change => {
      if (active?.error) throw active.error;
      const next = change(state.project.present);
      const changes = projectPatches(state.project.present, next);
      if (!changes.length) return;
      validateProjectEdit(state.project.present, next);
      const revision = ++revisionClock;
      if (active) publish({ ...state, project: { ...state.project, present: next, revision } });
      else commit(state.project, next, actionName, revision, changes);
      reconcile(next);
    },
    load: project => {
      const next = validateProject(project);
      active = null;
      const revision = ++revisionClock;
      publish({ ...state, project: { present: next, past: [], future: [], revision, estimatedBytes: 0, droppedEntries: 0 } });
      patch('fileSession', { savedRevision: revision });
      patch('selection', { activeIndex: 0, selectedIds: [] }); patch('playback', { count: 0, playing: false });
      patch('ui', { projectEpoch: state.ui.projectEpoch + 1, dialog: null, pendingDraft: false });
    },
    history: direction => {
      const history = state.project;
      if (active) return;
      const entry = direction === 'undo' ? history.past.at(-1) : history.future[0];
      if (!entry) return;
      publish({ ...state, project: { ...history, present: applyProjectPatches(history.present, entry.patches, direction),
        past: direction === 'undo' ? history.past.slice(0, -1) : [...history.past, entry],
        future: direction === 'undo' ? [entry, ...history.future] : history.future.slice(1),
        revision: direction === 'undo' ? entry.beforeRevision : entry.afterRevision } });
      reconcile(state.project.present, true);
    },
    external: id => {
      commitTransaction();
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
      const previousName = actionName;
      actionName = historyName(state, id, args[0] as CommandArguments[typeof id]);
      try {
        const result = executeCommand(context, id, args[0] as CommandArguments[typeof id]);
        return result instanceof Promise ? result.catch(error => { patch('ui', { toast: (error as Error).message }); return false; }) : result;
      }
      catch (error) { if (active) active.error = error as Error; patch('ui', { toast: (error as Error).message }); return false; }
      finally { actionName = previousName; transactionDepth--; if (!transactionDepth && changed) { changed = false; listeners.forEach(listener => listener()); } }
    },
    beginTransaction: name => {
      if (active) throw new Error('Finish or cancel the current transaction first.');
      if (!name.trim() || name.length > 240) throw new Error('Transactions need a name of 1–240 characters.');
      active = { name, history: state.project, selection: state.selection, playback: state.playback };
      publish({ ...state, project: { ...state.project, transactionName: name } });
    },
    commitTransaction,
    cancelTransaction,
    transact: (name, action) => {
      if (active) throw new Error('Finish or cancel the current transaction first.');
      transactionDepth++;
      try { store.beginTransaction(name); action(); commitTransaction(); }
      catch (error) { cancelTransaction(); throw error; }
      finally { transactionDepth--; if (!transactionDepth && changed) { changed = false; listeners.forEach(listener => listener()); } }
    },
    registerExternal: (id, handler) => { external.set(id, handler); return () => { if (external.get(id) === handler) external.delete(id); }; },
  };
  return store;
}
