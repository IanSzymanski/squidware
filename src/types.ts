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
export type DrillSet = Pick<LegacyDrillSet, 'id' | 'name' | 'notes' | 'positions'> & { liveFormations?: LiveFormation[] };
export interface LiveFormation {
  id: string; name: string; kind: FormationKind; options: Required<FormationOptions>;
  bezier?: BezierFormation;
  scatter?: ScatterFormation;
  assignmentConstraints?: AssignmentConstraints;
  /** Vacant slots remain in place until the writer explicitly redistributes. */
  slotCount: number; members: { performerId: string; slot: number }[];
}
export interface BezierAnchor { id: string; point: Point; incoming: Point; outgoing: Point; mode: 'corner' | 'smooth' | 'symmetric' }
export interface BezierFormation { anchors: BezierAnchor[] }
export interface ScatterRegion { kind: 'rectangle' | 'ellipse' | 'polygon'; vertices: Point[] }
export interface ScatterSettings {
  version: 1; seed: string; region: ScatterRegion; minimumSpacing: number;
  distribution: 'uniform' | 'clustered'; clusterStrength: number;
}
export interface ScatterFormation extends ScatterSettings { points: Point[]; pinnedSlots: number[] }
export interface AssignmentPair { performerId: string; slot: number }
export interface AssignmentConstraints {
  pins: AssignmentPair[]; forbidden: AssignmentPair[];
  sectionSlots: { slot: number; sectionId: string }[];
  roleSlots: { slot: number; role: string }[];
  roles: Record<string, string>; unknownRoles: 'reject' | 'allow';
  orderedGroups: { id: string; name: string; performerIds: string[]; slots: number[] }[];
}
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
export interface LinePathSegment { id: string; kind: 'line'; startCount: number; endCount: number; to?: Point }
export interface CubicPathSegment { id: string; kind: 'cubic'; startCount: number; endCount: number; control1: Point; control2: Point; to?: Point }
export interface HoldPathSegment { id: string; kind: 'hold'; startCount: number; endCount: number }
export type PathSegment = LinePathSegment | CubicPathSegment | HoldPathSegment;
export interface PerformerPath {
  segments: PathSegment[];
  /** Derived group paths only. Never stored in move.paths or written to a file. */
  linearCounts?: true;
}
/** Production-local geometry, independent of performer membership and timing. */
export type RouteSegment = { id: string; to: Point } & ({ kind: 'line' } | { kind: 'cubic'; control1: Point; control2: Point });
export interface SharedRoute { id: string; name: string; closed: boolean; start: Point; segments: RouteSegment[] }
export interface GroupMotion {
  id: string; name: string; routeId: string; mode: 'follow' | 'countermarch' | 'conveyor';
  /** First member is the leader/reference member; identities never interpolate. */
  members: string[]; delay: number; interval: number; offsetDirection: -1 | 1;
  phase: number; speed: number; entryCounts: number; exitCounts: number;
  endpointPolicy: 'reject' | 'hold';
  /** Route-local leader clock; negative cues explicitly describe follower history. */
  cues: { count: number; direction: -1 | 0 | 1 }[];
}
export interface Move extends OpeningTiming {
  id: string; fromSetId: string; toSetId: string; counts: number;
  paths: Record<string, PerformerPath>;
  marchingDirections?: Record<string, MarchingDirection>;
  groupMotions?: GroupMotion[];
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
  sharedRoutes?: SharedRoute[];
  sets: DrillSet[];
  moves: Move[];
  openingTiming: OpeningTiming;
}
export type SetPropertyUpdate = Partial<Pick<DrillSet, 'name' | 'notes'> & Pick<Move, 'counts' | 'tempo' | 'transition'>>;
export type FormationKind = 'line' | 'arc' | 'circle' | 'block' | 'curve';
export type FormationAssignment = 'position' | 'roster';
export interface FormationOptions { center: Point; width: number; height: number; rotation: number; columns: number; assignment?: FormationAssignment }
export interface TransitionIssue {
  type: 'collision' | 'stride'; performerIds: string[]; message: string; severity: 'warning' | 'danger'; atCount?: number;
  certainty?: 'confirmed' | 'possible'; countRange?: [number, number];
  measurement?: { lower: number; upper: number; tolerance: number; unit: 'yd' | 'yd/count'; converged: boolean };
}
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
  /** Set only for desktop QA runs, which assert against the small generated demo fixture. */
  legacyDemo?: boolean;
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
  /** Bring the separate 3D window to the front; main ignores the request when none is open. */
  focusPreviewWindow: () => void;
  /** Main reports the 3D window's geometry (with its display) after moves, resizes and close. */
  onPreviewWindowBounds: (callback: (bounds: import('./popoutBounds').PopoutBounds) => void) => () => void;
}
declare global { interface Window { squidware?: DesktopBridge } }
