import { useEffect, useMemo, useState, type SetStateAction } from 'react';
import { compileRoute, routeLength, routePath, validateSharedRoutes } from '../sharedRoutes';
import type { Point, Project, SharedRoute } from '../types';
import type { Dialog } from './state';
import type { EditorStore } from './store';
import type { TravelPreview } from './TravelCanvas';
import type { TravelHandle } from './pathAuthoring';
import { editSharedRoute, moveRoutePoint, newSharedRoute } from './routeEditing';

interface Controller {
  project: Project; projectEpoch: number; dialog: Dialog; activeSet: Project['sets'][number];
  store: EditorStore; dispatch: EditorStore['dispatch'];
  setPendingDraft: (pending: boolean, fieldId?: string) => void;
  setDialog: (dialog: Dialog) => void;
}
interface Draft {
  initial: { project: Project; revision: number; epoch: number };
  route: SharedRoute; row: string; stroke: Point[]; capture: 'stroke' | 'anchors' | null;
  curved: boolean; sourceMode: 'stroke' | 'anchors'; tolerance: string; coordinates: string[];
  message: string; gesture: boolean; deleting: boolean; snapHandles: boolean;
}

/** One route draft feeds the Inspector and main field; routes.save remains the only commit. */
export function useSharedRoutes(c: Controller) {
  const active = c.dialog === 'routes';
  const [draft, setDraft] = useState<Draft | null>(null);
  if (active && !draft) {
    const route = structuredClone(c.project.sharedRoutes?.[0] ?? newSharedRoute([], c.project.field));
    setDraft({ initial: { project: c.project, revision: c.store.getState().project.revision, epoch: c.projectEpoch },
      route, row: route.segments[0].id, stroke: [], capture: null, curved: true, sourceMode: 'stroke',
      tolerance: '0.15', coordinates: ['50', '25'], message: '', gesture: false, deleting: false, snapHandles: false });
  } else if (!active && draft) setDraft(null);
  const originalRoute = draft?.initial.project.sharedRoutes?.find(r => r.id === draft.route.id);
  const dirty = active && !!draft && (!originalRoute || JSON.stringify(originalRoute) !== JSON.stringify(draft.route) || !!draft.stroke.length);
  useEffect(() => { c.setPendingDraft(dirty, 'shared-route'); return () => c.setPendingDraft(false, 'shared-route'); }, [dirty, c.setPendingDraft]);
  useEffect(() => {
    if (!active) return;
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || c.store.getState().ui.confirmation) return;
      event.preventDefault(); c.setPendingDraft(false, 'shared-route'); c.setDialog(null);
    }
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [active, c.store, c.setPendingDraft]);
  const previewResult = useMemo(() => {
    if (!draft) return null;
    const { initial, route } = draft;
    const original = initial.project.sharedRoutes?.find(r => r.id === route.id);
    try {
      const request = { routeId: route.id, existing: !!original, route, revision: initial.revision, epoch: initial.epoch };
      editSharedRoute(initial.project, request);
      const checked = validateSharedRoutes([route], initial.project.field)![0], compiled = compileRoute(checked);
      return { route: checked, length: routeLength(checked), samples: Array.from({ length: checked.closed ? 16 : 17 }, (_, i) => ({ count: compiled.length * i / 16, point: compiled.atDistance(compiled.length * i / 16) })), error: '' };
    } catch (e) { return { route: undefined, length: 0, samples: [], error: (e as Error).message }; }
  }, [draft?.route, draft?.initial]);
  if (!active || !draft || !previewResult) return null;
  const preview = previewResult;
  const { initial, route, row, stroke, capture, gesture } = draft;
  const routes = initial.project.sharedRoutes ?? [];
  function setter<K extends keyof Draft>(key: K) {
    return (value: SetStateAction<Draft[K]>) => setDraft(old => old && { ...old, [key]: typeof value === 'function' ? (value as (previous: Draft[K]) => Draft[K])(old[key]) : value });
  }
  const setRoute = setter('route'), setRow = setter('row'), setStroke = setter('stroke'), setCapture = setter('capture'),
    setCurved = setter('curved'), setSourceMode = setter('sourceMode'), setTolerance = setter('tolerance'), setCoordinates = setter('coordinates'),
    setMessage = setter('message'), setGesture = setter('gesture'), setDeleting = setter('deleting'), setSnapHandles = setter('snapHandles');
  const original = routes.find(r => r.id === route.id), changed = !original || JSON.stringify(original) !== JSON.stringify(route), pending = changed || !!stroke.length;
  const stale = c.store.getState().project.revision !== initial.revision || c.projectEpoch !== initial.epoch;

  function close() { c.setPendingDraft(false, 'shared-route'); c.setDialog(null); }
  function change(next: SharedRoute) { setRoute(next); setMessage(''); setDeleting(false); }
  function reset(next: SharedRoute) { change(structuredClone(next)); setRow(next.segments[0].id); setStroke([]); setCapture(null); }
  function attempt(action: () => void) { try { action(); setMessage(''); } catch (e) { setMessage((e as Error).message); } }
  function save(remove = false) {
    if (stale || gesture || !remove && (preview.error || !changed || stroke.length > 0 || capture)) return;
    c.setPendingDraft(false, 'shared-route');
    const ok = c.dispatch('routes.save', { routeId: route.id, existing: !!original, route: remove ? null : route, revision: initial.revision, epoch: initial.epoch });
    if (ok !== true) { c.setPendingDraft(pending, 'shared-route'); setMessage(c.store.getState().ui.toast || 'Cancel and reopen to review current routes.'); }
  }
  function closure(closed: boolean) {
    if (!closed) { change({ ...route, closed: false }); return; }
    const end = route.segments.at(-1)!.to;
    const next = { ...route, closed: true, segments: end.x === route.start.x && end.y === route.start.y ? route.segments : [...route.segments, { id: crypto.randomUUID(), kind: 'line' as const, to: { ...route.start } }] };
    if (next.segments.length > 32) { setMessage('Closing needs another segment. Use at most 32 segments.'); return; }
    change(next);
  }
  const selected = route.segments.find(s => s.id === row) ?? route.segments[0], index = route.segments.indexOf(selected);
  const handles: TravelHandle[] = [
    { id: 'route-start', rowId: route.segments[0].id, kind: 'start', point: route.start, label: route.closed ? 'Route seam' : 'Route start' },
    ...route.segments.flatMap((s, i): TravelHandle[] => [
      ...(s.kind === 'cubic' ? [{ id: `${s.id}-1`, rowId: s.id, kind: 'control1' as const, point: s.control1, label: `Segment ${i + 1} control 1` }, { id: `${s.id}-2`, rowId: s.id, kind: 'control2' as const, point: s.control2, label: `Segment ${i + 1} control 2` }] : []),
      ...(!route.closed || i < route.segments.length - 1 ? [{ id: `${s.id}-arrival`, rowId: s.id, kind: 'arrival' as const, point: s.to, label: `Segment ${i + 1} end` }] : []),
    ]),
  ];
  const field: TravelPreview = {
    project: initial.project, positions: c.activeSet.positions, performerId: '',
    from: preview.route?.start ?? route.start, to: preview.route?.segments.at(-1)!.to ?? route.segments.at(-1)!.to,
    path: preview.route ? routePath(preview.route) : undefined, original: original ? routePath(original) : undefined, originalFrom: original?.start,
    counts: route.segments.length, transition: 'linear', handles: preview.error || stale ? [] : handles,
    selectedRow: selected.id, onSelectRow: id => { if (!gesture && !capture) setRow(id); },
    onHandle: (h, point) => attempt(() => { const next = moveRoutePoint(route, h.rowId, h.kind, point); validateSharedRoutes([next], initial.project.field); change(next); }),
    capture: preview.error || stale ? null : capture, stroke, onStroke: setStroke, onCancelCapture: () => { setStroke([]); setCapture(null); },
    onError: setMessage, onGesture: setGesture, label: 'Editable shared route field', routeMode: true, routeClosed: route.closed,
    samples: preview.samples, snapHandles: draft.snapHandles, onApply: () => save(), onCancel: close,
  };
  return { ...draft, routes, original, changed, pending, stale, preview, selected, index, field: preview.route ? field : undefined,
    close, change, reset, attempt, save, closure, setRow, setStroke, setCapture, setCurved, setSourceMode, setTolerance, setCoordinates, setMessage, setDeleting, setSnapHandles };
}
export type SharedRoutesSession = NonNullable<ReturnType<typeof useSharedRoutes>>;
