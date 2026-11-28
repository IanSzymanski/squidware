import type { CSSProperties } from 'react';
import type { FieldScheme } from '../appearance';
import { contrastRatio, isLightColor, mix } from '../color';

/** Ink for what is drawn over the field: neighbor paths, previews, guides, candidates and on-field problems. */
export interface FieldInk {
  previous: string; next: string; strideLarge: string; strideOver: string;
  preview: string; invalid: string; guideText: string; guideHalo: string;
  candidate: string; candidateOut: string; lasso: string; marquee: string; snap: string;
  path: string; travel: string;
  /** Problems on the field use the chrome's status colors unless the field needs its own. */
  problem?: string; problemWarning?: string;
}
/** Every color the 2D field paints. Turf is the standard field: prints and exports use it unless they choose Classic chart. */
export interface FieldPalette {
  /** Whether overlays sit on a dark or a light field. */
  ground: 'dark' | 'light';
  well: string; wellGlow: string;
  /** The well around an indoor floor or custom stage. */
  floorWell: string;
  football: { apron: string; apronLine: string; turf: string; stripe: string; stripeOpacity: number; grid: string; gridOpacity: number; line: string; lineOpacity: number; number: string; numberOpacity: number; caption: string; captionOpacity: number };
  floor: { indoor: string; custom: string; grid: string; reference: string; edge: string; origin: string; caption: string; printCaption: string };
  dot: { outline: string; outlineSelected: string; gloss: number; halo: string; ring: string };
  label: { screen: string; print: string; selected: string; halo: string; leader: string };
  mark: { fill: string; outline: string };
  /** Dot colors for Selection groups coloring. */
  groups: { selected: string; other: string };
  ink: FieldInk;
  thumb: { surround: string; field: string; line: string; floorSurround: string; floorEdge: string };
}

const DARK_INK: FieldInk = {
  previous: '#b9e3f4', next: '#f1d39a', strideLarge: '#ffb454', strideOver: '#ff7a6b',
  preview: '#8dc8ff', invalid: '#ffb6aa', guideText: '#e5f1ff', guideHalo: '#16231c',
  candidate: '#fff4b1', candidateOut: '#ffcb83', lasso: '#fff4b1', marquee: '#8dc8ff', snap: '#ffffff',
  path: '#b9e3f4', travel: '#ffd681',
};
const STANDARD_FLOOR: FieldPalette['floor'] = { indoor: '#343139', custom: '#292f3a', grid: '#dae0e8', reference: '#e7edf5', edge: '#ced8e4', origin: '#fff', caption: '#aeb8c4', printCaption: '#e0e7ef' };
const STANDARD_MARK: FieldPalette['mark'] = { fill: '#f5f5e8', outline: '#142920' };

