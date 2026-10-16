import type { CoordinatePrecision } from './coordinates';
export interface Preferences {
  version: 1;
  panelLayout: 'comfortable' | 'compact'; view: '2d' | '3d';
  showLabels: boolean; showPaths: boolean; showNextPaths: boolean; showGrid: boolean; snap: boolean; zoom: number;
  selectionHintDismissed: boolean; selectionLabelsOnly: boolean;
  fieldOrientation: 'audience-bottom' | 'audience-top';
  fieldColorMode: 'section' | 'selection' | 'custom'; fieldCustomColor: string;
  fieldDotRadiusPx: number; fieldLabelSizePx: number;
  inspectorSetOpen: boolean; inspectorSelectionOpen: boolean; inspectorFormationOpen: boolean; inspectorChecksOpen: boolean;
  formation: 'line' | 'arc' | 'circle' | 'block' | 'curve';
  formationWidth: number; formationHeight: number; formationRotation: number; formationColumns: number;
  nudgeStep: number; fastNudgeStep: number; coordinateDecimals: 0 | 1 | 2;
  coordinatePrecision: CoordinatePrecision;
  paperSize: 'letter' | 'a4'; printMode: 'charts' | 'coordinates';
  minimumSpacing: number; maximumStride: number;
}
export interface PreferencesResult { preferences: Preferences; warning?: string; readOnly?: boolean }
export interface PreferencesBridge {
  readPreferences: () => Promise<PreferencesResult>;
  savePreferences: (preferences: Preferences) => Promise<void>;
  resetPreferences: () => Promise<Preferences>;
}
export function defaultPreferences(): Preferences {
  return { version: 1, panelLayout: 'comfortable', view: '2d', showLabels: true, showPaths: false, showNextPaths: false, showGrid: true, snap: true, zoom: 1, selectionHintDismissed: false,
    selectionLabelsOnly: false, fieldOrientation: 'audience-bottom', fieldColorMode: 'section', fieldCustomColor: '#b9ed85', fieldDotRadiusPx: 3, fieldLabelSizePx: 12,
    inspectorSetOpen: true, inspectorSelectionOpen: true, inspectorFormationOpen: false, inspectorChecksOpen: false,
    formation: 'arc', formationWidth: 45, formationHeight: 22, formationRotation: 0, formationColumns: 8,
    nudgeStep: .625, fastNudgeStep: 2.5, coordinateDecimals: 2, coordinatePrecision: 'quarter', paperSize: 'letter', printMode: 'charts', minimumSpacing: 1, maximumStride: 1.25 };
}
const choices = { fieldOrientation: ['audience-bottom', 'audience-top'], fieldColorMode: ['section', 'selection', 'custom'], panelLayout: ['comfortable', 'compact'], view: ['2d', '3d'], formation: ['line', 'arc', 'circle', 'block', 'curve'], paperSize: ['letter', 'a4'], printMode: ['charts', 'coordinates'], coordinateDecimals: [0, 1, 2], coordinatePrecision: ['whole', 'half', 'quarter', 'decimal'] };
const bounds = { fieldDotRadiusPx: [2, 8], fieldLabelSizePx: [11, 24], zoom: [.6, 3], formationWidth: [1, 95], formationHeight: [1, 48], formationRotation: [-180, 180], formationColumns: [1, 500], nudgeStep: [.125, 5], fastNudgeStep: [.125, 10], minimumSpacing: [.1, 5], maximumStride: [.1, 5] };
/** v0/unversioned partial preferences migrate by adding defaults. Unknown fields never enter the canonical file. */
export function validatePreferences(input: unknown): Preferences {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Preferences must be an object.');
  const source = input as Record<string, unknown>;
  if (Object.keys(source).length > 64) throw new Error('Preferences contain too many fields.');
  if (source.version !== undefined && source.version !== 0 && source.version !== 1) throw new Error('Preferences use a newer or unsupported version. Update Squidware or reset preferences.');
  const result = defaultPreferences() as unknown as Record<string, unknown>;
  // Preserve the output of existing decimal-only preferences until a step increment is chosen.
  if (source.coordinatePrecision === undefined && source.coordinateDecimals !== undefined) result.coordinatePrecision = 'decimal';
  for (const key of Object.keys(result).filter(key => key !== 'version')) {
    if (source[key] === undefined) continue;
    const value = source[key];
    if (key === 'fieldCustomColor') {
      if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`Invalid preference: ${key}.`);
      result[key] = value; continue;
    }
    const allowed = choices[key as keyof typeof choices] as readonly unknown[] | undefined;
    const range = bounds[key as keyof typeof bounds];
    if (allowed ? !allowed.includes(value) : range ? typeof value !== 'number' || !Number.isFinite(value) || value < range[0] || value > range[1] || key === 'formationColumns' && !Number.isInteger(value) : typeof value !== 'boolean') throw new Error(`Invalid preference: ${key}.`);
    result[key] = value;
  }
  return result as unknown as Preferences;
}
