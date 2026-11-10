import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Tooltip, Keycaps } from '../components/Tooltip';
import { commandRegistry } from './commands';
import type { CommandId } from './commands';
import { commandKeycaps } from './shortcutDisplay';
import { useEditorSelector } from './react';

export interface ControlHelpProps {
  title: string;
  description?: string;
  command?: CommandId;
  shortcutVariant?: number;
  showShortcut?: boolean;
  active?: boolean;
  state?: string;
  disabledReason?: string;
  pointerPassThrough?: boolean;
}

export function HelpButton({ title, description, command, shortcutVariant, showShortcut = true, active, state, disabledReason, pointerPassThrough, disabled, children, onClick, ...props }: ControlHelpProps & ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  const definition = command ? commandRegistry[command] : undefined;
  const bindings = useEditorSelector(state => state.preferences.value.shortcutBindings);
  const pressed = active ?? props['aria-pressed'];
  return <Tooltip name={title} description={description || definition?.description || title}
    pointerPassThrough={pointerPassThrough}
    keycaps={command && showShortcut ? commandKeycaps(command, shortcutVariant, undefined, undefined, bindings) : []}
    state={state ?? (pressed === undefined ? undefined : pressed ? 'On' : 'Off')}
    disabledReason={disabled ? disabledReason || 'This action is unavailable in the current state.' : undefined}>
    <button {...props} aria-label={props['aria-label'] || title} aria-disabled={disabled || undefined} aria-pressed={pressed}
      onClick={event => { if (disabled) { event.preventDefault(); return; } onClick?.(event); }}
      onKeyDown={event => { if (disabled && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); } props.onKeyDown?.(event); }}>{children}</button>
  </Tooltip>;
}

/** Whether short instructional lines are shown. Tooltips and Help carry the same guidance when this is off. */
export function useShowHints() {
  return useEditorSelector(state => state.preferences.value.showHints);
}

/**
 * Instructional microcopy gated by the Show hints preference. With hints off, an element that serves as an
 * aria-describedby target (one with an id) stays available to assistive technology as visually hidden text.
 */
export function Hint({ id, className = 'microcopy', children }: { id?: string; className?: string; children: ReactNode }) {
  const show = useShowHints();
  if (show) return <small id={id} className={className} data-hint="">{children}</small>;
  return id ? <span id={id} className="sr-only">{children}</span> : null;
}

export function CommandKeycaps({ command }: { command: CommandId }) {
  const bindings = useEditorSelector(state => state.preferences.value.shortcutBindings);
  return <Keycaps groups={commandKeycaps(command, undefined, undefined, undefined, bindings)} />;
}
