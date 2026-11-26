import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { uiScale } from '../uiScale';
import { CommandKeycaps, HelpButton } from '../editor/ControlHelp';
import type { CommandId } from '../editor/commands';

export type MenuEntry =
  | { type: 'separator' }
  | { type: 'heading'; label: string }
  | {
    type?: 'item'; key?: string; label: string; icon?: ReactNode; description?: string;
    /** A second, quieter line under the label. A disabled item shows why it is unavailable here instead. */
    detail?: string;
    /** The action's name for assistive technology and Help, when the visible label is a shorter or longer form. */
    name?: string;
    /** Shows this command's shortcut and Help text beside the label. */
    command?: CommandId;
    hint?: string; checked?: boolean; disabled?: boolean; disabledReason?: string; danger?: boolean;
    /** Keep the menu open after choosing, for toggles the writer may flip several of. */
    keepOpen?: boolean;
    onSelect: () => void;
  };

interface MenuProps {
  /** Accessible name and tooltip title of the trigger. */
  label: string;
  description?: string;
  items: readonly (MenuEntry | false | null | undefined)[];
  children: ReactNode;
  className?: string;
  /** Extra class for the menu panel. */
  menuClassName?: string;
  align?: 'start' | 'end';
  side?: 'below' | 'above';
  disabled?: boolean;
  disabledReason?: string;
  active?: boolean;
  tabIndex?: number;
}

/** A button that opens a menu of actions. Arrow keys move, Enter chooses, Escape returns focus to the button. */
export function Menu({ label, description, items, children, className = 'icon-button', menuClassName = '', align = 'start', side = 'below', disabled, disabledReason, active, tabIndex }: MenuProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null), panel = useRef<HTMLDivElement>(null);
  const keyboard = useRef(false);
  const id = useId();
  const entries = items.filter(Boolean) as MenuEntry[];
  // A menu opened from a dialog must live inside it, in the top layer.
  const [host, setHost] = useState<Element>(() => document.body);
  useLayoutEffect(() => { setHost(trigger.current?.closest('dialog') ?? document.body); }, []);

  const close = (restoreFocus = true) => { setOpen(false); if (restoreFocus) trigger.current?.focus({ preventScroll: true }); };

  useLayoutEffect(() => {
    const node = panel.current, anchor = trigger.current;
    if (!open || !node || !anchor) return;
    const scale = uiScale(), rect = anchor.getBoundingClientRect();
    const view = { width: document.documentElement.clientWidth / scale, height: document.documentElement.clientHeight / scale };
    const box = { width: node.offsetWidth, height: node.offsetHeight }, gap = 6, margin = 8;
    const left = align === 'end' ? rect.right / scale - box.width : rect.left / scale;
    const below = rect.bottom / scale + gap, above = rect.top / scale - gap - box.height;
    const fitsBelow = below + box.height <= view.height - margin, fitsAbove = above >= margin;
    const top = side === 'above' ? (fitsAbove || !fitsBelow ? Math.max(margin, above) : below) : (fitsBelow || !fitsAbove ? below : above);
    Object.assign(node.style, {
      left: `${Math.max(margin, Math.min(left, view.width - box.width - margin))}px`,
      top: `${top}px`,
      maxHeight: `${Math.max(120, view.height - top - margin)}px`,
    });
    const first = node.querySelector<HTMLElement>('[role^=menuitem]');
    if (keyboard.current) first?.focus(); else node.focus({ preventScroll: true });
  }, [open, align, side, entries.length]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    const away = () => setOpen(false);
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', away); window.addEventListener('blur', away);
    return () => { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('resize', away); window.removeEventListener('blur', away); };
  }, [open]);

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing) return;
    const options = [...event.currentTarget.querySelectorAll<HTMLElement>('[role^=menuitem]')];
    const at = options.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === 'Tab') { event.preventDefault(); close(); return; }
    // Enter and Space activate the focused item only; they never reach editor shortcuts such as Play.
    if (event.key === 'Enter' || event.key === ' ') { event.stopPropagation(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !options.length) return;
    event.preventDefault(); event.stopPropagation();
    options[event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (at + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]?.focus();
  }

  return <>
    <HelpButton pointerPassThrough title={label} description={description ?? label} className={`${className}${open ? ' active' : ''}`}
      aria-haspopup="menu" aria-expanded={open} aria-controls={id} aria-pressed={active} tabIndex={tabIndex}
      disabled={disabled} disabledReason={disabledReason} data-menu-trigger="" ref={(node: HTMLButtonElement | null) => { if (node) trigger.current = node; }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' && !open && !disabled) { event.preventDefault(); event.stopPropagation(); trigger.current = event.currentTarget; keyboard.current = true; setOpen(true); }
        if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
      }}
      onClick={event => { trigger.current = event.currentTarget; keyboard.current = event.detail === 0; setOpen(!open); }}>{children}</HelpButton>
    {/* The menu stays mounted while closed (hidden and inert), so its actions keep one place in the document. */}
    {createPortal(<div ref={panel} id={id} role="menu" aria-label={label} tabIndex={-1} className={`popover menu ${menuClassName}`} hidden={!open} inert={!open} data-escape-scope={open ? '' : undefined} onKeyDown={keyDown}>
      {entries.map((entry, index) => {
        if (entry.type === 'separator') return <div key={index} className="menu-separator" role="separator" />;
        if (entry.type === 'heading') return <div key={index} className="menu-heading">{entry.label}</div>;
        const role = entry.checked === undefined ? 'menuitem' : 'menuitemcheckbox';
        return <HelpButton key={entry.key ?? `${entry.label}-${index}`} pointerPassThrough role={role} aria-checked={entry.checked} tabIndex={-1}
          title={entry.name ?? entry.label.replace(/…$/, '')} description={entry.description} command={entry.command} showShortcut={false}
          state={entry.checked === undefined ? undefined : entry.checked ? 'On' : 'Off'}
          disabled={entry.disabled} disabledReason={entry.disabledReason}
          className={`menu-item${entry.danger ? ' danger' : ''}${entry.detail ? ' menu-item--detailed' : ''}`}
          onClick={() => {
            // Focus returns to the stable trigger first, so a dialog this opens gives focus back to it on close.
            if (!entry.keepOpen) close();
            entry.onSelect();
          }}>
          {entry.icon}
          {entry.detail
            ? <span className="menu-item-text"><span className="menu-item-label">{entry.label}</span><span className="menu-item-detail">{entry.disabled && entry.disabledReason ? entry.disabledReason : entry.detail}</span></span>
            : <span className="menu-item-label">{entry.label}</span>}
          {entry.hint && <span className="menu-item-hint">{entry.hint}</span>}
          {entry.command && <CommandKeycaps command={entry.command} />}
          {entry.checked !== undefined && <span className="menu-item-check">{entry.checked && <Check size={14} />}</span>}
        </HelpButton>;
      })}
    </div>, host)}
  </>;
}