export const FIELD_PALETTES: Readonly<Record<FieldScheme, FieldPalette>> = {
  turf: {
    ground: 'dark', well: '#1b2924', wellGlow: '#22332c', floorWell: '#15181b',
    football: { apron: '#273a34', apronLine: '#46574c', turf: '#233c31', stripe: '#294438', stripeOpacity: .5, grid: '#a3c0a4', gridOpacity: .2, line: '#ccdcc9', lineOpacity: .5, number: '#d9e0c7', numberOpacity: .55, caption: '#b4c5b4', captionOpacity: .6 },
    floor: STANDARD_FLOOR,
    dot: { outline: '#142920', outlineSelected: '#fff', gloss: .3, halo: '#111820', ring: '#ffffff' },
    label: { screen: '#c3d0c4', print: '#e0e9de', selected: '#fff', halo: '#1c3026', leader: '#c3d0c4' },
    mark: STANDARD_MARK, groups: { selected: '#8dc8ff', other: '#b3c5bd' }, ink: DARK_INK,
    thumb: { surround: '#1a2b23', field: '#243d32', line: '#4c6555', floorSurround: '#17191d', floorEdge: '#646a76' },
  },
  grass: {
    ground: 'dark', well: '#16241a', wellGlow: '#1e3324', floorWell: '#15181b',
    football: { apron: '#2a5730', apronLine: '#4c7a50', turf: '#2c6233', stripe: '#36743d', stripeOpacity: .6, grid: '#eaf6e6', gridOpacity: .16, line: '#ffffff', lineOpacity: .82, number: '#ffffff', numberOpacity: .78, caption: '#e4efe0', captionOpacity: .78 },
    floor: STANDARD_FLOOR,
    dot: { outline: '#0f2410', outlineSelected: '#fff', gloss: .3, halo: '#0e1a10', ring: '#ffffff' },
    label: { screen: '#eef5ea', print: '#f4f8f1', selected: '#fff', halo: '#133018', leader: '#e2ecdf' },
    mark: STANDARD_MARK, groups: { selected: '#a9d6ff', other: '#cfdcca' },
    ink: { ...DARK_INK, previous: '#c9eefc', next: '#ffe3a8', strideOver: '#ff9d90', preview: '#a9d6ff', marquee: '#a9d6ff', path: '#c9eefc', guideHalo: '#133018' },
    thumb: { surround: '#1b3820', field: '#2c6233', line: '#6f9b72', floorSurround: '#17191d', floorEdge: '#646a76' },
  },
  classic: {
    ground: 'light', well: '#c3c8ce', wellGlow: '#d5d9de', floorWell: '#c3c8ce',
    football: { apron: '#ffffff', apronLine: '#9aa0a6', turf: '#ffffff', stripe: '#ffffff', stripeOpacity: 0, grid: '#000000', gridOpacity: .16, line: '#111111', lineOpacity: .9, number: '#111111', numberOpacity: .85, caption: '#3c4043', captionOpacity: .9 },
    floor: { indoor: '#ffffff', custom: '#ffffff', grid: '#000000', reference: '#333333', edge: '#111111', origin: '#000000', caption: '#3c4043', printCaption: '#111111' },
    dot: { outline: '#111111', outlineSelected: '#000000', gloss: .3, halo: '#ffffff', ring: '#101418' },
    label: { screen: '#2a2e33', print: '#111111', selected: '#000000', halo: '#ffffff', leader: '#5f6368' },
    mark: { fill: '#ffffff', outline: '#111111' }, groups: { selected: '#1f6fd1', other: '#a7afb8' },
    ink: {
      previous: '#2470c9', next: '#8a5a00', strideLarge: '#c25f00', strideOver: '#c62828',
      preview: '#1f6fd1', invalid: '#c62828', guideText: '#0b3d82', guideHalo: '#ffffff',
      candidate: '#7a6200', candidateOut: '#b25d00', lasso: '#7a6200', marquee: '#1f6fd1', snap: '#101418',
      path: '#2470c9', travel: '#a15c00', problem: '#c62828', problemWarning: '#8f5b00',
    },
    thumb: { surround: '#d4d8dc', field: '#ffffff', line: '#9aa0a6', floorSurround: '#d4d8dc', floorEdge: '#5f6368' },
  },
  night: {
    ground: 'dark', well: '#08090a', wellGlow: '#121416', floorWell: '#08090a',
    football: { apron: '#000000', apronLine: '#5a5a5a', turf: '#000000', stripe: '#000000', stripeOpacity: 0, grid: '#ffffff', gridOpacity: .14, line: '#ffffff', lineOpacity: .85, number: '#ffffff', numberOpacity: .8, caption: '#d6d6d6', captionOpacity: .85 },
    floor: { indoor: '#000000', custom: '#000000', grid: '#ffffff', reference: '#ffffff', edge: '#ffffff', origin: '#ffffff', caption: '#d6d6d6', printCaption: '#ffffff' },
    dot: { outline: '#8a8a8a', outlineSelected: '#fff', gloss: .3, halo: '#000000', ring: '#ffffff' },
    label: { screen: '#e6e6e6', print: '#ffffff', selected: '#ffffff', halo: '#000000', leader: '#bdbdbd' },
    mark: STANDARD_MARK, groups: { selected: '#8dc8ff', other: '#9e9e9e' }, ink: { ...DARK_INK, guideHalo: '#000000' },
    thumb: { surround: '#0a0b0c', field: '#000000', line: '#5c5c5c', floorSurround: '#0a0b0c', floorEdge: '#8a8a8a' },
  },
};
export const STANDARD_FIELD_PALETTE = FIELD_PALETTES.turf;
export const fieldPalette = (scheme: FieldScheme | undefined) => FIELD_PALETTES[scheme ?? 'turf'] ?? STANDARD_FIELD_PALETTE;
/**
 * A field look with a personal background behind the field. The sideline captions sit on that background,
 * so they switch to dark or light ink when the look's own caption color would not read on it.
 */
