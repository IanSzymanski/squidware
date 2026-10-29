import type { DrillSet } from '../types';

/** Numbers address the unfiltered, one-based show order; names match literally. */
export function matchingSets(sets: readonly DrillSet[], query: string): number[] {
  const text = query.trim().toLocaleLowerCase();
  const number = /^(?:set\s+)?(\d+)$/i.exec(text);
  if (number) {
    const index = Number(number[1]) - 1;
    return Number.isInteger(index) && index >= 0 && index < sets.length ? [index] : [];
  }
  return sets.flatMap((set, index) => !text || set.name.toLocaleLowerCase().includes(text) ? [index] : []);
}
