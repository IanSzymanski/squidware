import { uiScale } from '../uiScale';
import { placeTooltip } from './tooltipPlacement';
import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HTMLAttributes, ReactElement } from 'react';

export function Keycaps({ groups }: { groups: readonly (readonly string[])[] }) {
  return <span className="shortcut-keycaps">{groups.map((keys, index) => <span key={index}>{index > 0 && <span className="shortcut-or">or</span>}{keys.map((key, i) => <kbd key={i}>{key}</kbd>)}</span>)}</span>;
}

const tooltipEscapes = new WeakSet<Event>();
/** True when this Escape closed open help. It still reaches its target, so it
 * also cancels a draft, preview or dialog; it must not clear selection alone. */
export const isTooltipEscape = (event: Event) => tooltipEscapes.has(event);
/** Focus help follows the focus ring: keyboard navigation and text entry match
 * :focus-visible; programmatic focus after a pointer action (dialog or preview
 * autofocus) does not. */
const focusVisible = (element: Element) => { try { return element.matches(':focus-visible'); } catch { return true; } };

type TriggerProps = HTMLAttributes<HTMLElement> & { disabled?: boolean };
export interface TooltipProps {
  name: string;
  description: string;
  keycaps?: string[][];
  state?: string;
  disabledReason?: string;
  help?: { label: string; href: string };
  pointerPassThrough?: boolean;
  children: ReactElement<TriggerProps>;
}

/** A noninteractive description; an optional help link sits outside role=tooltip. */
export function Tooltip({ name, description, keycaps = [], state, disabledReason, help, pointerPassThrough = false, children }: TooltipProps) {
  const id = useId();
  const trigger = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const focused = useRef(false);
  const pointerFocus = useRef(false);
  const [open, setOpen] = useState(false);
  const passThrough = pointerPassThrough && !help;
  // Controls can render in the separate 3D window; help belongs to the trigger's own document.
  const owner = () => trigger.current?.ownerDocument ?? document;
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
    const element = panel.current;
    if (!trigger.current || !element) return;
    // Measure the natural size; a previous cap must not shrink the next one.
    element.style.maxHeight = '';
    const { clientWidth: width, clientHeight: height } = owner().documentElement;
    const p = placeTooltip(trigger.current.getBoundingClientRect(), element.getBoundingClientRect(), { width, height }, { scale: uiScale() });
    Object.assign(element.style, { left: `${p.left}px`, top: `${p.top}px`, maxHeight: p.maxHeight === undefined ? '' : `${p.maxHeight}px` });
  };
  useLayoutEffect(() => { if (open) place(); }, [open, name, description, state, disabledReason]);
  useEffect(() => {
    if (!open || !panel.current || typeof ResizeObserver === 'undefined') return;
    // Font, keycap and content reflow; the next frame avoids resize-observer loops.
    let frame = 0;
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); });
    observer.observe(panel.current);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    // One Escape closes help and continues: draft editors, native dialog cancel
    // and preview cancel still run. The mark keeps it from clearing selection.
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') { tooltipEscapes.add(event); close(); } };
    const outside = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node)) close(); };
    const scroll = (event: Event) => {
      if (panel.current?.contains(event.target as Node)) return;
      // Focusing an offscreen Inspector field can scroll its panel after focus
      // has already opened help. Keep keyboard help anchored to that control.
      if (focused.current && owner().activeElement === trigger.current) place();
      else close();
    };
    // Dense inline fields keep focus help without blocking neighboring pointer
    // controls. Moving away dismisses only the description, not text focus.
    const pointerMove = (event: PointerEvent) => { if (passThrough && !trigger.current?.contains(event.target as Node)) close(); };
    const doc = owner(), view = doc.defaultView ?? window;
    doc.addEventListener('keydown', dismiss, true);
    doc.addEventListener('pointerdown', outside, true);
    doc.addEventListener('scroll', scroll, true);
    doc.addEventListener('pointermove', pointerMove, true);
    view.addEventListener('resize', close);
    return () => {
      doc.removeEventListener('keydown', dismiss, true);
      doc.removeEventListener('pointerdown', outside, true);
      doc.removeEventListener('scroll', scroll, true);
      doc.removeEventListener('pointermove', pointerMove, true);
      view.removeEventListener('resize', close);
    };
  }, [open, passThrough]);
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
      if (!pointerFocus.current && focusVisible(event.target)) show();
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
  return <>{control}{open && createPortal(<div ref={panel} className={`tooltip-panel${passThrough ? ' tooltip-panel--pointer-through' : ''}`}
    onPointerEnter={() => { cancelTimer(); }} onPointerLeave={leave}
    onFocus={() => { focused.current = true; cancelTimer(); }} onBlur={event => { if (!panel.current?.contains(event.relatedTarget as Node) && event.relatedTarget !== trigger.current) { focused.current = false; close(); } }}>
    <div id={id} role="tooltip"><strong>{name}</strong><p>{description}</p>{state && <p className="tooltip-state">Current: {state}</p>}{disabledReason && <p className="tooltip-reason">Unavailable: {disabledReason}</p>}<Keycaps groups={keycaps} /></div>
    {help && <a href={help.href}>{help.label}</a>}
  </div>, trigger.current?.closest('dialog') || owner().body)}</>;
}
