import { useLayoutEffect, useRef, useState } from 'react';

const usable = (node: Element | null | undefined): node is HTMLElement =>
  node instanceof HTMLElement && node.isConnected && !!node.getClientRects().length && !node.closest('[hidden], [inert]');

/** Restore a docked editor's visible launcher before its controls unmount.
 * Focus moved to transport or another surface belongs to that surface. */
export function useDockedEditorFocus(cancelLabel: string) {
  const region = useRef<HTMLElement>(null);
  // Opening a docked editor rebuilds the tool strip in the same commit, which removes the menu button that launched it
  // before any effect runs. Note that button while it still has focus, so the one that replaces it can be found again.
  const [launcher] = useState(() => {
    const node = document.activeElement;
    return { node, menu: node?.hasAttribute('data-menu-trigger') ? node.getAttribute('aria-label') : null };
  });
  useLayoutEffect(() => {
    const opener = document.activeElement;
    region.current?.querySelector<HTMLElement>(`[aria-label="${cancelLabel}"]`)?.focus();
    return () => {
      const active = document.activeElement;
      if (active !== document.body && !region.current?.contains(active)) return;
      const menu = launcher.menu && !launcher.node?.isConnected
        ? [...document.querySelectorAll<HTMLElement>('[data-menu-trigger]')].find(node => node.getAttribute('aria-label') === launcher.menu && usable(node))
        : undefined;
      const target = menu ?? (usable(opener) ? opener : document.querySelector<HTMLElement>('.field-container'));
      target?.focus({ preventScroll: true });
    };
  }, []);
  return region;
}
