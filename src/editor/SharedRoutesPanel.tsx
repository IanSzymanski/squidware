import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import { compileRoute, reverseRoute, routeLength, routePath, routeSeam, validateSharedRoutes } from '../sharedRoutes';
import type { Point, SharedRoute } from '../types';
import { HelpButton } from './ControlHelp';
import { DRAW_LIMIT, type TravelHandle } from './pathAuthoring';
import { editSharedRoute, fitSharedRoute, moveRoutePoint, newSharedRoute, splitRouteSegment } from './routeEditing';
import { TravelCanvas } from './TravelCanvas';
import type { EditorController } from './useEditorController';
import './paths.css';

export function SharedRoutesPanel({ controller: c }: { controller: EditorController }) {
  const [initial] = useState(() => ({ project: c.project, revision: c.store.getState().project.revision, epoch: c.projectEpoch }));
  const routes = initial.project.sharedRoutes ?? [];
  const [route, setRoute] = useState<SharedRoute>(() => structuredClone(routes[0] ?? newSharedRoute(routes, initial.project.field)));
  const [row, setRow] = useState(route.segments[0].id), [stroke, setStroke] = useState<Point[]>([]);
  const [capture, setCapture] = useState<'stroke' | 'anchors' | null>(null), [curved, setCurved] = useState(true);
  const [sourceMode, setSourceMode] = useState<'stroke' | 'anchors'>('stroke');
  const [tolerance, setTolerance] = useState('0.15'), [coordinates, setCoordinates] = useState(['50', '25']);
  const [message, setMessage] = useState(''), [gesture, setGesture] = useState(false), [deleting, setDeleting] = useState(false);
  const original = routes.find(r => r.id === route.id), changed = !original || JSON.stringify(original) !== JSON.stringify(route), pending = changed || !!stroke.length;
  const stale = c.store.getState().project.revision !== initial.revision || c.projectEpoch !== initial.epoch;
  const preview = useMemo(() => {
    try {
      const request = { routeId: route.id, existing: !!original, route, revision: initial.revision, epoch: initial.epoch };
      editSharedRoute(initial.project, request);
      const checked = validateSharedRoutes([route], initial.project.field)![0], compiled = compileRoute(checked);
      return { route: checked, length: routeLength(checked), samples: Array.from({ length: checked.closed ? 16 : 17 }, (_, i) => ({ count: compiled.length * i / 16, point: compiled.atDistance(compiled.length * i / 16) })), error: '' };
    } catch (e) { return { route: undefined, length: 0, samples: [], error: (e as Error).message }; }
  }, [route, initial, original]);
  useEffect(() => { c.setPendingDraft(pending, 'shared-route'); return () => c.setPendingDraft(false, 'shared-route'); }, [pending, c.setPendingDraft]);
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
  const numeric = (label: string, point: Point, update: (point: Point) => void) => <div className="route-coordinates" key={label}>{(['x', 'y'] as const).map(axis => <label className="form-label" key={axis}>{label} {axis.toUpperCase()} · yd<input aria-label={`${label} ${axis.toUpperCase()}`} type="number" step="0.1" value={Number.isFinite(point[axis]) ? point[axis] : ''} onChange={e => update({ ...point, [axis]: e.target.value.trim() ? Number(e.target.value) : NaN })} /></label>)}</div>;
  return <Modal title="Shared routes" wide className="path-panel shared-routes-panel" onClose={close}>
    <div className="path-fields">
      <p className="modal-intro">Draw reusable route geometry for this production. Routes have no performer assignment or show counts. Apply saves geometry; performer movement stays as reviewed in its own editor.</p>
      <div className="schedule-actions">
        <label className="form-label">Saved route<select aria-label="Saved route" value={original ? route.id : ''} disabled={pending || gesture || !!capture} onChange={e => reset(routes.find(r => r.id === e.target.value)!)}>{!original && <option value="">New route</option>}{routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <HelpButton title="New shared route" className="button subtle" disabled={pending || gesture || !!capture || routes.length >= 64} disabledReason="Apply or cancel the current draft first. A production supports 64 routes." onClick={() => reset(newSharedRoute(routes, initial.project.field))}>New route</HelpButton>
      </div>
      <label className="form-label">Route name<input aria-label="Route name" maxLength={80} value={route.name} onChange={e => change({ ...route, name: e.target.value })} /></label>
      <label className="route-closed"><input aria-label="Closed shared route" type="checkbox" checked={route.closed} disabled={gesture || !!stroke.length} onChange={e => closure(e.target.checked)} />Closed route · add a closing segment to the start seam</label>
      <div className="schedule-actions">
        <HelpButton title="Reverse shared route" className="button subtle" disabled={gesture || !!stroke.length || !!capture} onClick={() => { const next = reverseRoute(route); change(next); setRow(next.segments[0].id); }}>Reverse direction</HelpButton>
        <HelpButton title="Draw shared route stroke" className="button subtle" active={capture === 'stroke'} disabled={gesture || !!stroke.length && sourceMode !== 'stroke'} onClick={() => { setCapture(capture === 'stroke' ? null : 'stroke'); setSourceMode('stroke'); }}>Draw stroke</HelpButton>
        <HelpButton title="Place shared route anchors" className="button subtle" active={capture === 'anchors'} disabled={gesture || !!stroke.length && sourceMode !== 'anchors'} onClick={() => { setCapture(capture === 'anchors' ? null : 'anchors'); setSourceMode('anchors'); }}>Place anchors</HelpButton>
      </div>
      {(capture || stroke.length > 0) && <div className="draw-travel">
        <p className="microcopy">Fit replaces the whole route. Open endpoints are free. Closed strokes attach to their start within the tolerance budget; placed anchors add an explicit closing chord. Cubic fits initially follow straight chords, preserving intentional corners.</p>
        <div className="schedule-timing"><label className="form-label">Fit tolerance · yd<input aria-label="Route fit tolerance" type="number" min="0.01" max="1" step="0.01" value={tolerance} onChange={e => setTolerance(e.target.value)} /></label>
          <label className="form-label">Fitted segments<select aria-label="Route fitted geometry" value={curved ? 'cubic' : 'line'} onChange={e => setCurved(e.target.value === 'cubic')}><option value="cubic">Editable cubic chords</option><option value="line">Straight lines</option></select></label></div>
        {capture === 'anchors' && <><div className="route-coordinates">{coordinates.map((value, i) => <label className="form-label" key={i}>Anchor {i ? 'Y' : 'X'} · yd<input aria-label={`Route anchor ${i ? 'Y' : 'X'}`} type="number" step="0.1" value={value} onChange={e => setCoordinates(old => old.map((v, j) => i === j ? e.target.value : v))} /></label>)}</div>
          <HelpButton title="Add numeric route anchor" className="button subtle" disabled={gesture || stroke.length >= DRAW_LIMIT} onClick={() => attempt(() => { if (coordinates.some(v => !v.trim() || !Number.isFinite(Number(v)))) throw Error('Enter finite anchor coordinates.'); setStroke(old => [...old, { x: Number(coordinates[0]), y: Number(coordinates[1]) }]); })}>Add anchor</HelpButton></>}
        <p role="status" aria-label="Route captured points">{stroke.length} captured points · maximum {DRAW_LIMIT}</p>
        <div className="schedule-actions"><HelpButton title="Fit shared route" className="button primary" disabled={gesture || stroke.length < 2} onClick={() => attempt(() => { const next = fitSharedRoute(route, stroke, Number(tolerance), curved, sourceMode === 'anchors', initial.project.field); change(next); setRow(next.segments[0].id); setStroke([]); setCapture(null); })}>Fit route</HelpButton>
          <HelpButton title="Discard route capture" className="button subtle" disabled={gesture} onClick={() => { setStroke([]); setCapture(null); setMessage(''); }}>Discard capture</HelpButton></div>
      </div>}
      <label className="form-label">Selected segment<select aria-label="Route segment" value={selected.id} disabled={gesture} onChange={e => setRow(e.target.value)}>{route.segments.map((s, i) => <option value={s.id} key={s.id}>{i + 1} · {s.kind}</option>)}</select></label>
      <div className="schedule-actions"><HelpButton title="Split route segment" description="Insert an anchor at the parameter midpoint, preserving the exact curve." className="button subtle" disabled={gesture || route.segments.length >= 32 || !!capture} onClick={() => attempt(() => change(splitRouteSegment(route, index)))}>Split segment</HelpButton>
        <HelpButton title="Remove route segment" description="Remove this segment. The next segment begins at the previous anchor; its geometry changes. The closing segment is retained." className="button subtle" disabled={gesture || route.segments.length <= 1 || !!capture || route.closed && index === route.segments.length - 1} onClick={() => { const segments = route.segments.filter(s => s.id !== selected.id); change({ ...route, segments }); setRow(segments[Math.min(index, segments.length - 1)].id); }}>Remove segment</HelpButton>
        <HelpButton title="Toggle route segment curve" className="button subtle" disabled={gesture || !!capture} onClick={() => {
          const from = index ? route.segments[index - 1].to : route.start;
          change({ ...route, segments: route.segments.map(s => s.id !== selected.id ? s : s.kind === 'cubic' ? { id: s.id, kind: 'line', to: s.to } : { ...s, kind: 'cubic', control1: { x: from.x + (s.to.x - from.x) / 3, y: from.y + (s.to.y - from.y) / 3 }, control2: { x: from.x + (s.to.x - from.x) * 2 / 3, y: from.y + (s.to.y - from.y) * 2 / 3 } }) });
        }}>{selected.kind === 'line' ? 'Add cubic controls' : 'Make straight'}</HelpButton></div>
      {numeric(route.closed ? 'Seam' : 'Start', route.start, point => change(moveRoutePoint(route, '', 'start', point)))}
      {!(route.closed && index === route.segments.length - 1) && numeric('Segment end', selected.to, point => change(moveRoutePoint(route, selected.id, 'arrival', point)))}
      {selected.kind === 'cubic' && <>{numeric('Control 1', selected.control1, point => change(moveRoutePoint(route, selected.id, 'control1', point)))}{numeric('Control 2', selected.control2, point => change(moveRoutePoint(route, selected.id, 'control2', point)))}</>}
      {preview.route && <>
        <TravelCanvas project={initial.project} positions={c.activeSet.positions} performerId="" from={preview.route.start} to={preview.route.segments.at(-1)!.to} path={routePath(preview.route)} original={original ? routePath(original) : undefined} originalFrom={original?.start} counts={route.segments.length} transition="linear" handles={handles} selectedRow={selected.id} onSelectRow={setRow}
          onHandle={(h, p) => attempt(() => { const next = moveRoutePoint(route, h.rowId, h.kind, p); validateSharedRoutes([next], initial.project.field); change(next); })} capture={capture} stroke={stroke} onStroke={setStroke} onCancelCapture={() => { setStroke([]); setCapture(null); }} onError={setMessage} onGesture={setGesture}
          label="Editable shared route field" routeMode routeClosed={route.closed} samples={preview.samples} />
        <p role="status" aria-label="Route geometry summary">{route.closed ? 'Closed' : 'Open'} · {route.segments.length} segments · {preview.length.toFixed(3)} yd · {routeSeam(route)}. Distance dots use the serialized route. Self-crossings are permitted; routes have no movement or clearance analysis until assigned.</p>
      </>}
      <p className="microcopy">Anchor edits translate adjacent controls. Seam edits move both closing endpoints. Tangents may form corners; closure does not promise smooth speed. Apply records one undo action. Cancel leaves the production unchanged.</p>
      {original && <HelpButton title={deleting ? 'Confirm delete shared route' : 'Delete shared route'} className="button subtle" disabled={gesture || stale || pending || !!capture} onClick={() => deleting ? save(true) : setDeleting(true)}>{deleting ? `Confirm delete ${original.name} · one undo` : 'Delete saved route…'}</HelpButton>}
    </div>
    <div className="modal-actions">{(preview.error || stale || message) && <p className="field-error route-error" role="alert">{stale ? 'The production changed. Copy your draft, then cancel and reopen Shared routes.' : message || preview.error}</p>}<HelpButton title="Cancel shared routes" className="button subtle" onClick={close}>Cancel</HelpButton><HelpButton title="Apply shared route" className="button primary" disabled={!changed || !!preview.error || stale || gesture || !!stroke.length || !!capture} disabledReason={preview.error || 'Change valid geometry and finish capture first.'} onClick={() => save()}>Apply route · one undo</HelpButton></div>
  </Modal>;
}
