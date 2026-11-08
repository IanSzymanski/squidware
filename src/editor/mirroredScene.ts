import { useMemo } from 'react';
import { sampleProject } from '../domain';
import { activePassage, resolvePassage } from '../rehearsal';
import type { Point, Project, TimelineSample } from '../types';
import { isAtActiveSet } from './editMode';
import { useEditorSelector } from './react';
import type { EditorStore } from './store';
import type { EditorController } from './useEditorController';

type Positions = Readonly<Record<string, Point>>;
export interface MoveDraft { index: number; updates: Positions }

let cached: { project: Project; count: number; sample: TimelineSample } | null = null;
/** The 2D field and the 3D window sample the same playhead once per project and count. */
export function sharedSample(project: Project, count: number): TimelineSample {
  if (cached?.project !== project || cached.count !== count) cached = { project, count, sample: sampleProject(project, count) };
  return cached.sample;
}
/** An active rehearsal passage shows only its focus performers. */
export function rehearsalScope(project: Project, rehearsalId: string | null): Project {
  const passage = activePassage(project, rehearsalId);
  if (!passage) return project;
  const ids = new Set(resolvePassage(project, passage).focus.ids);
  return { ...project, performers: project.performers.filter(p => ids.has(p.id)) };
}
export function scopePositions(positions: Positions, scope: Project | null): Positions {
  return scope ? Object.fromEntries(scope.performers.flatMap(p => positions[p.id] ? [[p.id, positions[p.id]]] : [])) : positions;
}
/** A live 2D drag on the displayed, editable set; other sets, playback and unknown performers are ignored. */
export function overlayDraft(positions: Positions, draft: MoveDraft | null, index: number, editable: boolean): Positions {
  if (!draft || !editable || draft.index !== index) return positions;
  const updates = Object.entries(draft.updates).filter(([id]) => positions[id]);
  return updates.length ? { ...positions, ...Object.fromEntries(updates) } : positions;
}

const channels = new WeakMap<EditorStore, { value: MoveDraft | null; listeners: Set<() => void> }>();
/** Uncommitted 2D drags never enter the store; the 3D window follows them through this per-editor channel. */
export function moveDrafts(store: EditorStore) {
  let channel = channels.get(store);
  if (!channel) channels.set(store, channel = { value: null, listeners: new Set() });
  const state = channel;
  return {
    get: () => state.value,
    publish(index: number, updates: Positions | null) {
      const next = updates && Object.keys(updates).length ? { index, updates } : null;
      if (!next && !state.value) return;
      state.value = next; state.listeners.forEach(listener => listener());
    },
    subscribe(listener: () => void) { state.listeners.add(listener); return () => { state.listeners.delete(listener); }; },
  };
}

/** What the field shows now: a preview, the editable set or the sampled playhead, scoped to rehearsal focus. */
export function useFieldScene(controller: EditorController) {
  const { project, activeSet, playing } = controller;
  const rehearsalId = useEditorSelector(s => s.playback.rehearsalId);
  const atSet = useEditorSelector(isAtActiveSet);
  const count = useEditorSelector(s => s.playback.count);
  const rehearsalProject = useMemo(() => rehearsalScope(project, rehearsalId), [project, rehearsalId]);
  const sample = useMemo(() => sharedSample(project, count), [project, count]);
  const allPositions = controller.coordinateResult?.positions ?? controller.spacingResult?.positions ?? controller.formationResult?.positions ?? controller.transformResult?.positions ?? (atSet && !playing ? activeSet.positions : sample.positions);
  const positions = useMemo(() => scopePositions(allPositions, rehearsalId ? rehearsalProject : null), [rehearsalId, rehearsalProject, allPositions]);
  return { rehearsalId, rehearsalProject, atSet, count, sample, positions };
}
