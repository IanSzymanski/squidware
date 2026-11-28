import { describe, expect, it } from 'vitest';
import { resolveTheme, systemAppearance, watchSystemAppearance } from './appearance';

function media(state: Record<string, boolean>) {
  const listeners = new Set<() => void>();
  return {
    view: { matchMedia: (query: string) => ({ matches: query.split(', ').some(part => state[part]), addEventListener: (_: string, listener: () => void) => listeners.add(listener), removeEventListener: (_: string, listener: () => void) => listeners.delete(listener) }) } as unknown as Pick<Window, 'matchMedia'>,
    change(next: Record<string, boolean>) { Object.assign(state, next); for (const listener of [...listeners]) listener(); },
    listeners,
  };
}
describe('appearance', () => {
  it('passes explicit themes through and resolves the system theme from light, dark and contrast requests', () => {
    for (const theme of ['dark', 'light', 'high-contrast'] as const) expect(resolveTheme(theme, { dark: false, moreContrast: true })).toBe(theme);
    expect(resolveTheme('system', { dark: true, moreContrast: false })).toBe('dark');
    expect(resolveTheme('system', { dark: false, moreContrast: false })).toBe('light');
    expect(resolveTheme('system', { dark: false, moreContrast: true })).toBe('high-contrast');
  });
  it('reads the system through media queries, treating forced colors as a contrast request', () => {
    expect(systemAppearance(media({ '(prefers-color-scheme: dark)': false }).view)).toEqual({ dark: false, moreContrast: false });
    expect(systemAppearance(media({ '(forced-colors: active)': true }).view).moreContrast).toBe(true);
    expect(systemAppearance(undefined)).toEqual({ dark: true, moreContrast: false });
  });
  it('reports system changes until stopped', () => {
    const system = media({ '(prefers-color-scheme: dark)': true });
    const seen: boolean[] = [];
    const stop = watchSystemAppearance(system.view, next => seen.push(next.dark));
    system.change({ '(prefers-color-scheme: dark)': false });
    stop();
    system.change({ '(prefers-color-scheme: dark)': true });
    expect(seen.at(-1)).toBe(false);
    expect(system.listeners.size).toBe(0);
  });
});
