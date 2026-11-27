import { describe, expect, it } from 'vitest';
import { defaultPreferences } from '../preferences';
import { DEFAULT_SNAPPING } from '../snapping';
import { nudgeText } from './units';

describe('nudge text', () => {
  const field = { width: 100, height: 160 / 3, preset: 'college' as const };
  const project = { snapping: DEFAULT_SNAPPING, field };
  it('says a default nudge in steps on an 8-to-5 field', () => {
    expect(nudgeText(defaultPreferences(), project)).toBe('1 step');
    expect(nudgeText(defaultPreferences(), project, true)).toBe('4 steps');
  });
  it('keeps yards when the distance is not a quarter-step multiple', () => {
    expect(nudgeText({ ...defaultPreferences(), nudgeStep: .5 }, project)).toBe('0.5 yd');
  });
  it('follows the production step size', () => {
    expect(nudgeText({ ...defaultPreferences(), nudgeStep: 5 / 6 }, { field, snapping: { ...DEFAULT_SNAPPING, steps: 6 } })).toBe('1 step');
  });
  it('uses the preference wording on a floor or stage', () => {
    expect(nudgeText(defaultPreferences(), { snapping: DEFAULT_SNAPPING, field: { preset: 'indoor', width: 28, height: 16, unit: 'ft', referenceInterval: 6 } })).toBe('0.625 yd');
  });
});
