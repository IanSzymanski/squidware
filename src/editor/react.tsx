import { createContext, useCallback, useContext, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { EditorStore } from './store';
import type { EditorState, SessionSlice } from './state';

const StoreContext = createContext<EditorStore | null>(null);
export function EditorProvider({ store, children }: { store: EditorStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
export function useEditorStore(): EditorStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('Editor components must be inside EditorProvider.');
  return store;
}
export function useEditorSelector<T>(selector: (state: EditorState) => T): T {
  const store = useEditorStore();
  const selectorRef = useRef(selector); selectorRef.current = selector;
  const subscribe = useCallback((listener: () => void) => store.subscribeSelector(state => selectorRef.current(state), listener), [store]);
  const snapshot = useCallback(() => selectorRef.current(store.getState()), [store]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
export function useEditorValue<S extends SessionSlice, K extends keyof EditorState[S]>(slice: S, key: K) {
  const store = useEditorStore();
  const value = useEditorSelector(state => state[slice][key]);
  const setValue = useCallback((next: EditorState[S][K] | ((previous: EditorState[S][K]) => EditorState[S][K])) => store.setValue(slice, key, next), [store, slice, key]);
  return [value, setValue] as const;
}
