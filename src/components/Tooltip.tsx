import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HTMLAttributes, ReactElement } from 'react';

export function Keycaps({ groups }: { groups: readonly (readonly string[])[] }) {
  return <span className="shortcut-keycaps">{groups.map((keys, index) => <span key={index}>{index > 0 && <span className="shortcut-or">or</span>}{keys.map((key, i) => <kbd key={i}>{key}</kbd>)}</span>)}</span>;
}

type TriggerProps = HTMLAttributes<HTMLElement> & { disabled?: boolean };
export interface TooltipProps {
  name: string;
  description: string;
  keycaps?: string[][];
  state?: string;
  disabledReason?: string;
  help?: { label: string; href: string };
  children: ReactElement<TriggerProps>;
}

/** A noninteractive description; an optional help link sits outside role=tooltip. */
export function Tooltip({ name, description, keycaps = [], state, disabledReason, help, children }: TooltipProps) {
  const id = useId();
  const trigger = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const focused = useRef(false);
  const pointerFocus = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const cancelTimer = () => { clearTimeout(timer.current); timer.current = undefined; };
  const close = () => { cancelTimer(); setOpen(false); };
  const show = () => {
    cancelTimer();
    document.dispatchEvent(new CustomEvent('squidware-tooltip', { detail: id }));
    setOpen(true);
  };
  const leave = () => { cancelTimer(); if (!focused.current) timer.current = setTimeout(() => setOpen(false), 100); };
  useEffect(() => {
    const other = (event: Event) => { if ((event as CustomEvent<string>).detail !== id) close(); };
    document.addEventListener('squidware-tooltip', other);
    return () => { cancelTimer(); document.removeEventListener('squidware-tooltip', other); };
  }, [id]);
  const place = () => {
    if (!trigger.current || !panel.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const box = panel.current.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(margin, Math.min(anchor.left + (anchor.width - box.width) / 2, window.innerWidth - box.width - margin));
    const below = anchor.bottom + 8;
    const top = below + box.height <= window.innerHeight - margin ? below : Math.max(margin, anchor.top - box.height - 8);
    setPosition(previous => previous.left === left && previous.top === top ? previous : { left, top });
  };
  useLayoutEffect(() => { if (open) place(); }, [open, name, description, state, disabledReason]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      // Text/number editors also use Escape to cancel drafts. Let their target
      // handlers run; the command controller already ignores text-entry events.
      if (!(event.target instanceof HTMLElement) || !event.target.matches('input, textarea')) event.stopPropagation();
      close();
    };
    const outside = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node)) close(); };
    const scroll = (event: Event) => {
      if (panel.current?.contains(event.target as Node)) return;
      // Focusing an offscreen Inspector field can scroll its panel after focus
      // has already opened help. Keep keyboard help anchored to that control.
      if (focused.current && document.activeElement === trigger.current) place();
      else close();
    };
    document.addEventListener('keydown', dismiss, true);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('keydown', dismiss, true);
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);
  const handlers: TriggerProps = {
    'aria-describedby': [children.props['aria-describedby'], open ? id : undefined].filter(Boolean).join(' ') || undefined,
    onPointerEnter: event => {
      children.props.onPointerEnter?.(event);
      if (event.pointerType === 'touch') return;
      trigger.current = event.currentTarget;
      cancelTimer(); timer.current = setTimeout(show, 400);
    },
    onPointerLeave: event => { children.props.onPointerLeave?.(event); leave(); },
    onPointerDown: event => { children.props.onPointerDown?.(event); pointerFocus.current = true; close(); },
    onFocus: event => {
      children.props.onFocus?.(event); trigger.current = event.currentTarget; focused.current = true;
      if (!pointerFocus.current) show();
      pointerFocus.current = false;
    },
    onBlur: event => {
      children.props.onBlur?.(event); focused.current = false; pointerFocus.current = false;
      if (!panel.current?.contains(event.relatedTarget as Node)) close();
    },
    onClick: event => { close(); children.props.onClick?.(event); },
  };
  const disabledField = children.type !== 'button' && children.props.disabled;
  const control = disabledField
    ? <span {...handlers} className="tooltip-disabled-field" tabIndex={0} role="group" aria-label={name} aria-disabled="true" data-tooltip-name={name}
      onKeyDown={event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); } }}>{children}</span>
    : cloneElement(children, { ...handlers, ...{ 'data-tooltip-name': name } });
  return <>{control}{open && createPortal(<div ref={panel} className="tooltip-panel" style={position}
    onPointerEnter={() => { cancelTimer(); }} onPointerLeave={leave}
    onFocus={() => { focused.current = true; cancelTimer(); }} onBlur={event => { if (!panel.current?.contains(event.relatedTarget as Node) && event.relatedTarget !== trigger.current) { focused.current = false; close(); } }}>
    <div id={id} role="tooltip"><strong>{name}</strong><p>{description}</p>{state && <p className="tooltip-state">Current: {state}</p>}{disabledReason && <p className="tooltip-reason">Unavailable: {disabledReason}</p>}<Keycaps groups={keycaps} /></div>
    {help && <a href={help.href}>{help.label}</a>}
  </div>, trigger.current?.closest('dialog') || document.body)}</>;
}
