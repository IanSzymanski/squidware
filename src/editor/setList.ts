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

export const SET_REORDER_POLICY = 'Incoming move timing and paths follow destination sets; positions stay with their sets. Changing the previous set clears travel-direction declarations for that move. A new opening has zero counts, and the former opening gains a 32-count move using its stored tempo. Musical anchors stay at absolute show counts. Undo restores the original order and moves.';

/** Reordering into or out of the opening changes show timing, so say so when it happens. */
export function openingMoveNote(from: number, to: number): string {
  return from !== to && (from === 0 || to === 0) ? ' New opening: 0 counts. The former opening now has a 32-count move.' : '';
}
