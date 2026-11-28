import { describe, expect, it } from 'vitest';
import { FIELD_SCHEMES } from '../appearance';
import { contrastRatio } from '../color';
import { FIELD_PALETTES, fieldPalette, fieldPaletteFor, fieldPaletteStyle, printFieldScheme, wellInk } from './fieldPalette';

describe('field palettes', () => {
  for (const scheme of FIELD_SCHEMES) it(`keeps marks and overlays visible on the ${scheme} field`, () => {
    const p = FIELD_PALETTES[scheme], turf = p.football.turf;
    // Graphics need 3:1 against the field they are drawn on; text needs 4.5:1 against its halo and the field.
    for (const [name, ink] of Object.entries({ ring: p.dot.ring, ...p.ink })) if (ink && name !== 'guideHalo') expect(contrastRatio(ink, turf), name).toBeGreaterThanOrEqual(3);
    for (const label of [p.label.screen, p.label.selected]) { expect(contrastRatio(label, p.label.halo)).toBeGreaterThanOrEqual(4.5); expect(contrastRatio(label, turf)).toBeGreaterThanOrEqual(4.5); }
    expect(contrastRatio(p.ink.guideText, p.ink.guideHalo)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.dot.ring, p.dot.halo)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.football.number, turf)).toBeGreaterThanOrEqual(4.5);
    expect(p.ground === 'light').toBe(contrastRatio(turf, '#000000') > contrastRatio(turf, '#ffffff'));
  });
  it('prints the standard field unless Classic chart is chosen', () => {
    expect(FIELD_SCHEMES.map(printFieldScheme)).toEqual(['turf', 'turf', 'classic', 'turf']);
    expect(fieldPalette(undefined)).toBe(FIELD_PALETTES.turf);
  });
  it('gives the field its own accent and well, and its problem ink only where the chrome status colors would not read', () => {
    const classic = fieldPaletteStyle(FIELD_PALETTES.classic) as Record<string, string>, turf = fieldPaletteStyle(FIELD_PALETTES.turf) as Record<string, string>;
    expect(classic['--field-accent']).toBe('#101418');
    expect(classic['--field-problem']).toBe('#c62828');
    expect(turf['--field-accent']).toBe('#ffffff');
    expect(turf['--field-problem']).toBeUndefined();
  });
  it('keeps the sideline captions readable on a personal background behind the field', () => {
    for (const scheme of FIELD_SCHEMES) for (const well of ['#ffffff', '#000000', '#7a7f85', '#f2c26b', '#123456']) {
      const palette = fieldPaletteFor(scheme, well);
      expect(palette.well).toBe(well);
      expect(contrastRatio(palette.football.caption, well), `${scheme} on ${well}`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette.floor.caption, well), `${scheme} floor on ${well}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(fieldPaletteFor('classic', null)).toBe(FIELD_PALETTES.classic);
    expect(fieldPaletteFor('turf', '#1b2924').football.caption).toBe(FIELD_PALETTES.turf.football.caption);
  });
  it('sets the status line below the chart in ink that reads on any background', () => {
    for (const well of ['#ffffff', '#000000', '#7a7f85', '#c3c8ce', '#1b2924', '#f2c26b', '#3a2a4a']) {
      const ink = wellInk(well);
      expect(contrastRatio(ink.ink, well), well).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(ink.muted, well), well).toBeGreaterThanOrEqual(4.5);
    }
    // The standard well keeps the chip inks the status line has always used.
    expect(wellInk(FIELD_PALETTES.turf.well)).toEqual({ ink: '#eef2f6', muted: '#b3bcc7', shadow: '0 1px 2px #000a' });
  });
  it('measures contrast as WCAG does', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
});
