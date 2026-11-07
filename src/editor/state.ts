import type { MovementClipboard } from '../movementPathOperations';
import type { FormationKind, FormationOptions, Project } from '../types';
import type { FormationAssignmentMode, FormationSession } from '../formationPreview';
import type { HistoryEntry } from './history';
import { defaultPreferences } from '../preferences';
import type { Preferences } from '../preferences';
import type { TransformSession } from '../transforms';
import type { SpacingSession } from '../spacing';
import type { CoordinateEntrySession } from '../drillEntry';
import type { SelectionReview } from '../selectionTools';
import type { SetCreationKind } from './projectEdits';

export type Dialog = 'group-motion' | 'formation-transition' | 'assignment' | 'routes' | 'path-draw' | 'path-operations' | 'movement-schedule' | 'path' | 'templates' | 'audio-alignment' | 'tempo' | 'package' | 'set-split' | 'score' | 'sheet-paste' | 'metronome' | 'problems' | 'analysis-rules' | 'rehearsal' | 'set-create' | 'snapping' | 'new' | 'settings' | 'preferences' | 'export' | 'help' | 'history' | 'recovery' | 'add-cast' | 'remove-cast' | 'remove-set' | null;
export type Workspace = 'design' | 'cast' | 'production';
export interface ProjectHistory {
  past: HistoryEntry[]; present: Project; future: HistoryEntry[]; revision: number;
  estimatedBytes: number; droppedEntries: number; transactionName?: string; recoveryError?: string;
}
export interface EditorState {
  preferences: { value: Preferences; status: 'loading' | 'pending' | 'saving' | 'saved' | 'unavailable'; error: string };
  project: ProjectHistory;
  selection: { activeIndex: number; selectedIds: string[] };
  playback: { count: number; playing: boolean; loop: boolean; speed: number; metronome: boolean; countInBars: number; muted: boolean; clockStatus: string; seekVersion: number; rehearsalId: string | null };
  ui: {
    workspace: Workspace; focusMode: boolean; view: '2d' | '3d'; tool: 'select' | 'pan' | 'lasso'; zoom: number; fitVersion: number; projectEpoch: number;
    /** The separate 3D window exists only with the desktop bridge; a focus request increments popout3dFocus. */
    popout3d: 'unavailable' | 'closed' | 'open'; popout3dFocus: number;
    selectionToolsOpen: boolean; selectionTolerance: number; selectionPreview: SelectionReview | null;
    showLabels: boolean; selectionLabelsOnly: boolean; showPaths: boolean; showNextPaths: boolean; showGrid: boolean; snap: boolean; dialog: Dialog; groupMotionId?: string;
    pendingDraft: boolean; menu: boolean; paletteOpen: boolean; toast: string; formation: FormationKind;
    setCreationKind: SetCreationKind;
    formationWidth: number; formationHeight: number; formationRotation: number; formationColumns: number;
    /** Showing Cast beside the field (header tab, Dock Cast, palette) increments castReveal: Cast docks, or opens over the field on a window too narrow to dock it, and takes focus. */
    castPanelOpen: boolean; castReveal: number; castQuery: string; sectionFilter: string; castAmount: number; castSection: string; castPrefix: string;
    printMode: 'charts' | 'coordinates'; printing: boolean;
    transformPreview: TransformSession | null;
    spacingPreview: SpacingSession | null;
    coordinatePreview: CoordinateEntrySession | null;
    formationPreview: FormationSession | null;
    movementClipboard: MovementClipboard | null;
    formationDrafts: Partial<Record<FormationKind, FormationOptions>>;
    /** A pending in-app confirmation; guards treat it like an open dialog. */
    confirmation: { title: string; message: string; confirmLabel: string; cancelLabel?: string; tone?: 'danger' | 'primary' } | null;
    /** Session-only assignment choice per shape; never saved with drafts or live formations. */
    formationAssignmentModes: Partial<Record<FormationKind, FormationAssignmentMode>>;
  };
  fileSession: {
    savedRevision: number | null; needsSaveAs: boolean; saveStatus: string;
    /** Revision of a freshly created, never-saved production with nothing to lose. Never set by recovery or a generic load. */
    cleanRevision: number | null;
    fileOperation: 'saving' | 'opening' | 'exporting' | null;
    audioToken: string; audioSize: number; audioReferenceAvailable: boolean; audioWarning: string;
    audioDuration: number; audioName: string; audioUrl: string; waveform: number[]; audioLoading: boolean;
  };
}
export type SessionSlice = Exclude<keyof EditorState, 'project'>;
export function createEditorState(project: Project, recoveryError?: string): EditorState {
  return {
    preferences: { value: defaultPreferences(), status: 'loading', error: '' },
    project: { present: project, past: [], future: [], revision: 0, estimatedBytes: 0, droppedEntries: 0, recoveryError },
    selection: { activeIndex: 0, selectedIds: [] },
    playback: { count: 0, playing: false, loop: false, speed: 1, metronome: false, countInBars: 0, muted: false, clockStatus: '', seekVersion: 0, rehearsalId: null },
    ui: { workspace: 'design', focusMode: false, view: '2d', popout3d: 'unavailable', popout3dFocus: 0, tool: 'select', zoom: 1, fitVersion: 0, projectEpoch: 0, selectionToolsOpen: false, selectionTolerance: .25, selectionPreview: null,
      showLabels: true, selectionLabelsOnly: false, showPaths: false, showNextPaths: false, showGrid: true, snap: true, dialog: null,
      pendingDraft: false, menu: false, paletteOpen: false, toast: '', setCreationKind: 'new', formation: 'arc', formationWidth: 45,
      formationHeight: 22, formationRotation: 0, formationColumns: 8, castPanelOpen: false, castReveal: 0, castQuery: '',
      sectionFilter: 'all', castAmount: 8, castSection: project.sections[0]?.id ?? '',
      castPrefix: 'B', printMode: 'charts', printing: false, transformPreview: null, spacingPreview: null, coordinatePreview: null, formationPreview: null, formationDrafts: {}, formationAssignmentModes: {}, movementClipboard: null,
      confirmation: null },
    fileSession: { savedRevision: null, cleanRevision: null, needsSaveAs: true, fileOperation: null,
      saveStatus: 'Save a project file', audioToken: '', audioSize: 0, audioReferenceAvailable: false, audioWarning: '', audioDuration: 0, audioName: '', audioUrl: '', waveform: [], audioLoading: false },
  };
}
