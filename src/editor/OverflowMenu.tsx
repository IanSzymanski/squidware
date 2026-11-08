import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { HelpButton } from './ControlHelp';

/** Holds controls that do not fit at the current breakpoint (#178). Its panel follows the trigger in DOM and Tab
 * order, so moved controls keep their relative order. An outside pointer or focus closes it; Escape closes it and
 * returns focus to the trigger before any editor-wide Escape action runs. A dialog opened from the panel is not
 * outside it: the panel stays open underneath, so the dialog returns focus to the control that opened it. */
export function OverflowMenu({ title, description, placement = 'below', className = '', children }: { title: string; description: string; placement?: 'above' | 'below'; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => { const target = event.target as Element; if (!root.current?.contains(target) && !target.closest?.('dialog')) setOpen(false); };
    document.addEventListener('pointerdown', outside); document.addEventListener('focusin', outside);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside); };
  }, [open]);
  return <div ref={root} className={`overflow-menu ${className}`} data-overflow-open={open || undefined}
    onKeyDown={event => { if (!open || event.key !== 'Escape' || event.nativeEvent.isComposing) return; event.preventDefault(); event.stopPropagation(); setOpen(false); root.current?.querySelector<HTMLElement>('.overflow-menu-trigger')?.focus(); }}>
    <HelpButton pointerPassThrough title={title} description={description} className={`icon-button overflow-menu-trigger${open ? ' active' : ''}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><MoreHorizontal size={17} /></HelpButton>
    {open && <div id={id} className={`overflow-menu-panel overflow-menu-panel--${placement}`} role="group" aria-label={title}>{children}</div>}
  </div>;
}
