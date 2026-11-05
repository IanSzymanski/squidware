import type { EditorState } from './state';
import type { EditorStore } from './store';

export type ConfirmationRequest = NonNullable<EditorState['ui']['confirmation']>;
/** Menus, shortcuts, the palette and selection tools treat a pending confirmation like an open dialog. */
export const isModalOpen = (state: EditorState) => !!state.ui.dialog || !!state.ui.confirmation;

/** One promise-based in-app confirmation at a time. The request lives in
 * ui.confirmation so command, menu and shortcut guards treat it like a dialog.
 * A newer request or any external clear (such as a production load) cancels
 * the waiting caller instead of leaving it pending. */
export function createConfirmation(store: EditorStore) {
  let pending: { request: ConfirmationRequest; resolve: (confirmed: boolean) => void } | null = null;
  function settle(confirmed: boolean) {
    const current = pending; if (!current) return;
    pending = null;
    if (store.getState().ui.confirmation === current.request) store.setValue('ui', 'confirmation', null);
    current.resolve(confirmed);
  }
  return {
    confirm(request: ConfirmationRequest) {
      settle(false);
      const next = { ...request };
      return new Promise<boolean>(resolve => { pending = { request: next, resolve }; store.setValue('ui', 'confirmation', next); });
    },
    settle,
    connect: () => store.subscribe(() => { if (pending && store.getState().ui.confirmation !== pending.request) settle(false); }),
  };
}
