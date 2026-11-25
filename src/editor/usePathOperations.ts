import { useCallback, useEffect, useMemo, useState } from 'react';
import { sampleProject, setStartCount, uid, validateProjectEdit } from '../domain';
import { effectiveMove, groupOwner } from '../groupMotion';
import { copyIntervals, resolveIntervals } from '../movementPathOperations';
import type { MovementClipboard, PasteFrame } from '../movementPathOperations';
import { movementSvg } from '../movementPaths';
import type { PathSegment, Project } from '../types';
import { projectPatches } from './history';
import { pathOperationPlan } from './pathOperationReview';
import type { PathOperation, PathOperationRequest, PathReviewContext } from './pathOperationReview';
import type { Dialog } from './state';
import type { EditorStore } from './store';

interface Controller {
  project: Project;
  projectEpoch: number;
  dialog: Dialog;
  index: number;
  selectedIds: string[];
  store: EditorStore;
  dispatch: EditorStore['dispatch'];
  setPendingDraft: (pending: boolean, fieldId?: string) => void;
}
type OperationKind = 'resize' | 'reverse' | 'copy' | 'paste';
interface OperationOptions {
  kind: OperationKind;
  counts: string;
  selected: string[];
  whole: boolean;
  at: string;
  duration: string;
  frame: PasteFrame;
  accept: boolean;
}
interface Source extends PathReviewContext {
  project: Project;
  index: number;
  seed: string;
  clipboard: MovementClipboard | null;
  intervals: ReturnType<typeof resolveIntervals>;
}
interface Draft {
  source: Source;
  options: OperationOptions;
  progress: number;
  submitError: string;
}
interface PreviewRange {
  start: number;
  end: number;
  segments: readonly PathSegment[];
}

function review(source: Source, options: OperationOptions) {
  const { project, index, ids, clipboard, seed, moveId, activeSetId, revision, epoch } = source;
  const { kind, counts, at, duration, frame, accept, selected, whole } = options;
  const move = project.moves[index];
  const operation: PathOperation = kind === 'resize' ? { kind, counts: Number(counts) }
    : kind === 'paste' ? { kind, clipboardId: clipboard?.id ?? '', options: { performerId: ids[0], startCount: Number(at), duration: Number(duration), frame, seed, allowTargetTiming: accept } }
    : { kind: 'reverse' };
  const request: PathOperationRequest = { moveId, activeSetId, ids, revision, epoch, operation };
  try {
    let candidate = project;
    let clip: MovementClipboard | undefined;
    let summary: string;
    if (kind === 'copy') {
      if (ids.length !== 1) throw Error('Select exactly one source performer before copying.');
      clip = copyIntervals(project, index, ids[0], selected, whole, seed, epoch);
      const intervalCount = clip.intervals.length;
      summary = `Copy ${intervalCount} ${intervalCount === 1 ? 'interval' : 'intervals'} from ${clip.sourceLabel}, local counts ${clip.startCount}–${clip.endCount}. Gaps are included. The clipboard stays in this production session.`;
    } else {
      if (kind === 'resize' && !counts.trim() || kind === 'paste' && (!at.trim() || !duration.trim())) throw Error('Enter finite counts for the reviewed operation.');
      ({ project: candidate, summary } = pathOperationPlan(project, request, clipboard));
      validateProjectEdit(project, candidate);
    }
    const saved = effectiveMove(project, index), proposed = effectiveMove(candidate, index);
    const range = (counts: number, segments: readonly PathSegment[]): PreviewRange => ({
      start: clip?.startCount ?? (kind === 'paste' ? Number(at) : 0),
      end: clip?.endCount ?? (kind === 'paste' ? Number(at) + Number(duration) : counts),
      segments,
    });
    const savedSegments = ids.length === 1 ? saved.paths[ids[0]]?.segments ?? [] : [];
    const savedRange = clip ? { start: 0, end: move.counts, segments: savedSegments } : range(move.counts, savedSegments);
    const proposedRange = range(proposed.counts, ids.length === 1 ? proposed.paths[ids[0]]?.segments ?? [] : []);
    const paths = ids.map(id => ({
      id,
      saved: movementSvg(project.sets[index].positions[id], project.sets[index + 1].positions[id], saved.paths[id]),
      proposed: clip
        ? movementSvg(clip.from, clip.to, { segments: clip.intervals.map(({ segment }) => segment) })
        : movementSvg(candidate.sets[index].positions[id], candidate.sets[index + 1].positions[id], proposed.paths[id]),
    }));
    return { request, summary, error: '', changed: kind === 'copy' || projectPatches(project, candidate).length > 0,
      preview: { candidate, paths, savedRange, proposedRange, start: setStartCount(project, index) } };
  } catch (e) {
    return { request, summary: '', error: (e as Error).message, changed: false, preview: null };
  }
}

