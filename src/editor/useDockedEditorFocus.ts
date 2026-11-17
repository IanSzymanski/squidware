import { useLayoutEffect, useRef } from 'react';

/** Restore a docked editor's visible launcher before its controls unmount.
 * Focus moved to transport or another surface belongs to that surface. */
export function useDockedEditorFocus(cancelLabel: string) {
  const region = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const opener = document.activeElement;
    region.current?.querySelector<HTMLElement>(`[aria-label="${cancelLabel}"]`)?.focus();
    return () => {
      const active = document.activeElement;
      if (active !== document.body && !region.current?.contains(active)) return;
      const target = opener instanceof HTMLElement && opener.isConnected && opener.getClientRects().length && !opener.closest('[hidden], [inert]')
        ? opener : document.querySelector<HTMLElement>('.field-container');
      target?.focus({ preventScroll: true });
    };
  }, []);
  return region;
}
