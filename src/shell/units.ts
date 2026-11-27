import { nudgeDistance, nudgeLabel } from '../editIncrements';
import type { Preferences } from '../preferences';
import { DEFAULT_SNAPPING } from '../snapping';
import { isCustomSurface } from '../surfaces';
import type { Project } from '../types';

/**
 * A nudge distance the way a drill writer says it: steps when it is a whole or quarter number of the production's
 * steps on a football field, and the preference's own wording otherwise.
 */
export function nudgeText(preferences: Preferences, project: Pick<Project, 'snapping' | 'field'>, fast = false): string {
  if (isCustomSurface(project.field)) return nudgeLabel(preferences, project, fast);
  const yards = nudgeDistance(preferences, project, fast), steps = yards / (5 / (project.snapping ?? DEFAULT_SNAPPING).steps);
  if (Math.abs(steps * 4 - Math.round(steps * 4)) > 1e-6) return `${Number(yards.toFixed(3))} yd`;
  const amount = Number(steps.toFixed(2));
  return `${amount} ${amount === 1 ? 'step' : 'steps'}`;
}
