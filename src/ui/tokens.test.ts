import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACCENT_CHOICES, ACCENTS, customAccentTokens, type ResolvedTheme } from '../appearance';
import { contrastRatio, mix } from '../color';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
  selectors: selectors.split(',').map(selector => selector.trim()),
  tokens: Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()])),
}));
/** The cascade for one theme and accent: every block whose selector matches, in source order, by specificity. */
function tokens(theme: string, accent: string) {
  const matches = (selector: string) => {
    const attributes = [...selector.matchAll(/\[data-(\w+)=([\w-]+)\]/g)];
    return selector.startsWith(':root') && attributes.every(([, name, value]) => (name === 'theme' ? theme : accent) === value) ? attributes.length : -1;
  };
  return blocks.flatMap((block, order) => block.selectors.map(selector => ({ specificity: matches(selector), order, tokens: block.tokens })))
    .filter(match => match.specificity >= 0).sort((a, b) => a.specificity - b.specificity || a.order - b.order)
    .reduce<Record<string, string>>((result, match) => ({ ...result, ...match.tokens }), {});
}
const SURFACES = ['--app-bg', '--surface', '--surface-raised', '--surface-muted', '--control', '--hover-bg', '--overlay', '--input-bg'];
/** Accent text on the accent's own strong tint over a control, as the current set's number is drawn. */
const tint = (t: Record<string, string>) => mix(t['--control'], t['--accent-soft-strong'].slice(0, 7), parseInt(t['--accent-soft-strong'].slice(7, 9), 16) / 255);

describe('theme and accent tokens', () => {
  for (const theme of ['dark', 'light', 'high-contrast']) for (const accent of ACCENTS) it(`keep ${accent} readable in the ${theme} theme`, () => {
    const t = tokens(theme, accent);
    for (const surface of SURFACES) {
      expect(contrastRatio(t['--accent-text'], t[surface]), `accent text on ${surface}`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t['--focus-ring'], t[surface]), `focus ring on ${surface}`).toBeGreaterThanOrEqual(3);
    }
    for (const fill of ['--accent', '--accent-hover', '--accent-pressed']) expect(contrastRatio(t['--on-accent'], t[fill]), `label on ${fill}`).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t['--accent-text'], tint(t)), 'accent text on its tint').toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t['--field-chip-accent'], t['--field-chip-well'])).toBeGreaterThanOrEqual(4.5);
    expect(ACCENT_CHOICES.find(choice => choice.id === accent)!.swatch[theme as 'dark']).toBe(t['--accent']);
  });
  // Any picked color, including ones far too dark, light or gray to use as is, ends up as readable as the presets.
  for (const theme of ['dark', 'light', 'high-contrast'] as const) it(`derives a readable custom accent in the ${theme} theme`, () => {
    for (const color of ['#000000', '#ffffff', '#808080', '#ffff00', '#0000ff', '#ff0000', '#c2f279', '#1b57b5', '#3a2f2a', '#3355aa', '#ffd400']) {
      const t = { ...tokens(theme, 'custom'), ...customAccentTokens(color, theme as ResolvedTheme) } as Record<string, string>;
      for (const surface of SURFACES) {
        expect(contrastRatio(t['--accent-text'], t[surface]), `${color} text on ${surface}`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t['--focus-ring'], t[surface]), `${color} focus on ${surface}`).toBeGreaterThanOrEqual(3);
      }
      for (const fill of ['--accent', '--accent-hover', '--accent-pressed']) expect(contrastRatio(t['--on-accent'], t[fill]), `${color} label on ${fill}`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t['--accent-text'], tint(t)), `${color} text on its tint`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t['--field-chip-accent'], t['--field-chip-well'])).toBeGreaterThanOrEqual(4.5);
    }
    // A color that already reads keeps its exact value.
    expect(customAccentTokens('#c2f279', 'dark')['--accent']).toBe('#c2f279');
    expect(customAccentTokens('#1b57b5', 'light')['--accent']).toBe('#1b57b5');
  });
  it('defines every accent for every theme, and lime only in the theme blocks', () => {
    const accented = blocks.flatMap(block => block.selectors).filter(selector => selector.includes('data-accent'));
    for (const accent of ACCENTS.filter(accent => accent !== 'lime')) for (const theme of ['dark', 'light', 'high-contrast'])
      expect(accented).toContain(`:root[data-theme=${theme}][data-accent=${accent}]`);
    expect(accented.some(selector => selector.includes('lime'))).toBe(false);
  });
});