export function usePathOperations(c: Controller) {
  const active = c.dialog === 'path-operations';
  const [draft, setDraft] = useState<Draft | null>(null);
  if (active && !draft) {
    const state = c.store.getState(), project = c.project, index = Math.max(0, c.index - 1), ids = [...c.selectedIds];
    const move = project.moves[index];
    if (move) {
      const intervals = ids.length === 1 && !groupOwner(move, ids[0]) ? resolveIntervals(project, index, ids[0]) : [];
      setDraft({
        source: { project, index, ids, intervals, moveId: move.id, activeSetId: project.sets[c.index].id,
          revision: state.project.revision, epoch: c.projectEpoch, clipboard: state.ui.movementClipboard, seed: uid() },
        options: { kind: 'resize', counts: String(move.counts), selected: intervals.map(({ segment }) => segment.id),
          whole: true, at: '0', duration: String(move.counts), frame: 'fit', accept: false },
        progress: 25, submitError: '',
      });
    }
  } else if (!active && draft) setDraft(null);

  const source = draft?.source, options = draft?.options;
  const result = useMemo(() => source && options ? review(source, options) : null, [source, options]);
  const move = source?.project.moves[source.index];
  const edited = options?.kind === 'resize' ? options.counts !== String(move?.counts)
    : options?.kind === 'paste' && (options.at !== '0' || options.duration !== String(move?.counts) || options.frame !== 'fit' || options.accept);
  const dirty = active && (!!edited || options?.kind !== 'copy' && !!result?.changed);
  const { store, dispatch, setPendingDraft } = c;
  useEffect(() => {
    setPendingDraft(dirty, 'path-operations');
    return () => setPendingDraft(false, 'path-operations');
  }, [dirty, setPendingDraft]);

  const close = useCallback(() => {
    setPendingDraft(false, 'path-operations');
    dispatch('dialog.open', { dialog: null });
  }, [dispatch, setPendingDraft]);
  useEffect(() => {
    if (!active) return;
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || store.getState().ui.confirmation) return;
      event.preventDefault();
      close();
    }
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [active, close, store]);

  if (!active || !draft || !result) return null;
  const { source: initial, options: values, progress, submitError } = draft;
  const { project, ids, clipboard } = initial;
  const state = store.getState();
  const stale = state.project.revision !== initial.revision || c.projectEpoch !== initial.epoch
    || c.project.sets[c.index]?.id !== initial.activeSetId || c.selectedIds.length !== ids.length
    || ids.some((id, i) => id !== c.selectedIds[i])
    || values.kind === 'paste' && state.ui.movementClipboard?.id !== clipboard?.id;
  const { request, error, changed, summary } = result;
  const reviewed = !stale ? result.preview : null;
  const preview = reviewed && (() => {
    const sample = ({ start, end }: PreviewRange) => start + (end - start) * progress / 100;
    const proposedCount = sample(reviewed.proposedRange);
    const savedCount = values.kind === 'copy' ? proposedCount : sample(reviewed.savedRange);
    const proposed = sampleProject(reviewed.candidate, reviewed.start + proposedCount);
    return { ...reviewed, savedCount, proposedCount,
      before: sampleProject(project, reviewed.start + savedCount).positions,
      after: proposed.positions, staging: proposed.staging };
  })();

  function update(patch: Partial<OperationOptions>) {
    setDraft(old => old && { ...old, options: { ...old.options, ...patch }, submitError: '' });
  }
  function setProgress(progress: number) { setDraft(old => old && { ...old, progress }); }
  function apply() {
    if (error || stale || !changed || store.getState().ui.confirmation) return;
    setPendingDraft(false, 'path-operations');
    const ok = values.kind === 'copy'
      ? dispatch('path.copy-intervals', { moveId: request.moveId, activeSetId: request.activeSetId, ids, revision: request.revision,
        epoch: request.epoch, performerId: ids[0], segmentIds: values.selected, wholeMove: values.whole })
      : dispatch('path.operation-apply', request);
    if (ok !== true) {
      setPendingDraft(dirty, 'path-operations');
      setDraft(old => old && { ...old, submitError: store.getState().ui.toast || 'Cancel and reopen to review the current move.' });
    }
  }
  return { initial, opening: c.index === 0, values, progress, setProgress, update, summary, error, stale, changed, submitError, preview, apply, close };
}

export type PathOperationsSession = NonNullable<ReturnType<typeof usePathOperations>>;
