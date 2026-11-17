import { useEffect, useState } from 'react';
import type { Point, Project } from '../types';
import { sampleProject, setStartCount, validateProject } from '../domain';
import { editMovementSchedule, pathFromRows, scheduleRows, type ScheduleRow } from './movementScheduleEditing';
import { moveTravelHandle, selectedTravel, travelHandles } from './pathAuthoring';
import type { Dialog } from './state';
import type { EditorStore } from './store';
import type { TravelPreview } from './TravelCanvas';

import { isMovementEditor } from './movementEditor';

interface Controller {
  project: Project; index: number; selectedIds: string[]; projectEpoch: number; dialog: Dialog;
  store: EditorStore; dispatch: EditorStore['dispatch'];
  setPendingDraft: (pending: boolean, fieldId?: string) => void;
  setDialog: (dialog: Dialog) => void;
}
interface Draft {
  initial: { project: Project; index: number; id: string; rows: ScheduleRow[]; revision: number; epoch: number; draw: boolean };
  rows: ScheduleRow[]; snapHandles: boolean; count: number; selectedRow: string; gesture: boolean;
  capture: 'stroke' | 'anchors' | null; stroke: Point[]; submitError: string;
}

/** One local draft feeds both the docked parameters and the actual field.
 * Only schedule.save commits geometry; all samplers continue to use the engine. */
export function useMovementSchedule(c: Controller) {
  const active = isMovementEditor(c.dialog);
  const [draft, setDraft] = useState<Draft | null>(null);
  if (active && !draft) {
    const project = c.project, index = c.index - 1, id = c.selectedIds[0], rows = scheduleRows(project, index, id);
    setDraft({ initial: { project, index, id, rows, revision: c.store.getState().project.revision, epoch: c.projectEpoch, draw: c.dialog === 'path-draw' },
      rows, snapHandles: false, count: project.moves[index].counts / 2, selectedRow: rows.find(r => r.kind !== 'hold')?.id ?? '',
      gesture: false, capture: c.dialog === 'path-draw' && rows.some(r => r.kind !== 'hold') ? 'stroke' : null, stroke: [], submitError: '' });
  } else if (!active && draft) setDraft(null);
  const dirty = !!draft && active && (!!draft.stroke.length || JSON.stringify(draft.rows) !== JSON.stringify(draft.initial.rows));
  useEffect(() => { c.setPendingDraft(dirty, 'movement-schedule'); return () => c.setPendingDraft(false, 'movement-schedule'); }, [dirty, c.setPendingDraft]);
  useEffect(() => {
    if (!active) return;
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || c.store.getState().ui.confirmation) return;
      event.preventDefault(); c.setPendingDraft(false, 'movement-schedule'); c.setDialog(null);
    }
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [active, c.store, c.setPendingDraft]);
  if (!active || !draft) return null;
  const { initial, rows, count, selectedRow, gesture, capture, stroke } = draft;
  const { project, index, id } = initial, move = project.moves[index];
  const from = project.sets[index].positions[id], to = project.sets[index + 1].positions[id];
  const patch = (update: Partial<Draft>) => setDraft(old => old && { ...old, ...update });
  function setRows(change: ScheduleRow[] | ((rows: ScheduleRow[]) => ScheduleRow[])) {
    setDraft(old => {
      if (!old) return old;
      const rows = typeof change === 'function' ? change(old.rows) : change;
      const selectedRow = rows.some(r => r.id === old.selectedRow) ? old.selectedRow : rows.find(r => r.kind !== 'hold')?.id ?? rows[0]?.id ?? '';
      return { ...old, rows, selectedRow };
    });
  }
  let error = '', path = null as ReturnType<typeof pathFromRows>, candidate = project;
  try {
    path = pathFromRows(rows);
    candidate = editMovementSchedule(project, { moveId: move.id, performerId: id, path, revision: initial.revision, epoch: initial.epoch });
    validateProject(candidate);
  } catch (e) {
    error = (e as Error).message.replace(/^Invalid project:.*\.segments\[(\d+)\]/, (_match, n: string) => `Interval ${Number(n) + 1}`)
      .replace(/^Invalid project:.*\.paths\.[A-Za-z0-9_-]+/, 'Movement schedule');
  }
  const stale = c.store.getState().project.revision !== initial.revision || c.projectEpoch !== initial.epoch || c.index !== index + 1 || c.selectedIds.length !== 1 || c.selectedIds[0] !== id;
  const changed = dirty && JSON.stringify(path) !== JSON.stringify(move.paths[id] ?? null);
  const travel = !error ? selectedTravel(rows, selectedRow, from, to) : undefined;
  function close() { c.setPendingDraft(false, 'movement-schedule'); c.setDialog(null); }
  function apply() {
    if (error || stale || !changed || gesture || capture) return;
    c.setPendingDraft(false, 'movement-schedule');
    if (c.dispatch('schedule.save', { moveId: move.id, performerId: id, path, revision: initial.revision, epoch: initial.epoch }) !== true) {
      c.setPendingDraft(dirty, 'movement-schedule'); patch({ submitError: c.store.getState().ui.toast || 'Cancel and reopen to review the current move.' });
    }
  }
  function selectRow(id: string) { if (!capture && !gesture) patch({ selectedRow: id }); }
  const positions = sampleProject(candidate, setStartCount(candidate, index) + count).positions;
  const field: TravelPreview = { project, positions, performerId: id, from, to, path: path ?? undefined, original: move.paths[id], counts: move.counts, transition: move.transition,
    snapHandles: draft.snapHandles, handles: error || stale ? [] : travelHandles(from, to, path ?? undefined), selectedRow, onSelectRow: selectRow,
    onHandle: (handle, point) => setRows(old => moveTravelHandle(old, handle, point)),
    capture: travel && !stale ? capture : null, captureFrom: travel?.from, captureTo: travel?.to, stroke,
    onStroke: stroke => patch({ stroke }), onCancelCapture: () => patch({ capture: null, stroke: [] }),
    onError: submitError => patch({ submitError }), onGesture: gesture => patch({ gesture }), label: 'Timed movement preview',
    onApply: apply, onCancel: close };
  return { ...draft, project, index, id, move, from, to, path, error, stale, changed, travel, preview: positions, field,
    label: project.performers.find(p => p.id === id)!.label, drawInitially: initial.draw,
    lastTravel: rows.reduce((last, row, i) => row.kind !== 'hold' ? i : last, -1),
    setRows, selectRow, apply, close, patch,
    update: (rowId: string, key: keyof ScheduleRow, value: string) => setRows(old => old.map(row => row.id === rowId ? { ...row, [key]: value } : row)),
    fit: (rows: ScheduleRow[]) => {
      validateProject(editMovementSchedule(project, { moveId: move.id, performerId: id, path: pathFromRows(rows), revision: initial.revision, epoch: initial.epoch }));
      setRows(rows); patch({ submitError: '' });
    } };
}
export type MovementScheduleSession = NonNullable<ReturnType<typeof useMovementSchedule>>;
