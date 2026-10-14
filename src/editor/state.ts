import type { FormationKind, Project } from '../types';
import type { HistoryEntry } from './history';

export type Dialog = 'new' | 'settings' | 'export' | 'help' | 'history' | 'recovery' | 'add-cast' | 'remove-cast' | 'remove-set' | null;
export type Workspace = 'design' | 'cast' | 'production';
export interface ProjectHistory {
  past: HistoryEntry[]; present: Project; future: HistoryEntry[]; revision: number;
  estimatedBytes: number; droppedEntries: number; transactionName?: string; recoveryError?: string;
}
export interface EditorState {
  project: ProjectHistory;
  selection: { activeIndex: number; selectedIds: string[] };
  playback: { count: number; playing: boolean; loop: boolean; speed: number; metronome: boolean; muted: boolean };
  ui: {
    workspace: Workspace; view: '2d' | '3d'; tool: 'select' | 'pan'; zoom: number; fitVersion: number; projectEpoch: number;
    showLabels: boolean; showPaths: boolean; showGrid: boolean; snap: boolean; dialog: Dialog;
    pendingDraft: boolean; menu: boolean; toast: string; formation: FormationKind;
    formationWidth: number; formationHeight: number; formationRotation: number; formationColumns: number;
    castQuery: string; sectionFilter: string; castAmount: number; castSection: string; castPrefix: string;
    printMode: 'charts' | 'coordinates'; printing: boolean;
  };
  fileSession: {
    savedRevision: number | null; needsSaveAs: boolean; saveStatus: string;
    fileOperation: 'saving' | 'opening' | null;
    audioName: string; audioUrl: string; waveform: number[]; audioLoading: boolean;
  };
}
export type SessionSlice = Exclude<keyof EditorState, 'project'>;
export function createEditorState(project: Project, recoveryError?: string): EditorState {
  return {
    project: { present: project, past: [], future: [], revision: 0, estimatedBytes: 0, droppedEntries: 0, recoveryError },
    selection: { activeIndex: 0, selectedIds: [] },
    playback: { count: 0, playing: false, loop: false, speed: 1, metronome: false, muted: false },
    ui: { workspace: 'design', view: '2d', tool: 'select', zoom: 1, fitVersion: 0, projectEpoch: 0,
      showLabels: true, showPaths: false, showGrid: true, snap: true, dialog: null,
      pendingDraft: false, menu: false, toast: '', formation: 'arc', formationWidth: 45,
      formationHeight: 22, formationRotation: 0, formationColumns: 8, castQuery: '',
      sectionFilter: 'all', castAmount: 8, castSection: project.sections[0]?.id ?? '',
      castPrefix: 'B', printMode: 'charts', printing: false },
    fileSession: { savedRevision: null, needsSaveAs: true, fileOperation: null,
      saveStatus: 'Save a project file', audioName: '', audioUrl: '', waveform: [], audioLoading: false },
  };
}
