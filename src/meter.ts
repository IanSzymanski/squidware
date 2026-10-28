import type { Meter, Project } from './types';

export const DEFAULT_METER: Meter = { numerator: 4, denominator: 4, grouping: [4] };
export function projectMeter(project: Project): Meter { return project.meter ?? DEFAULT_METER; }
export function meterText(meter: Meter): string { return `${meter.numerator}/${meter.denominator}:${meter.grouping.join('+')}`; }
export function parseMeterText(text: string): Meter {
  if (text.length > 100) throw new Error('Meter text must be at most 100 characters.');
  const match = /^\s*(\d+)\/(2|4|8|16)(?:\s*:\s*(\d+(?:\s*\+\s*\d+)*))?\s*$/.exec(text);
  if (!match) throw new Error('Use meter such as 4/4, 6/8:3+3 or 7/8:2+2+3.');
  const numerator = Number(match[1]), denominator = Number(match[2]);
  if (!Number.isInteger(numerator) || numerator < 1 || numerator > 32) throw new Error('Meter numerator must be between 1 and 32.');
  return validateMeter({ numerator, denominator, grouping: match[3] ? match[3].split('+').map(Number) : denominator === 8 && numerator > 3 && numerator % 3 === 0 ? Array(numerator / 3).fill(3) : [numerator] });
}
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
