import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Tooltip, Keycaps } from '../components/Tooltip';
import { commandRegistry } from './commands';
import type { CommandId } from './commands';
import { commandKeycaps } from './shortcutDisplay';

export interface ControlHelpProps {
  title: string;
  description?: string;
  command?: CommandId;
  shortcutVariant?: number;
  showShortcut?: boolean;
  active?: boolean;
  state?: string;
  disabledReason?: string;
}

export function HelpButton({ title, description, command, shortcutVariant, showShortcut = true, active, state, disabledReason, disabled, children, onClick, ...props }: ControlHelpProps & ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  const definition = command ? commandRegistry[command] : undefined;
  const pressed = active ?? props['aria-pressed'];
  return <Tooltip name={title} description={description || definition?.description || title}
    keycaps={command && showShortcut ? commandKeycaps(command, shortcutVariant) : []}
    state={state ?? (pressed === undefined ? undefined : pressed ? 'On' : 'Off')}
    disabledReason={disabled ? disabledReason || 'This action is unavailable in the current state.' : undefined}>
    <button {...props} aria-label={props['aria-label'] || title} aria-disabled={disabled || undefined} aria-pressed={pressed}
      onClick={event => { if (disabled) { event.preventDefault(); return; } onClick?.(event); }}
      onKeyDown={event => { if (disabled && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); } props.onKeyDown?.(event); }}>{children}</button>
  </Tooltip>;
}

export function CommandKeycaps({ command }: { command: CommandId }) { return <Keycaps groups={commandKeycaps(command)} />; }
