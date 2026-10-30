import type { PreferencesBridge } from './preferences';
import type { SnapSettings } from './snapping';
import type { TemplateLibraryBridge } from './templates/storage';
export interface Point { x: number; y: number }
export interface Section { id: string; name: string; color: string }
export interface Performer { id: string; label: string; name: string; sectionId: string }
export interface SelectionGroup { id: string; name: string; performerIds: string[] }
export type RehearsalAnchor = { kind: 'set'; setId: string } | { kind: 'move'; moveId: string; fromSetId: string; toSetId: string; count: number };
export type RehearsalFocus = { kind: 'all' } | { kind: 'section'; sectionId: string } | { kind: 'performers'; performerIds: string[] };
export interface RehearsalPassage {
  id: string; name: string; notes: string; start: RehearsalAnchor;
  end?: RehearsalAnchor; focus: RehearsalFocus;
}
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
export interface Meter { numerator: number; denominator: number; grouping: number[] }
export interface ScoreMap {
  firstMeasure: number; pickupCounts: number;
  changes: { count: number; meter: Meter }[];
  marks: { count: number; label: string }[];
}
export interface TempoMap {
  version: 1;
  regions: { startCount: number; endCount: number; startTempo: number; endTempo: number }[];
  holds: { count: number; seconds: number }[];
}
export interface AudioAnchor { count: number; seconds: number }
export type MarchingDirection = 'forward' | 'backward' | 'sideways';
export interface AnalysisThresholds { minimumSpacing: number; maximumStride: number }
export type AnalysisOverrides = Partial<AnalysisThresholds>;
export type DirectionRules = Partial<Record<MarchingDirection, AnalysisOverrides>>;
export interface SectionAnalysisRules extends AnalysisOverrides { sectionId: string; directions?: DirectionRules }
export interface ProjectAnalysisRules { defaults: AnalysisThresholds; directions?: DirectionRules; sections?: SectionAnalysisRules[] }
export interface LinePathSegment { id: string; kind: 'line'; startCount: number; endCount: number }
export interface PerformerPath { segments: LinePathSegment[] }
export interface Move extends OpeningTiming {
  id: string; fromSetId: string; toSetId: string; counts: number;
  paths: Record<string, PerformerPath>;
  marchingDirections?: Record<string, MarchingDirection>;
}
export interface Project extends Omit<LegacyProject, 'schemaVersion' | 'sets'> {
  schemaVersion: 2;
  snapping?: SnapSettings;
  selectionGroups?: SelectionGroup[];
  rehearsal?: RehearsalPassage[];
  analysisRules?: ProjectAnalysisRules;
  meter?: Meter;
  score?: ScoreMap;
  tempoMap?: TempoMap;
  audioAnchors?: AudioAnchor[];
  sets: DrillSet[];
  moves: Move[];
  openingTiming: OpeningTiming;
}
export type SetPropertyUpdate = Partial<Pick<DrillSet, 'name' | 'notes'> & Pick<Move, 'counts' | 'tempo' | 'transition'>>;
export type FormationKind = 'line' | 'arc' | 'circle' | 'block' | 'curve';
export type FormationAssignment = 'position' | 'roster';
export interface FormationOptions { center: Point; width: number; height: number; rotation: number; columns: number; assignment?: FormationAssignment }
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
export interface AudioAttachment { name: string; token: string; bytes: Uint8Array; size: number; type: string; referenceAvailable: boolean }
export interface DesktopBridge extends RecoveryBridge, PreferencesBridge, TemplateLibraryBridge {
  platform: string;
  resetProject: () => void;
  openProject: () => Promise<{ content: string; path: string; audio?: AudioAttachment; audioWarning?: string } | null>;
  pickAudio: () => Promise<AudioAttachment | null>;
  useAudio: (token: string) => Promise<void>;
  stageAudio: (name: string, bytes: Uint8Array) => Promise<AudioAttachment>;
  exportPackage: (content: string, name: string, token: string, mode: 'bundle' | 'reference') => Promise<string | null>;
  saveProject: (content: string, suggestedName: string, saveAs?: boolean) => Promise<string | null>;
  exportFile: (content: string, suggestedName: string, kind: 'csv' | 'svg' | 'html') => Promise<string | null>;
  exportPdf: (paper?: 'letter' | 'a4') => Promise<string | null>;
  setDirty: (dirty: boolean) => void;
  setKeyboardContext: (context: 'editor' | 'text' | 'modal') => void;
  onMenuAction: (callback: (action: string) => void) => () => void;
}
declare global { interface Window { squidware?: DesktopBridge } }
