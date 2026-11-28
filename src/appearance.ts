import { contrastRatio, ensureContrast, mix, shiftLightness } from './color';

/** Personal appearance choices: chrome theme, accent and the look of the 2D field. Productions never store them. */
export const THEME_CHOICES = [
  { id: 'system', name: 'Match system', description: 'Follow the computer: light or dark, and high contrast when the system asks for more contrast.' },
  { id: 'dark', name: 'Dark', description: 'Neutral dark chrome. The default.' },
  { id: 'light', name: 'Light', description: 'Neutral light chrome for bright rooms.' },
  { id: 'high-contrast', name: 'High contrast', description: 'Black chrome with white outlines and stronger text.' },
] as const;
export type ThemePreference = typeof THEME_CHOICES[number]['id'];
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;
export const THEMES = THEME_CHOICES.map(choice => choice.id);

/** One accent marks the primary action, the current item and focus, tuned per theme to keep its contrast. `swatch` is its --accent in each theme. */
export const ACCENT_CHOICES = [
  { id: 'lime', name: 'Lime', swatch: { dark: '#c2f279', light: '#2f6b0d', 'high-contrast': '#d4ff8f' } },
  { id: 'blue', name: 'Blue', swatch: { dark: '#8ab4ff', light: '#1b57b5', 'high-contrast': '#a8ccff' } },
  { id: 'teal', name: 'Teal', swatch: { dark: '#5fe0c8', light: '#0a6a5c', 'high-contrast': '#8ff5e0' } },
  { id: 'violet', name: 'Violet', swatch: { dark: '#b9a2ff', light: '#5b3fc4', 'high-contrast': '#d2c2ff' } },
  { id: 'pink', name: 'Pink', swatch: { dark: '#ff9fd6', light: '#ad2370', 'high-contrast': '#ffc2e6' } },
] as const;
export type AccentPreset = typeof ACCENT_CHOICES[number]['id'];
/** A preset, or `custom` for the personal accent color picked in Preferences. */
export type AccentPreference = AccentPreset | 'custom';
export const ACCENTS = ACCENT_CHOICES.map(choice => choice.id);
export const ACCENT_PREFERENCES: readonly AccentPreference[] = [...ACCENTS, 'custom'];

/** How the 2D field is painted. Printed drill books follow Classic chart only; SVG export, panel previews and the 3D view keep Turf. */
export const FIELD_SCHEME_CHOICES = [
  { id: 'turf', name: 'Turf', description: 'Dark green turf with soft white lines. The default.' },
  { id: 'grass', name: 'Grass', description: 'Brighter striped grass with painted white lines, like the field on game day.' },
  { id: 'classic', name: 'Classic chart', description: 'Black lines and numbers on a white field, like a printed drill chart.' },
  { id: 'night', name: 'Night chart', description: 'White lines on a black field: monochrome with the most contrast for colored dots.' },
] as const;
export type FieldScheme = typeof FIELD_SCHEME_CHOICES[number]['id'];
export const FIELD_SCHEMES = FIELD_SCHEME_CHOICES.map(choice => choice.id);

export interface SystemAppearance { dark: boolean; moreContrast: boolean }
const QUERIES = { dark: '(prefers-color-scheme: dark)', moreContrast: '(prefers-contrast: more), (forced-colors: active)' } as const;

export function resolveTheme(theme: ThemePreference, system: SystemAppearance): ResolvedTheme {
  if (theme !== 'system') return theme;
  return system.moreContrast ? 'high-contrast' : system.dark ? 'dark' : 'light';
}

/** A view without media queries (tests, server rendering) reads as a dark display without a contrast request. */
export function systemAppearance(view: Pick<Window, 'matchMedia'> | undefined = typeof window === 'undefined' ? undefined : window): SystemAppearance {
  if (!view?.matchMedia) return { dark: true, moreContrast: false };
  return { dark: view.matchMedia(QUERIES.dark).matches, moreContrast: view.matchMedia(QUERIES.moreContrast).matches };
}

