import type { AudioAnchor } from './types';
import { PROJECT_LIMITS } from './projectValidation';

/** Seconds exclude the global recording offset. Count zero is always (0, 0).
 * Musical anchors use absolute show counts, like score and tempo events. */
export function validateAudioAnchors(input: unknown, total: number): AudioAnchor[] {
  if (!Array.isArray(input) || input.length > PROJECT_LIMITS.tempoEvents) throw Error('Audio anchors must contain at most 256 rows.');
  if (input.length && total === 0) throw Error('Add a move before defining audio anchors.');
  const anchors = input.map((raw, i) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error(`Audio anchor ${i + 1} must be an object.`);
    const { count, seconds } = raw as AudioAnchor;
    if (!Number.isInteger(count) || count <= 0 || count > total) throw Error(`Audio anchor ${i + 1}: count must be a whole number from 1 to ${total}. Use the offset for count zero.`);
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 86400) throw Error(`Audio anchor ${i + 1}: seconds after the offset must be greater than zero and at most 86400.`);
    return { count, seconds };
  }).sort((a, b) => a.count - b.count);
  for (let i = 1; i < anchors.length; i++) {
    if (anchors[i].count === anchors[i - 1].count) throw Error('Audio anchors must use distinct counts.');
    if (anchors[i].seconds <= anchors[i - 1].seconds) throw Error('Audio anchor times must increase with counts; time cannot reverse or skip an interval.');
  }
  return anchors;
}
