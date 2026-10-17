import type { PreferencesBridge } from './preferences';
import type { SnapSettings } from './snapping';
export interface Point { x: number; y: number }
export interface Section { id: string; name: string; color: string }
export interface Performer { id: string; label: string; name: string; sectionId: string }
export interface LegacyDrillSet {
  id: string;
  name: string;
  counts: number;
  tempo: number;
  notes: string;
  transition: 'linear' | 'ease';
  positions: Record<string, Point>;
}
export interface LegacyProject {
  schemaVersion: 1;
  id: string;
  title: string;
  ensemble: string;
  field: { width: number; height: number; preset: 'college' | 'high-school' };
  sections: Section[];
  performers: Performer[];
  sets: LegacyDrillSet[];
  audioOffsetSeconds: number;
}
export type DrillSet = Pick<LegacyDrillSet, 'id' | 'name' | 'notes' | 'positions'>;
export interface OpeningTiming { tempo: number; transition: 'linear' | 'ease' }
export interface LinePathSegment { id: string; kind: 'line'; startCount: number; endCount: number }
export interface PerformerPath { segments: LinePathSegment[] }
export interface Move extends OpeningTiming {
  id: string; fromSetId: string; toSetId: string; counts: number;
  paths: Record<string, PerformerPath>;
}
export interface Project extends Omit<LegacyProject, 'schemaVersion' | 'sets'> {
  schemaVersion: 2;
  snapping?: SnapSettings;
  sets: DrillSet[];
  moves: Move[];
  openingTiming: OpeningTiming;
}
export type SetPropertyUpdate = Partial<Pick<DrillSet, 'name' | 'notes'> & Pick<Move, 'counts' | 'tempo' | 'transition'>>;
export type FormationKind = 'line' | 'arc' | 'circle' | 'block' | 'curve';
export interface FormationOptions { center: Point; width: number; height: number; rotation: number; columns: number }
export interface TransitionIssue { type: 'collision' | 'stride'; performerIds: string[]; message: string; severity: 'warning' | 'danger'; atCount?: number }
export interface TimelineSample { positions: Record<string, Point>; setIndex: number; progress: number; localCount: number }
export interface RecoveryVersion {
  id: string; createdAt: number; revision: number; source: 'automatic' | 'legacy';
  projectId: string; title: string; performers: number; sets: number; bytes: number;
}
export interface RecoveryList { versions: RecoveryVersion[]; warnings: string[] }
export interface RecoveryBridge {
  beginRecovery: () => Promise<RecoveryList & { session: string }>;
  listRecoveries: (session: string) => Promise<RecoveryList>;
  readRecovery: (session: string, id: string) => Promise<{ project: Project; version: RecoveryVersion }>;
  writeRecovery: (session: string, sequence: number, revision: number, project: Project) => Promise<{ status: 'saved' | 'stale'; version?: RecoveryVersion }>;
  migrateRecovery: (session: string, content: string) => Promise<{ status: 'migrated' | 'unreadable'; warning?: string }>;
}
export interface DesktopBridge extends RecoveryBridge, PreferencesBridge {
  platform: string;
  resetProject: () => void;
  openProject: () => Promise<{ content: string; path: string } | null>;
  saveProject: (content: string, suggestedName: string, saveAs?: boolean) => Promise<string | null>;
  exportFile: (content: string, suggestedName: string, kind: 'csv' | 'svg' | 'html') => Promise<string | null>;
  exportPdf: (paper?: 'letter' | 'a4') => Promise<string | null>;
  setDirty: (dirty: boolean) => void;
  onMenuAction: (callback: (action: string) => void) => () => void;
}
declare global { interface Window { squidware?: DesktopBridge } }