export function fieldPaletteFor(scheme: FieldScheme | undefined, well?: string | null): FieldPalette {
  const palette = fieldPalette(scheme);
  if (!well) return palette;
  const readable = (ink: string) => contrastRatio(ink, well) >= 4.5 ? ink : isLightColor(well) ? '#000000' : '#ffffff';
  return {
    ...palette, well, wellGlow: mix(well, '#ffffff', .07), floorWell: well,
    football: { ...palette.football, caption: readable(palette.football.caption), captionOpacity: contrastRatio(palette.football.caption, well) >= 4.5 ? palette.football.captionOpacity : .9 },
    floor: { ...palette.floor, caption: readable(palette.floor.caption) },
    thumb: { ...palette.thumb, surround: well, floorSurround: well },
  };
}
/** Printed drill books use the standard field, or Classic chart when that is the chosen look: dark fields stay on screen. */
export const printFieldScheme = (scheme: FieldScheme): FieldScheme => scheme === 'classic' ? 'classic' : 'turf';

/** Text set straight on the well (the status line and hint below the chart): the chip inks on a dark well, dark inks on a light one. */
export function wellInk(well: string) {
  const light = isLightColor(well), [ink, muted] = light ? ['#111418', '#3a4149'] : ['#eef2f6', '#b3bcc7'];
  const strong = contrastRatio(ink, well) >= 4.5 ? ink : light ? '#000000' : '#ffffff';
  return { ink: strong, muted: contrastRatio(muted, well) >= 4.5 ? muted : strong, shadow: light ? 'none' : '0 1px 2px #000a' };
}
/** The well behind the editor's field. Named apart from --field-well, which the 3D view in the same container reads. */
export function fieldWellStyle(palette: FieldPalette): CSSProperties {
  const ink = wellInk(palette.well), floorInk = wellInk(palette.floorWell);
  return {
    '--field-scheme-well': palette.well, '--field-scheme-glow': palette.wellGlow, '--field-scheme-floor-well': palette.floorWell,
    '--field-scheme-ink': ink.ink, '--field-scheme-ink-muted': ink.muted, '--field-scheme-ink-shadow': ink.shadow,
    '--field-scheme-floor-ink': floorInk.ink, '--field-scheme-floor-ink-muted': floorInk.muted,
  } as CSSProperties;
}

/** Custom properties for the overlays, handles and CSS-drawn artwork inside one 2D field. */
export function fieldPaletteStyle(palette: FieldPalette): CSSProperties {
  const { ink } = palette;
  const vars: Record<string, string> = {
    '--field-well': palette.well, '--field-well-glow': palette.wellGlow, '--field-accent': palette.dot.ring, '--field-halo': palette.dot.halo,
    '--field-previous': ink.previous, '--field-next': ink.next, '--field-stride-large': ink.strideLarge, '--field-stride-over': ink.strideOver,
    '--field-preview': ink.preview, '--field-invalid': ink.invalid, '--field-guide-text': ink.guideText, '--field-guide-halo': ink.guideHalo,
    '--field-candidate': ink.candidate, '--field-candidate-out': ink.candidateOut, '--field-path': ink.path, '--field-travel': ink.travel,
  };
  if (ink.problem) vars['--field-problem'] = ink.problem;
  if (ink.problemWarning) vars['--field-problem-warning'] = ink.problemWarning;
  return vars as CSSProperties;
}
