import { useLayoutEffect, useRef } from 'react';
import { FormattedNumberInput } from '../components/NumberField';
import { formatYards } from '../coordinates';
import { reverseRoute, routeSeam } from '../sharedRoutes';
import type { Point } from '../types';
import { HelpButton } from './ControlHelp';
import { DRAW_LIMIT } from './pathAuthoring';
import { fitSharedRoute, moveRoutePoint, newSharedRoute, splitRouteSegment } from './routeEditing';
import { TravelDetails } from './TravelCanvas';
import type { SharedRoutesSession } from './useSharedRoutes';
import './paths.css';

export function SharedRoutesPanel({ editor: e }: { editor: SharedRoutesSession }) {
  const { initial, route, stroke, capture, curved, sourceMode, tolerance, coordinates, message, gesture, deleting,
    routes, original, changed, pending, stale, preview, selected, index, close, change, reset, attempt, save, closure,
    setRow, setStroke, setCapture, setCurved, setSourceMode, setTolerance, setCoordinates, setMessage, setDeleting, setSnapHandles } = e;
  const region = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    region.current?.querySelector<HTMLElement>('[aria-label="Cancel shared routes"]')?.focus();
    return () => { requestAnimationFrame(() => { if (document.activeElement === document.body) document.querySelector<HTMLElement>('.field-container')?.focus(); }); };
  }, []);
  const numeric = (label: string, point: Point, update: (point: Point) => void) => <div className="route-coordinates" key={label}>{(['x', 'y'] as const).map(axis => <label className="form-label" key={axis}>{label} {axis.toUpperCase()} · yd<FormattedNumberInput aria-label={`${label} ${axis.toUpperCase()}`} step="0.1" value={point[axis]} onChange={text => update({ ...point, [axis]: text.trim() ? Number(text) : NaN })} /></label>)}</div>;
  return <section ref={region} aria-label="Shared routes" className="path-panel shared-routes-panel docked-path-editor"
    onKeyDown={event => { if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <div className="docked-path-heading"><h2>Shared routes</h2></div>

    <div className="docked-path-actions"><HelpButton pointerPassThrough title="Cancel shared routes" className="button subtle" onClick={close}>Cancel</HelpButton><HelpButton pointerPassThrough title="Apply shared route" className="button primary" disabled={!changed || !!preview.error || stale || gesture || !!stroke.length || !!capture} disabledReason={preview.error || 'Change valid geometry and finish capture first.'} onClick={() => save()}>Apply route · one undo</HelpButton></div>
    <div className="path-fields">
      {(preview.error || stale || message) && <p className="field-error route-error" role="alert">{stale ? 'The production changed. Copy your draft, then cancel and reopen Shared routes.' : message || preview.error}</p>}
      <p className="modal-intro">Draw reusable route geometry for this production. Routes have no performer assignment or show counts. Apply saves geometry; performer movement stays as reviewed in its own editor.</p>
      <div className="schedule-actions">
        <label className="form-label">Saved route<select aria-label="Saved route" value={original ? route.id : ''} disabled={pending || gesture || !!capture} onChange={e => reset(routes.find(r => r.id === e.target.value)!)}>{!original && <option value="">New route</option>}{routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <HelpButton pointerPassThrough title="New shared route" className="button subtle" disabled={pending || gesture || !!capture || routes.length >= 64} disabledReason="Apply or cancel the current draft first. A production supports 64 routes." onClick={() => reset(newSharedRoute(routes, initial.project.field))}>New route</HelpButton>
      </div>
      <label className="form-label">Route name<input aria-label="Route name" maxLength={80} value={route.name} onChange={e => change({ ...route, name: e.target.value })} /></label>
      <label className="route-closed"><input aria-label="Closed shared route" type="checkbox" checked={route.closed} disabled={gesture || !!stroke.length} onChange={e => closure(e.target.checked)} />Closed route · add a closing segment to the start seam</label>
      <div className="schedule-actions">
        <HelpButton pointerPassThrough title="Reverse shared route" className="button subtle" disabled={gesture || !!stroke.length || !!capture} onClick={() => { const next = reverseRoute(route); change(next); setRow(next.segments[0].id); }}>Reverse direction</HelpButton>
        <HelpButton pointerPassThrough title="Draw shared route stroke" className="button subtle" active={capture === 'stroke'} disabled={gesture || !!stroke.length && sourceMode !== 'stroke'} onClick={() => { setCapture(capture === 'stroke' ? null : 'stroke'); setSourceMode('stroke'); }}>Draw stroke</HelpButton>
        <HelpButton pointerPassThrough title="Place shared route anchors" className="button subtle" active={capture === 'anchors'} disabled={gesture || !!stroke.length && sourceMode !== 'anchors'} onClick={() => { setCapture(capture === 'anchors' ? null : 'anchors'); setSourceMode('anchors'); }}>Place anchors</HelpButton>
      </div>
      {(capture || stroke.length > 0) && <div className="draw-travel">
        <p className="microcopy">Fit replaces the whole route. Open endpoints are free. Closed strokes attach to their start within the tolerance budget; placed anchors add an explicit closing chord. Cubic fits initially follow straight chords, preserving intentional corners.</p>
        <div className="schedule-timing"><label className="form-label">Fit tolerance · yd<input aria-label="Route fit tolerance" type="number" min="0.01" max="1" step="0.01" value={tolerance} onChange={e => setTolerance(e.target.value)} /></label>
          <label className="form-label">Fitted segments<select aria-label="Route fitted geometry" value={curved ? 'cubic' : 'line'} onChange={e => setCurved(e.target.value === 'cubic')}><option value="cubic">Editable cubic chords</option><option value="line">Straight lines</option></select></label></div>
        {capture === 'anchors' && <><div className="route-coordinates">{coordinates.map((value, i) => <label className="form-label" key={i}>Anchor {i ? 'Y' : 'X'} · yd<input aria-label={`Route anchor ${i ? 'Y' : 'X'}`} type="number" step="0.1" value={value} onChange={e => setCoordinates(old => old.map((v, j) => i === j ? e.target.value : v))} /></label>)}</div>
          <HelpButton pointerPassThrough title="Add numeric route anchor" className="button subtle" disabled={gesture || stroke.length >= DRAW_LIMIT} onClick={() => attempt(() => { if (coordinates.some(v => !v.trim() || !Number.isFinite(Number(v)))) throw Error('Enter finite anchor coordinates.'); setStroke(old => [...old, { x: Number(coordinates[0]), y: Number(coordinates[1]) }]); })}>Add anchor</HelpButton></>}
        <p role="status" aria-label="Route captured points">{stroke.length} captured points · maximum {DRAW_LIMIT}</p>
        <div className="schedule-actions"><HelpButton pointerPassThrough title="Fit shared route" className="button primary" disabled={gesture || stroke.length < 2} onClick={() => attempt(() => { const next = fitSharedRoute(route, stroke, Number(tolerance), curved, sourceMode === 'anchors', initial.project.field); change(next); setRow(next.segments[0].id); setStroke([]); setCapture(null); })}>Fit route</HelpButton>
          <HelpButton pointerPassThrough title="Discard route capture" className="button subtle" disabled={gesture} onClick={() => { setStroke([]); setCapture(null); setMessage(''); }}>Discard capture</HelpButton></div>
      </div>}
      <label className="form-label">Selected segment<select aria-label="Route segment" value={selected.id} disabled={gesture} onChange={e => setRow(e.target.value)}>{route.segments.map((s, i) => <option value={s.id} key={s.id}>{i + 1} · {s.kind}</option>)}</select></label>
      <div className="schedule-actions"><HelpButton pointerPassThrough title="Split route segment" description="Insert an anchor at the parameter midpoint, preserving the exact curve." className="button subtle" disabled={gesture || route.segments.length >= 32 || !!capture} onClick={() => attempt(() => change(splitRouteSegment(route, index)))}>Split segment</HelpButton>
        <HelpButton pointerPassThrough title="Remove route segment" description="Remove this segment. The next segment begins at the previous anchor; its geometry changes. The closing segment is retained." className="button subtle" disabled={gesture || route.segments.length <= 1 || !!capture || route.closed && index === route.segments.length - 1} onClick={() => { const segments = route.segments.filter(s => s.id !== selected.id); change({ ...route, segments }); setRow(segments[Math.min(index, segments.length - 1)].id); }}>Remove segment</HelpButton>
        <HelpButton pointerPassThrough title="Toggle route segment curve" className="button subtle" disabled={gesture || !!capture} onClick={() => {
          const from = index ? route.segments[index - 1].to : route.start;
          change({ ...route, segments: route.segments.map(s => s.id !== selected.id ? s : s.kind === 'cubic' ? { id: s.id, kind: 'line', to: s.to } : { ...s, kind: 'cubic', control1: { x: from.x + (s.to.x - from.x) / 3, y: from.y + (s.to.y - from.y) / 3 }, control2: { x: from.x + (s.to.x - from.x) * 2 / 3, y: from.y + (s.to.y - from.y) * 2 / 3 } }) });
        }}>{selected.kind === 'line' ? 'Add cubic controls' : 'Make straight'}</HelpButton></div>
      {numeric(route.closed ? 'Seam' : 'Start', route.start, point => change(moveRoutePoint(route, '', 'start', point)))}
      {!(route.closed && index === route.segments.length - 1) && numeric('Segment end', selected.to, point => change(moveRoutePoint(route, selected.id, 'arrival', point)))}
      {selected.kind === 'cubic' && <>{numeric('Control 1', selected.control1, point => change(moveRoutePoint(route, selected.id, 'control1', point)))}{numeric('Control 2', selected.control2, point => change(moveRoutePoint(route, selected.id, 'control2', point)))}</>}
      {preview.route && <>
        <HelpButton pointerPassThrough title="Snap path handles" active={e.snapHandles} description="Snap route handle drags and arrow keys using the production's field snapping settings. Numeric entries remain exact." className="button subtle" onClick={() => setSnapHandles(!e.snapHandles)}>Snap handles {e.snapHandles ? 'on' : 'off'}</HelpButton>
        {e.field && <TravelDetails {...e.field} mainField />}
        <p role="status" aria-label="Route geometry summary">{route.closed ? 'Closed' : 'Open'} · {route.segments.length} segments · {formatYards(preview.length)} yd · {routeSeam(route)}. Distance dots use the serialized route. Self-crossings are permitted; routes have no movement or clearance analysis until assigned.</p>
      </>}
      <p className="microcopy">Anchor edits translate adjacent controls. Seam edits move both closing endpoints. Tangents may form corners; closure does not promise smooth speed. Apply records one undo action. Cancel leaves the production unchanged.</p>
      {original && <HelpButton pointerPassThrough title={deleting ? 'Confirm delete shared route' : 'Delete shared route'} className="button subtle" disabled={gesture || stale || pending || !!capture} onClick={() => deleting ? save(true) : setDeleting(true)}>{deleting ? `Confirm delete ${original.name} · one undo` : 'Delete saved route…'}</HelpButton>}
    </div>

  </section>;
}
