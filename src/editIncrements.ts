import type { Preferences } from './preferences';
import type { Project } from './types';
import { DEFAULT_SNAPPING } from './snapping';
import { fieldDirection } from './components/fieldOrientation';

export const NUDGE_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'] as const;
export type NudgeKey = typeof NUDGE_KEYS[number];
export interface NudgeRequest { key: NudgeKey; fast?: boolean; fieldRelative?: boolean }
export const isNudgeKey = (key: string): key is NudgeKey => (NUDGE_KEYS as readonly string[]).includes(key);
type NudgePreferences = Pick<Preferences, 'nudgeUnit' | 'nudgeStep' | 'fastNudgeStep' | 'fieldOrientation'>;
const display = (value: number) => Number(value.toFixed(4));

/** Step units use the show's full marching step, independently of grid subdivision. */
export function nudgeDistance(preferences: NudgePreferences, project: Pick<Project, 'snapping'>, fast = false): number {
  const amount = fast ? preferences.fastNudgeStep : preferences.nudgeStep;
  return amount * (preferences.nudgeUnit === 'steps' ? 5 / (project.snapping ?? DEFAULT_SNAPPING).steps : 1);
}
export function nudgeLabel(preferences: NudgePreferences, project: Pick<Project, 'snapping'>, fast = false): string {
  const amount = fast ? preferences.fastNudgeStep : preferences.nudgeStep;
  return preferences.nudgeUnit === 'steps' ? `${amount} ${amount === 1 ? 'step' : 'steps'} (${display(nudgeDistance(preferences, project, fast))} yd)` : `${amount} yd`;
}
export function nudgeDelta(preferences: NudgePreferences, project: Pick<Project, 'snapping'>, request: NudgeRequest) {
  return fieldDirection(request.key, nudgeDistance(preferences, project, request.fast), request.fieldRelative ? 'audience-bottom' : preferences.fieldOrientation);
}
