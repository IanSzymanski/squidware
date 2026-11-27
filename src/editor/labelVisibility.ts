import type { Preferences } from '../preferences';

export type LabelVisibility = 'adaptive' | 'all' | 'selected' | 'none';
type LabelSettings = Pick<Preferences, 'adaptiveLabels' | 'showLabels' | 'selectionLabelsOnly'>;

export function labelVisibility(settings: LabelSettings): LabelVisibility {
  if (!settings.showLabels) return 'none';
  if (settings.selectionLabelsOnly) return 'selected';
  return settings.adaptiveLabels ? 'adaptive' : 'all';
}

export function labelSettings(mode: LabelVisibility): LabelSettings {
  return { showLabels: mode !== 'none', selectionLabelsOnly: mode === 'selected', adaptiveLabels: mode === 'adaptive' };
}
