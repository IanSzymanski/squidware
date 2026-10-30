import type { FormationKind, FormationOptions, Project } from '../types';
import type { FormationSession } from '../formationPreview';
import type { HistoryEntry } from './history';
import { defaultPreferences } from '../preferences';
import type { Preferences } from '../preferences';
import type { TransformSession } from '../transforms';
import type { SpacingSession } from '../spacing';
import type { CoordinateEntrySession } from '../drillEntry';
import type { SelectionReview } from '../selectionTools';
import type { SetCreationKind } from './projectEdits';

export type Dialog = 'audio-alignment' | 'tempo' | 'package' | 'set-split' | 'score' | 'sheet-paste' | 'metronome' | 'problems' | 'analysis-rules' | 'rehearsal' | 'set-create' | 'snapping' | 'new' | 'settings' | 'preferences' | 'export' | 'help' | 'history' | 'recovery' | 'add-cast' | 'remove-cast' | 'remove-set' | null;
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
    selectionToolsOpen: boolean; selectionTolerance: number; selectionPreview: SelectionReview | null;
    showLabels: boolean; selectionLabelsOnly: boolean; showPaths: boolean; showNextPaths: boolean; showGrid: boolean; snap: boolean; dialog: Dialog;
    pendingDraft: boolean; menu: boolean; paletteOpen: boolean; toast: string; formation: FormationKind;
    setCreationKind: SetCreationKind;
    formationWidth: number; formationHeight: number; formationRotation: number; formationColumns: number;
    castPanelOpen: boolean; castQuery: string; sectionFilter: string; castAmount: number; castSection: string; castPrefix: string;
    printMode: 'charts' | 'coordinates'; printing: boolean;
    transformPreview: TransformSession | null;
    spacingPreview: SpacingSession | null;
    coordinatePreview: CoordinateEntrySession | null;
    formationPreview: FormationSession | null;
    formationDrafts: Partial<Record<FormationKind, FormationOptions>>;
  };
  fileSession: {
    savedRevision: number | null; needsSaveAs: boolean; saveStatus: string;
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
    ui: { workspace: 'design', focusMode: false, view: '2d', tool: 'select', zoom: 1, fitVersion: 0, projectEpoch: 0, selectionToolsOpen: false, selectionTolerance: .25, selectionPreview: null,
      showLabels: true, selectionLabelsOnly: false, showPaths: false, showNextPaths: false, showGrid: true, snap: true, dialog: null,
      pendingDraft: false, menu: false, paletteOpen: false, toast: '', setCreationKind: 'new', formation: 'arc', formationWidth: 45,
      formationHeight: 22, formationRotation: 0, formationColumns: 8, castPanelOpen: false, castQuery: '',
      sectionFilter: 'all', castAmount: 8, castSection: project.sections[0]?.id ?? '',
      castPrefix: 'B', printMode: 'charts', printing: false, transformPreview: null, spacingPreview: null, coordinatePreview: null, formationPreview: null, formationDrafts: {} },
    fileSession: { savedRevision: null, needsSaveAs: true, fileOperation: null,
      saveStatus: 'Save a project file', audioToken: '', audioSize: 0, audioReferenceAvailable: false, audioWarning: '', audioDuration: 0, audioName: '', audioUrl: '', waveform: [], audioLoading: false },
  };
}
