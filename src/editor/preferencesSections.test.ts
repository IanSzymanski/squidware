import { describe, expect, it } from 'vitest';
import { preferencesSectionAt, preferencesSections } from './preferencesSections';

describe('Preferences sections', () => {
  it('orders Appearance, Field display, Editing and Shortcuts', () => {
    expect(preferencesSections.map(section => section.title)).toEqual(['Appearance', 'Field display', 'Editing', 'Shortcuts']);
    expect(new Set(preferencesSections.map(section => section.id)).size).toBe(4);
  });

  it('follows the last heading that reached the sticky nav', () => {
    // Nav bottom at 100 px, scrollport bottom at 700 px.
    expect(preferencesSectionAt([140, 900, 2000, 2600], 100, 700, false)).toBe(0);
    expect(preferencesSectionAt([-400, 120, 1200, 1800], 100, 700, false)).toBe(1);
    expect(preferencesSectionAt([-400, 160, 1200, 1800], 100, 700, false)).toBe(0);
    expect(preferencesSectionAt([-1400, -900, 101, 700], 100, 700, false)).toBe(2);
  });

  it('selects the last section at the end of a scrolled dialog', () => {
    expect(preferencesSectionAt([-2000, -1500, -600, 500], 100, 700, true)).toBe(3);
  });

  it('keeps a jumped-to section while its heading stays visible', () => {
    // Editing cannot reach the nav when the dialog is already scrolled to its end.
    expect(preferencesSectionAt([-2000, -1500, 300, 500], 100, 700, true, 2)).toBe(2);
    expect(preferencesSectionAt([-2000, -1500, 99, 500], 100, 700, false, 2)).toBe(2);
    // Scrolling the jumped heading out of view falls back to position.
    expect(preferencesSectionAt([-2000, -1500, -40, 900], 100, 700, false, 2)).toBe(2);
    expect(preferencesSectionAt([-2000, 110, 750, 1400], 100, 700, false, 2)).toBe(1);
    expect(preferencesSectionAt([-2000, -1500, -600, 500], 100, 700, true, 1)).toBe(3);
  });
});
