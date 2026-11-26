import { useLayoutEffect, useRef } from 'react';

/** Restore a docked editor's visible launcher before its controls unmount.
 * Focus moved to transport or another surface belongs to that surface. */
export function useDockedEditorFocus(cancelLabel: string) {
  const region = useRef<HTMLElement>(null);
  // Read while rendering: the tool strip redraws as the editor opens, which removes the launcher before any effect runs.
  const launcher = useRef<Element | null | undefined>(undefined);
  if (launcher.current === undefined) launcher.current = document.activeElement;
  useLayoutEffect(() => {
    const opener = launcher.current, name = opener?.getAttribute('aria-label');
    region.current?.querySelector<HTMLElement>(`[aria-label="${cancelLabel}"]`)?.focus();
    return () => {
      const active = document.activeElement;
      if (active !== document.body && !region.current?.contains(active)) return;
      const shown = (node: Element | null | undefined): node is HTMLElement => node instanceof HTMLElement && node !== document.body && node.isConnected && !!node.getClientRects().length && !node.closest('[hidden], [inert]');
      const field = document.querySelector<HTMLElement>('.field-container');
      (shown(opener) ? opener : field)?.focus({ preventScroll: true });
      if (shown(opener) || !name) return;
      // A launcher that was redrawn is back once this update is in the document: return to it by name.
      queueMicrotask(() => {
        if (document.activeElement !== field && document.activeElement !== document.body) return;
        [...document.querySelectorAll<HTMLElement>('button')].find(node => node.getAttribute('aria-label') === name && shown(node))?.focus({ preventScroll: true });
      });
    };
  }, []);
  return region;
}
