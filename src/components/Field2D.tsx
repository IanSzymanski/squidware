import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { Point, Project } from '../types';
import { coordinateDescription } from '../domain';
import { FieldReadout } from './FieldReadout';
import { FIELD_KEYS, nextFieldFocus } from './fieldKeyboard';
import type { FieldKey } from './fieldKeyboard';
import './stages.css';

interface DrawingProps {
  project: Project;
  positions: Record<string, Point>;
  previousPositions?: Record<string, Point>;
  selectedIds?: string[];
  showLabels?: boolean;
  showPaths?: boolean;
  showGrid?: boolean;
  coordinateDecimals?: 0 | 1 | 2;
  readoutId?: string;
  focusedId?: string | null;
  keyboardHelpId?: string;
  keyboardFocusId?: string | null;
}

/** SVG children shared by the interactive field and exported field diagrams. */
export function FieldDrawing({ project, positions, previousPositions, selectedIds = [], showLabels = true, showPaths = false, showGrid = false, readoutId, focusedId, keyboardHelpId, keyboardFocusId, coordinateDecimals = 2 }: DrawingProps) {
  const { width, height, preset } = project.field;
  const selected = new Set(selectedIds);
  const colors = new Map(project.sections.map(section => [section.id, section.color]));
  const sectionNames = new Map(project.sections.map(section => [section.id, section.name]));
  const hashInset = preset === 'college' ? 20 : height / 3;
  const yardLines = Array.from({ length: Math.floor(width / 5) + 1 }, (_, index) => index * 5);
  const hashes = Array.from({ length: Math.floor(width) - 1 }, (_, index) => index + 1).filter(x => x % 5 !== 0);
  return <>
    <rect x={-2} y={-2} width={width + 4} height={height + 4} rx="0.5" fill="#273a34" stroke="#46574c" strokeWidth="0.12" />
    <rect width={width} height={height} fill="#233c31" />
    {yardLines.filter((_, i) => i % 2 === 0).map(x => <rect key={`stripe-${x}`} x={x} width={Math.min(5, width - x)} height={height} fill="#294438" opacity="0.5" />)}
    {showGrid && <g stroke="#a3c0a4" strokeWidth="0.045" opacity="0.2">
      {Array.from({ length: Math.ceil(width / 1.25) }, (_, i) => <line key={`gx-${i}`} x1={i * 1.25} x2={i * 1.25} y1={0} y2={height} />)}
      {Array.from({ length: Math.ceil(height / 1.25) }, (_, i) => <line key={`gy-${i}`} x1={0} x2={width} y1={i * 1.25} y2={i * 1.25} />)}
    </g>}
    <g stroke="#ccdcc9" opacity="0.5" strokeWidth="0.14">
      {yardLines.map(x => <line key={`yard-${x}`} x1={x} x2={x} y1={0} y2={height} opacity={x % 10 === 0 ? 1 : 0.6} />)}
      <rect width={width} height={height} fill="none" strokeWidth="0.27" opacity="1" />
      {hashes.map(x => <g key={`hash-${x}`}>
        <line x1={x} x2={x} y1={0} y2={0.75} />
        <line x1={x} x2={x} y1={height - 0.75} y2={height} />
        <line x1={x} x2={x} y1={hashInset - 0.3} y2={hashInset + 0.3} />
        <line x1={x} x2={x} y1={height - hashInset - 0.3} y2={height - hashInset + 0.3} />
      </g>)}
    </g>
    <g fill="#d9e0c7" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="2.5" opacity="0.55">
      {yardLines.filter(x => x > 0 && x < width && x % 10 === 0).map(x => {
        const label = Math.min(x, width - x);
        return <g key={`number-${x}`}>
          <text x={x} y={height - 4.2} letterSpacing="0.15">{label}</text>
          <text x={x} y={-6.3} transform={`rotate(180 ${x} 0)`} letterSpacing="0.15">{label}</text>
        </g>;
      })}
    </g>
    <g fill="#b4c5b4" opacity="0.6" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="600" fontSize="0.9" letterSpacing="0.3">
      <text x={width / 2} y={-4.2}>BACK SIDELINE</text>
      <text x={width / 2} y={height + 5.2}>FRONT SIDELINE</text>
    </g>
    {showPaths && previousPositions && <g fill="none" strokeWidth="0.13" strokeDasharray="0.7 0.5" opacity="0.65" pointerEvents="none">
      {project.performers.map(performer => {
        const from = previousPositions[performer.id];
        const to = positions[performer.id];
        if (!from || !to) return null;
        return <g key={`path-${performer.id}`} stroke={colors.get(performer.sectionId) ?? '#b9ed85'}>
          <circle cx={from.x} cy={from.y} r="0.34" strokeDasharray="none" />
          <path d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`} />
        </g>;
      })}
    </g>}
    {project.performers.map(performer => {
      const point = positions[performer.id];
      if (!point) return null;
      const isSelected = selected.has(performer.id);
      const color = colors.get(performer.sectionId) ?? '#b9ed85';
      const details = [performer.label, performer.name, sectionNames.get(performer.sectionId), coordinateDescription(point, project.field, coordinateDecimals)].filter(Boolean).join(' · ');
      return <g key={performer.id} data-performer-id={performer.id} tabIndex={readoutId ? focusedId === performer.id ? 0 : -1 : undefined} role={readoutId ? 'button' : undefined} aria-label={readoutId ? `${details}${isSelected ? ', selected' : ''}` : undefined} aria-describedby={keyboardHelpId} aria-pressed={readoutId ? isSelected : undefined} className={`field-performer${keyboardFocusId === performer.id ? ' field-performer--focused' : ''}`} transform={`translate(${point.x} ${point.y})`}>
        <title>{details}</title>
        <circle r="1.15" fill="transparent" />
        {readoutId && <rect className="field-focus-ring" x="-1.35" y="-1.35" width="2.7" height="2.7" rx="0.15" fill="none" stroke="#fff" strokeWidth="0.24" pointerEvents="none" />}
        {isSelected && <circle r="0.96" fill={`${color}22`} stroke="#ffffff" strokeWidth="0.16" />}
        <circle r="0.52" fill={color} stroke={isSelected ? '#fff' : '#142920'} strokeWidth="0.16" />
        <circle cx="-0.12" cy="-0.14" r="0.13" fill="#ffffff" opacity="0.3" pointerEvents="none" />
        {showLabels && <text x="0.83" y="0.34" fill={isSelected ? '#fff' : '#e0e9de'} stroke="#1c3026" strokeWidth="0.2" paintOrder="stroke" fontFamily="Inter, Arial, sans-serif" fontSize="1.05" fontWeight={isSelected ? 700 : 500} pointerEvents="none">{performer.label}</text>}
      </g>;
    })}
  </>;
}

interface Field2DProps extends DrawingProps {
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onMove: (updates: Record<string, Point>) => void;
  tool: 'select' | 'pan';
  showLabels: boolean;
  showPaths: boolean;
  showGrid: boolean;
  snap: boolean;
  zoom: number;
  onZoom: (zoom: number) => void;
  readOnly: boolean;
  fitVersion?: number;
  nudgeStep?: number; fastNudgeStep?: number; coordinateDecimals?: 0 | 1 | 2;
}

type Gesture =
  | { kind: 'pan'; startClient: Point; startPan: Point; scale: number }
  | { kind: 'marquee'; start: Point; current: Point; initialIds: string[] }
  | { kind: 'move'; start: Point; anchor: Point; originals: Record<string, Point>; updates: Record<string, Point>; moved: boolean };

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

function translatedGroup(originals: Record<string, Point>, delta: Point, width: number, height: number) {
  const points = Object.values(originals);
  if (!points.length) return {};
  const dx = clamp(delta.x, -Math.min(...points.map(point => point.x)), width - Math.max(...points.map(point => point.x)));
  const dy = clamp(delta.y, -Math.min(...points.map(point => point.y)), height - Math.max(...points.map(point => point.y)));
  return Object.fromEntries(Object.entries(originals).map(([id, point]) => [id, { x: point.x + dx, y: point.y + dy }]));
}

export function Field2D({ project, positions, previousPositions, selectedIds, onSelect, onMove, tool, showLabels, showPaths, showGrid, snap, zoom, onZoom, readOnly, fitVersion = 0, nudgeStep = .625, fastNudgeStep = 2.5, coordinateDecimals = 2 }: Field2DProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const readoutId = useId();
  const keyboardHelpId = useId();
  const fieldHasFocus = useRef(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const [rememberedFocus, setRememberedFocus] = useState<{ project: string; id: string } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [preview, setPreview] = useState<Record<string, Point>>({});
  const [marquee, setMarquee] = useState<{ start: Point; current: Point } | null>(null);
  const [moving, setMoving] = useState(false);
  const width = project.field.width;
  const height = project.field.height;
  const safeZoom = clamp(zoom, 0.6, 3);
  const viewWidth = (width + 14) / safeZoom;
  const viewHeight = (height + 16) / safeZoom;
  const viewport = `${width / 2 + pan.x - viewWidth / 2} ${height / 2 + pan.y - viewHeight / 2} ${viewWidth} ${viewHeight}`;
  const displayedPositions = { ...positions, ...preview };
  const focusedId = rememberedFocus?.project === project.id && positions[rememberedFocus.id]
    ? rememberedFocus.id : selectedIds.find(id => positions[id]) ?? project.performers[0]?.id ?? null;

  function focusPerformer(id: string | null) {
    if (!id) { svgRef.current?.focus({ preventScroll: true }); return; }
    setRememberedFocus({ project: project.id, id });
    const dot = [...(svgRef.current?.querySelectorAll<SVGGElement>('[data-performer-id]') ?? [])].find(node => node.dataset.performerId === id);
    dot?.focus({ preventScroll: true });
    const point = positions[id];
    if (point && (Math.abs(point.x - width / 2 - pan.x) > viewWidth / 2 - 2 || Math.abs(point.y - height / 2 - pan.y) > viewHeight / 2 - 2)) setPan({ x: point.x - width / 2, y: point.y - height / 2 });
  }
  useLayoutEffect(() => {
    if (fieldHasFocus.current && document.activeElement === document.body) focusPerformer(focusedId);
  }, [focusedId, project.id]);
  useEffect(() => {
    const keyboard = () => {
      const active = document.activeElement;
      const id = svgRef.current?.contains(active) ? active?.getAttribute('data-performer-id') : null;
      setKeyboardFocus(!!id);
      if (id) { fieldHasFocus.current = true; setRememberedFocus({ project: project.id, id }); }
      else fieldHasFocus.current = false;
    };
    const pointer = () => setKeyboardFocus(false);
    document.addEventListener('keyup', keyboard);
    document.addEventListener('pointerdown', pointer);
    window.addEventListener('blur', pointer);
    return () => { document.removeEventListener('keyup', keyboard); document.removeEventListener('pointerdown', pointer); window.removeEventListener('blur', pointer); };
  }, [project.id]);

  function pointAt(clientX: number, clientY: number): Point {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function wheel(event: WheelEvent) {
      event.preventDefault();
      const next = clamp(safeZoom * Math.exp(-event.deltaY * 0.0015), 0.6, 3);
      const cursor = pointAt(event.clientX, event.clientY);
      const ratio = safeZoom / next;
      setPan(old => ({ x: cursor.x - width / 2 - (cursor.x - width / 2 - old.x) * ratio, y: cursor.y - height / 2 - (cursor.y - height / 2 - old.y) * ratio }));
      onZoom(next);
    }
    svg.addEventListener('wheel', wheel, { passive: false });
    return () => svg.removeEventListener('wheel', wheel);
  }, [safeZoom, width, height, onZoom]);

  useEffect(() => {
    if (!gesture.current) return;
    gesture.current = null;
    setPreview({});
    setMarquee(null);
    setMoving(false);
  }, [positions, readOnly, project.id]);

  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [project.id, fitVersion]);

  function startGesture(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    const point = pointAt(event.clientX, event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === 'pan' || event.button === 1 || event.altKey) {
      gesture.current = { kind: 'pan', startClient: { x: event.clientX, y: event.clientY }, startPan: pan, scale: svgRef.current?.getScreenCTM()?.a || 1 };
      setMoving(true);
      return;
    }
    const id = (event.target as Element).closest('[data-performer-id]')?.getAttribute('data-performer-id');
    if (id && positions[id]) {
      focusPerformer(id);
      if (event.shiftKey && selectedIds.includes(id)) {
        onSelect(selectedIds.filter(selectedId => selectedId !== id));
        return;
      }
      const ids = selectedIds.includes(id) ? selectedIds : event.shiftKey ? [...selectedIds, id] : [id];
      onSelect(ids);
      if (readOnly) return;
      const originals = Object.fromEntries(ids.filter(selectedId => positions[selectedId]).map(selectedId => [selectedId, { ...positions[selectedId] }]));
      gesture.current = { kind: 'move', start: point, anchor: positions[id], originals, updates: {}, moved: false };
    } else {
      gesture.current = { kind: 'marquee', start: point, current: point, initialIds: event.shiftKey ? selectedIds : [] };
      setMarquee({ start: point, current: point });
    }
  }

  function continueGesture(event: ReactPointerEvent<SVGSVGElement>) {
    const current = gesture.current;
    if (!current) return;
    if (current.kind === 'pan') {
      setPan({ x: current.startPan.x - (event.clientX - current.startClient.x) / current.scale, y: current.startPan.y - (event.clientY - current.startClient.y) / current.scale });
      return;
    }
    const point = pointAt(event.clientX, event.clientY);
    if (current.kind === 'marquee') {
      current.current = point;
      setMarquee({ start: current.start, current: point });
    } else {
      let dx = point.x - current.start.x;
      let dy = point.y - current.start.y;
      if (Math.abs(dx) + Math.abs(dy) < 0.15 && !current.moved) return;
      current.moved = true;
      if (snap) {
        dx = Math.round((current.anchor.x + dx) / 0.625) * 0.625 - current.anchor.x;
        dy = Math.round((current.anchor.y + dy) / 0.625) * 0.625 - current.anchor.y;
      }
      current.updates = translatedGroup(current.originals, { x: dx, y: dy }, width, height);
      setPreview(current.updates);
      setMoving(true);
    }
  }

  function finishGesture(event: ReactPointerEvent<SVGSVGElement>, cancelled = false) {
    const current = gesture.current;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (current && !cancelled) {
      if (current.kind === 'move' && current.moved && Object.keys(current.updates).length) onMove(current.updates);
      if (current.kind === 'marquee') {
        const left = Math.min(current.start.x, current.current.x);
        const right = Math.max(current.start.x, current.current.x);
        const top = Math.min(current.start.y, current.current.y);
        const bottom = Math.max(current.start.y, current.current.y);
        const inside = Object.entries(positions).filter(([, point]) => point.x >= left && point.x <= right && point.y >= top && point.y <= bottom).map(([id]) => id);
        onSelect([...new Set([...current.initialIds, ...inside])]);
      }
    }
    setPreview({});
    setMarquee(null);
    setMoving(false);
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      gesture.current = null;
      setPreview({});
      setMarquee(null);
      setMoving(false);
      onSelect([]);
      return;
    }
    const targetId = (event.target as Element).closest('[data-performer-id]')?.getAttribute('data-performer-id') ?? focusedId;
    if (targetId && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      event.stopPropagation();
      onSelect(event.shiftKey ? selectedIds.includes(targetId) ? selectedIds.filter(id => id !== targetId) : [...selectedIds, targetId] : [targetId]);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      event.stopPropagation();
      onSelect(project.performers.map(performer => performer.id));
      return;
    }
    if (FIELD_KEYS.includes(event.key as FieldKey) && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.altKey) {
        focusPerformer(nextFieldFocus(project.performers.map(person => person.id), positions, targetId, event.key as FieldKey));
        return;
      }
      if (!event.key.startsWith('Arrow') || !selectedIds.length) return;
      if (readOnly) return;
      const distance = event.shiftKey ? fastNudgeStep : nudgeStep;
      const originals = Object.fromEntries(selectedIds.filter(id => positions[id]).map(id => [id, positions[id]]));
      onMove(translatedGroup(originals, { x: event.key === 'ArrowLeft' ? -distance : event.key === 'ArrowRight' ? distance : 0, y: event.key === 'ArrowUp' ? -distance : event.key === 'ArrowDown' ? distance : 0 }, width, height));
    }
  }

  return <div className={`field-stage${readOnly ? ' field-stage--readonly' : ''}${tool === 'pan' ? ' field-stage--pan' : ''}${moving ? ' field-stage--moving' : ''}`}>
    <svg ref={svgRef} className="field-stage__svg" viewBox={`${width / 2 + pan.x - viewWidth / 2} ${height / 2 + pan.y - viewHeight / 2} ${viewWidth} ${viewHeight}`} tabIndex={focusedId ? -1 : 0} role="group" aria-label={readOnly ? 'Read-only drill preview. Go to a set to edit positions.' : 'Interactive drill field. Drag performers to move; drag empty space to select.'} aria-describedby={`${keyboardHelpId}${readOnly ? ' field-preview-message' : ''}`} onFocus={event => { fieldHasFocus.current = true; const id = (event.target as Element).closest('[data-performer-id]')?.getAttribute('data-performer-id'); if (id) setRememberedFocus({ project: project.id, id }); }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) fieldHasFocus.current = false; }} onPointerDown={startGesture} onPointerMove={continueGesture} onPointerUp={finishGesture} onPointerCancel={event => finishGesture(event, true)} onLostPointerCapture={event => { if (gesture.current) finishGesture(event, true); }} onKeyDown={onKeyDown} onDoubleClick={event => { if (!(event.target as Element).closest('[data-performer-id]')) { setPan({ x: 0, y: 0 }); onZoom(1); } }}>
      <FieldDrawing project={project} positions={displayedPositions} previousPositions={previousPositions} selectedIds={selectedIds} showLabels={showLabels} showPaths={showPaths} showGrid={showGrid} coordinateDecimals={coordinateDecimals} readoutId={readoutId} focusedId={focusedId} keyboardHelpId={keyboardHelpId} keyboardFocusId={keyboardFocus ? focusedId : null} />
      {marquee && <rect x={Math.min(marquee.start.x, marquee.current.x)} y={Math.min(marquee.start.y, marquee.current.y)} width={Math.abs(marquee.start.x - marquee.current.x)} height={Math.abs(marquee.start.y - marquee.current.y)} fill="#c5f47b18" stroke="#caf38a" strokeWidth="0.15" strokeDasharray="0.6 0.4" pointerEvents="none" />}
    </svg>
    <div id={keyboardHelpId} className="field-keyboard-help">Arrows: focus · Enter/Space: select · Shift+Enter/Space: add/remove · Alt+arrows: move selection · Shift+Alt: {fastNudgeStep} yd · Page Up/Down: roster · Home/End: first/last</div>
    <FieldReadout id={readoutId} svgRef={svgRef} project={project} positions={displayedPositions} selectedIds={selectedIds} coordinateDecimals={coordinateDecimals} viewport={viewport} readOnly={readOnly} keyboardFocusedId={keyboardFocus ? focusedId : null} />
    <div className="field-stage__corner"><span className="stage-status-light" /> {project.field.preset === 'college' ? 'NCAA' : 'HIGH SCHOOL'} FIELD <span className="field-stage__dimensions">{width} × {height.toFixed(1)} yd</span></div>
    <div className="field-stage__hint">{readOnly ? 'PLAYBACK PREVIEW' : tool === 'pan' ? 'Drag to pan' : 'Drag to select · Shift to add'}<span>Scroll to zoom · Double-click to fit</span></div>
    <div className="field-stage__orientation" aria-hidden="true"><span>↑</span> BACK</div>
  </div>;
}
