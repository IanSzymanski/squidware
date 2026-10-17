import type { Performer } from '../types';

export function filterCast(performers: readonly Performer[], query: string, section: string): Performer[] {
  const text = query.trim().toLocaleLowerCase();
  return performers.filter(p => (section === 'all' || p.sectionId === section) && `${p.label} ${p.name}`.toLocaleLowerCase().includes(text));
}

/** Visible-only bulk changes preserve selections outside the current filter. */
export function selectVisible(current: readonly string[], visible: readonly string[], checked: boolean): string[] {
  const scope = new Set(visible);
  return checked ? [...new Set([...current, ...visible])] : current.filter(id => !scope.has(id));
}

export function selectCastRow(current: readonly string[], visible: readonly string[], id: string, anchor: string | null, modifiers: { shift: boolean; toggle: boolean }): string[] {
  if (!visible.includes(id)) return [...current];
  if (modifiers.shift) {
    const start = anchor ? visible.indexOf(anchor) : -1;
    const end = visible.indexOf(id);
    const range = start < 0 ? [id] : visible.slice(Math.min(start, end), Math.max(start, end) + 1);
    return [...new Set([...current, ...range])];
  }
  return modifiers.toggle ? current.includes(id) ? current.filter(value => value !== id) : [...current, id] : [id];
}

export function nextCastRow(visible: readonly string[], id: string, key: string): string | undefined {
  const index = visible.indexOf(id);
  if (!visible.length) return undefined;
  if (key === 'Home') return visible[0];
  if (key === 'End') return visible.at(-1);
  if (key === 'ArrowDown') return visible[Math.min(visible.length - 1, Math.max(0, index + 1))];
  if (key === 'ArrowUp') return visible[Math.max(0, index - 1)];
  return undefined;
}