/** Calls back when the system's light/dark or contrast setting changes. */
export function watchSystemAppearance(view: Pick<Window, 'matchMedia'>, onChange: (system: SystemAppearance) => void) {
  if (!view.matchMedia) return () => {};
  const lists = Object.values(QUERIES).map(query => view.matchMedia(query));
  const changed = () => onChange(systemAppearance(view));
  for (const list of lists) list.addEventListener('change', changed);
  return () => { for (const list of lists) list.removeEventListener('change', changed); };
}

/** The surface closest in lightness to accent text in each theme (--hover-bg), which a custom accent must still clear. */
const ACCENT_GROUND = { dark: '#2a3036', light: '#e8ebef', 'high-contrast': '#262626' } as const;
/** Accent text also sits on its own tint: --accent-soft-strong over --control, as on the current set's number. */
const TINT = { dark: ['#23282d', 0x2b / 255], light: ['#f1f3f5', 0x2b / 255], 'high-contrast': ['#141414', 0x40 / 255] } as const;
function readableAccent(color: string, theme: ResolvedTheme, minimum: number) {
  const direction = theme === 'light' ? 'darker' : 'lighter', [base, alpha] = TINT[theme];
  let accent = ensureContrast(color, ACCENT_GROUND[theme], minimum, direction);
  for (let step = 0; step < 100 && contrastRatio(accent, mix(base, accent, alpha)) < 4.6; step++) accent = shiftLightness(accent, direction === 'lighter' ? .01 : -.01);
  return accent;
}
export const ACCENT_TOKENS = ['--accent', '--accent-hover', '--accent-pressed', '--on-accent', '--accent-text', '--accent-soft', '--accent-soft-strong', '--accent-line', '--selected-bg', '--focus-ring', '--field-chip-accent', '--field-chip-accent-line'] as const;

/**
 * The accent tokens for a picked color in one theme. The color keeps its hue and saturation and is lightened (dark
 * and high-contrast themes) or darkened (light theme) only as far as text and focus need, as the presets are.
 */
export function customAccentTokens(color: string, theme: ResolvedTheme): Partial<Record<typeof ACCENT_TOKENS[number], string>> {
  const chip = readableAccent(color, 'dark', 4.6);
  const chipTokens = { '--field-chip-accent': chip, '--field-chip-accent-line': `${chip}66` };
  if (theme === 'light') {
    const accent = readableAccent(color, 'light', 4.6), on = '#ffffff';
    return {
      '--accent': accent, '--accent-hover': ensureContrast(shiftLightness(accent, .05), on, 4.5, 'darker'), '--accent-pressed': shiftLightness(accent, -.06), '--on-accent': on,
      '--accent-text': accent, '--accent-soft': `${accent}17`, '--accent-soft-strong': `${accent}2b`, '--accent-line': `${accent}80`, '--selected-bg': `${accent}17`, '--focus-ring': accent, ...chipTokens,
    };
  }
  const contrast = theme === 'high-contrast', on = contrast ? '#000000' : '#0b0d0f';
  const accent = contrast ? readableAccent(color, 'high-contrast', 7) : chip;
  const [soft, strong] = contrast ? ['26', '40'] : ['18', '2b'];
  return {
    '--accent': accent, '--accent-hover': shiftLightness(accent, .06), '--accent-pressed': ensureContrast(shiftLightness(accent, -.06), on, 4.5, 'lighter'), '--on-accent': on,
    '--accent-text': accent, '--accent-soft': `${accent}${soft}`, '--accent-soft-strong': `${accent}${strong}`, '--accent-line': contrast ? accent : `${accent}66`, '--selected-bg': `${accent}${soft}`,
    // High contrast keeps its white focus ring.
    ...contrast ? {} : { '--focus-ring': accent }, ...chipTokens,
  };
}

/** Writes the resolved theme and accent onto a document root, for the main and 3D windows alike. */
export function applyAppearance(root: HTMLElement, theme: ResolvedTheme, accent: AccentPreference, accentColor: string) {
  root.dataset.theme = theme;
  root.dataset.accent = accent;
  for (const token of ACCENT_TOKENS) root.style.removeProperty(token);
  if (accent === 'custom') for (const [token, value] of Object.entries(customAccentTokens(accentColor, theme))) root.style.setProperty(token, value);
}
export function clearAppearance(root: HTMLElement) {
  delete root.dataset.theme; delete root.dataset.accent;
  for (const token of ACCENT_TOKENS) root.style.removeProperty(token);
}
