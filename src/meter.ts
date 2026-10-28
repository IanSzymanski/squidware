import type { Meter, Project } from './types';

export const DEFAULT_METER: Meter = { numerator: 4, denominator: 4, grouping: [4] };
export function projectMeter(project: Project): Meter { return project.meter ?? DEFAULT_METER; }
export function validateMeter(input: unknown): Meter {
  const m = input as Meter;
  if (!m || typeof m !== 'object' || !Number.isInteger(m.numerator) || m.numerator < 1 || m.numerator > 32
    || ![2, 4, 8, 16].includes(m.denominator) || !Array.isArray(m.grouping) || !m.grouping.length
    || m.grouping.length > 32 || m.grouping.some(n => !Number.isInteger(n) || n < 1 || n > 32)
    || m.grouping.reduce((sum, n) => sum + n, 0) !== m.numerator) {
    throw new Error('Invalid project: meter needs 1–32 beats, denominator 2, 4, 8 or 16, and positive accent groups adding to the numerator.');
  }
  return { numerator: m.numerator, denominator: m.denominator, grouping: [...m.grouping] };
}
/** One drill count is one denominator beat; the written tempo is counts/minute. */
export function clickAccent(count: number, meter: Meter): 'bar' | 'group' | 'beat' {
  const beat = ((Math.round(count) % meter.numerator) + meter.numerator) % meter.numerator;
  if (!beat) return 'bar';
  let boundary = 0;
  for (const group of meter.grouping) { boundary += group; if (boundary === beat) return 'group'; }
  return 'beat';
}
