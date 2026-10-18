import { isNudgeKey, type NudgeKey } from '../editIncrements';
import { DEFAULT_SNAPPING, gridInterval, hashLines, moveSelection, snapDescription } from '../snapping';
import type { CoordinateOptions } from '../coordinates';
import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { Point, Project } from '../types';
import { selectionMembership } from '../selection';
import { coordinateDescription } from '../domain';
import { FieldReadout } from './FieldReadout';
import { FIELD_KEYS, nextFieldFocus } from './fieldKeyboard';
import type { FieldKey } from './fieldKeyboard';
import { cycleFieldHit, DEFAULT_FIELD_PRESENTATION, layoutFieldLabels, nearestFieldDots } from './fieldPresentation';
import type { FieldPresentation, HitCycle, ScreenBox } from './fieldPresentation';
import './stages.css';
import { NeighborDrawing } from './NeighborDrawing';
import { FormationHandles, type FieldFormationPreview } from './FormationHandles';
import { TransformHandles, type FieldTransformPreview } from './TransformHandles';
import { SpacingGuides, type FieldSpacingPreview } from './SpacingGuides';
import { CoordinateGuides, type FieldCoordinatePreview } from './CoordinateGuides';
import type { NeighborOverlay } from '../neighborPaths';
import { fieldViewPoint, fieldViewTransform, type FieldOrientation } from './fieldOrientation';

interface DrawingProps {
  orientation?: FieldOrientation;
  project: Project;
  positions: Record<string, Point>;
  neighbors?: NeighborOverlay[];
  selectedIds?: string[];
  showLabels?: boolean;
  showGrid?: boolean;
  coordinateFormat?: CoordinateOptions;
  readoutId?: string;
  focusedId?: string | null;
  keyboardHelpId?: string;
  keyboardFocusId?: string | null;
  presentation?: Partial<FieldPresentation>;
  screen?: { scale: number; bounds: ScreenBox };
}

export const StaticFieldMarkings = memo(function StaticFieldMarkings({ width, height, preset, showGrid, flipped = false, snapping = DEFAULT_SNAPPING }: Project['field'] & { showGrid: boolean; flipped?: boolean; snapping?: Project['snapping'] }) {
  const hashInset = preset === 'college' ? 20 : height / 3;
  const interval = snapping.target === 'grid' ? gridInterval(snapping) : 5;
  const gridY = snapping.target === 'grid' ? Array.from({ length: Math.floor(height / interval) + 1 }, (_, i) => i * interval) : hashLines({ width, height, preset });
  const yardLines = Array.from({ length: Math.floor(width / 5) + 1 }, (_, index) => index * 5);
  const hashes = Array.from({ length: Math.floor(width) - 1 }, (_, index) => index + 1).filter(x => x % 5 !== 0);
  return <g data-field-markings="true" aria-hidden="true">
    <rect x={-2} y={-2} width={width + 4} height={height + 4} rx="0.5" fill="#273a34" stroke="#46574c" strokeWidth="0.12" />
    <rect width={width} height={height} fill="#233c31" />
    {yardLines.filter((_, i) => i % 2 === 0).map(x => <rect key={`stripe-${x}`} x={x} width={Math.min(5, width - x)} height={height} fill="#294438" opacity="0.5" />)}
    {showGrid && <g stroke="#a3c0a4" strokeWidth="0.045" opacity="0.2">
      {Array.from({ length: Math.floor(width / interval) + 1 }, (_, i) => <line key={`gx-${i}`} x1={i * interval} x2={i * interval} y1={0} y2={height} />)}
      {gridY.map((y, i) => <line key={`gy-${i}`} x1={0} x2={width} y1={y} y2={y} />)}
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
      <text x={width / 2} y={-4.2} transform={flipped ? `rotate(180 ${width / 2} -4.2)` : undefined}>BACK SIDELINE</text>
      <text x={width / 2} y={height + 5.2} transform={flipped ? `rotate(180 ${width / 2} ${height + 5.2})` : undefined}>FRONT SIDELINE</text>
    </g>
  </g>;
});
StaticFieldMarkings.displayName = 'StaticFieldMarkings';

/** SVG children shared by the interactive field and exported field diagrams. */
export function FieldDrawing({ project, positions, neighbors, selectedIds = [], showLabels = true, showGrid = false, readoutId, focusedId, keyboardHelpId, keyboardFocusId, coordinateFormat, presentation, screen, orientation = 'audience-bottom' }: DrawingProps) {
  const { width, height, preset } = project.field;
  const selected = selectionMembership(selectedIds);
  const colors = new Map(project.sections.map(section => [section.id, section.color]));
  const sectionNames = new Map(project.sections.map(section => [section.id, section.name]));
  const display = { ...DEFAULT_FIELD_PRESENTATION, ...presentation };
  const scale = screen?.scale ?? 1;
  const radius = screen ? display.dotRadiusPx / scale : .52;
  const flipped = !!screen && orientation === 'audience-top';
  const viewPoint = (point: Point) => fieldViewPoint(point, project.field, flipped ? orientation : 'audience-bottom');
  // Measure the actual font once per roster/font change; use conservative fallback during SSR.
  const labelWidths = useMemo(() => {
    const context = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
    if (context) context.font = `700 ${display.labelSizePx}px Arial, sans-serif`;
    return new Map(project.performers.map(person => [person.id, context?.measureText(person.label).width ?? person.label.length * display.labelSizePx]));
  }, [project.performers, display.labelSizePx]);
  const labels = screen ? layoutFieldLabels(project.performers.flatMap(person => positions[person.id] ? [{
    id: person.id, x: viewPoint(positions[person.id]).x * scale, y: viewPoint(positions[person.id]).y * scale,
    labelWidth: labelWidths.get(person.id)!, selected: selected.has(person.id), focused: keyboardFocusId === person.id,
  }] : []), screen.bounds, { ...display, labelMode: showLabels ? display.labelMode : 'none' }) : null;
  return <>
    <StaticFieldMarkings width={width} height={height} preset={preset} snapping={project.snapping} showGrid={showGrid} flipped={flipped} />
    {neighbors && <NeighborDrawing overlays={neighbors} scale={scale} />}
    {project.performers.map(performer => {
      const point = positions[performer.id];
      if (!point) return null;
      const isSelected = selected.has(performer.id);
      const sectionColor = colors.get(performer.sectionId) ?? '#b9ed85';
      const color = !screen || display.colorMode === 'section' ? sectionColor : display.colorMode === 'custom' ? display.customColor : isSelected ? '#8dc8ff' : '#b3c5bd';
      const labelPoint = viewPoint(point);
      const details = [performer.label, performer.name, sectionNames.get(performer.sectionId), coordinateDescription(point, project.field, coordinateFormat)].filter(Boolean).join(' · ');
      const label = labels?.get(performer.id);
      const focusRadius = screen ? (display.dotRadiusPx + 5) / scale : 1.35;
      return <g key={performer.id} data-performer-id={performer.id} tabIndex={readoutId ? focusedId === performer.id ? 0 : -1 : undefined} role={readoutId ? 'button' : undefined} aria-label={readoutId ? `${details}${isSelected ? ', selected' : ''}` : undefined} aria-describedby={keyboardHelpId} aria-pressed={readoutId ? isSelected : undefined} className={`field-performer${keyboardFocusId === performer.id ? ' field-performer--focused' : ''}`} transform={`translate(${point.x} ${point.y})`}>
        <title>{details}</title>
        <g transform={flipped ? 'rotate(180)' : undefined}>
        <circle className="field-hit-area" r={screen ? display.pointerRadiusPx / scale : 1.15} fill="transparent" />
        {readoutId && <rect className="field-focus-ring" x={-focusRadius} y={-focusRadius} width={focusRadius * 2} height={focusRadius * 2} rx={screen ? 1 / scale : .15} fill="none" stroke="#fff" strokeWidth={screen ? 2 / scale : .24} pointerEvents="none" />}
        {isSelected && <circle r={screen ? (display.dotRadiusPx + 3) / scale : .96} fill={`${color}22`} stroke="#ffffff" strokeWidth={screen ? 1.5 / scale : .16} pointerEvents="none" />}
        <circle className="field-dot" r={radius} fill={color} stroke={isSelected ? '#fff' : '#142920'} strokeWidth={screen ? 1 / scale : .16} />
        <circle cx={-radius * .23} cy={-radius * .27} r={radius / 4} fill="#ffffff" opacity="0.3" pointerEvents="none" />
        {showLabels && (!screen || label) && <text data-performer-label={performer.id} x={label ? (label.left + 2) / scale - labelPoint.x : .83} y={label ? (label.top + 2 + display.labelSizePx * .8) / scale - labelPoint.y : .34} fill={isSelected ? '#fff' : '#e0e9de'} stroke="#1c3026" strokeWidth={screen ? 3 / scale : .2} paintOrder="stroke" fontFamily={screen ? 'Arial, sans-serif' : 'Inter, Arial, sans-serif'} fontSize={screen ? display.labelSizePx / scale : 1.05} fontWeight={isSelected ? 700 : 500} pointerEvents="none">{performer.label}</text>}
        </g>
      </g>;
    })}
  </>;
}

interface Field2DProps extends DrawingProps {
  transformPreview?: FieldTransformPreview;
  spacingPreview?: FieldSpacingPreview;
  coordinatePreview?: FieldCoordinatePreview;
  formationPreview?: FieldFormationPreview;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onMove: (updates: Record<string, Point>) => void;
  tool: 'select' | 'pan';
  showLabels: boolean;
  showGrid: boolean;
  snap: boolean;
  zoom: number;
  onZoom: (zoom: number) => void;
  readOnly: boolean;
  fitVersion?: number;
  onNudge: (key: NudgeKey, fast: boolean) => void; nudgeHelp: string; coordinateFormat?: CoordinateOptions;
}

type Gesture =
  | { kind: 'pan'; startClient: Point; startPan: Point; scale: number }
  | { kind: 'marquee'; start: Point; current: Point; initialIds: string[] }
  | { kind: 'move'; start: Point; anchorId: string; originals: Record<string, Point>; updates: Record<string, Point>; moved: boolean };

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export function Field2D({ project, positions, neighbors, selectedIds, onSelect, onMove, tool, showLabels, showGrid, snap, zoom, onZoom, readOnly, fitVersion = 0, onNudge, nudgeHelp, coordinateFormat, presentation, transformPreview, formationPreview, spacingPreview, coordinatePreview, orientation = 'audience-bottom' }: Field2DProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const geometryRef = useRef<SVGGElement>(null);
  const readoutId = useId();
  const keyboardHelpId = useId();
  const fieldHasFocus = useRef(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const [rememberedFocus, setRememberedFocus] = useState<{ project: string; id: string } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const hitCycle = useRef<HitCycle | null>(null);
  const display = { ...DEFAULT_FIELD_PRESENTATION, ...presentation };
  const [screen, setScreen] = useState<DrawingProps['screen']>();
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

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const matrix = svg.getScreenCTM(); if (!matrix) return;
      const scale = Math.hypot(matrix.a, matrix.b); if (!scale) return;
      const rect = svg.getBoundingClientRect();
      const topLeft = new DOMPoint(rect.left, rect.top).matrixTransform(matrix.inverse());
      const bottomRight = new DOMPoint(rect.right, rect.bottom).matrixTransform(matrix.inverse());
      const next = { scale, bounds: { left: topLeft.x * scale, top: topLeft.y * scale, right: bottomRight.x * scale, bottom: bottomRight.y * scale } };
      setScreen(old => old && old.scale === next.scale && Object.keys(next.bounds).every(key => old.bounds[key as keyof ScreenBox] === next.bounds[key as keyof ScreenBox]) ? old : next);
    };
    let frame = 0;
    const refresh = () => { measure(); cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    refresh(); const observer = new ResizeObserver(refresh); observer.observe(svg);
    let resolution = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const displayChanged = () => {
      resolution.removeEventListener('change', displayChanged);
      refresh(); resolution = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      resolution.addEventListener('change', displayChanged);
    };
    resolution.addEventListener('change', displayChanged);
    window.addEventListener('resize', refresh);
    window.visualViewport?.addEventListener('resize', refresh);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); resolution.removeEventListener('change', displayChanged);
      window.removeEventListener('resize', refresh); window.visualViewport?.removeEventListener('resize', refresh);
    };
  }, [viewport]);

  useEffect(() => { hitCycle.current = null; }, [project.id, positions, tool, viewport, orientation]);

  function focusPerformer(id: string | null, reveal = true) {
    if (!id) { svgRef.current?.focus({ preventScroll: true }); return; }
    setRememberedFocus({ project: project.id, id });
    const dot = [...(svgRef.current?.querySelectorAll<SVGGElement>('[data-performer-id]') ?? [])].find(node => node.dataset.performerId === id);
    dot?.focus({ preventScroll: true });
    const point = positions[id] && fieldViewPoint(positions[id], project.field, orientation);
    const margin = Math.max(2, (display.pointerRadiusPx + 2) / (screen?.scale ?? 1));
    if (reveal && point && (Math.abs(point.x - width / 2 - pan.x) > viewWidth / 2 - margin || Math.abs(point.y - height / 2 - pan.y) > viewHeight / 2 - margin)) setPan({ x: point.x - width / 2, y: point.y - height / 2 });
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
    const matrix = geometryRef.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  function hitsAt(clientX: number, clientY: number, pointerType = 'mouse') {
    const matrix = geometryRef.current?.getScreenCTM();
    if (!matrix) return [];
    const dots = project.performers.flatMap(person => {
      const point = displayedPositions[person.id];
      if (!point) return [];
      const client = new DOMPoint(point.x, point.y).matrixTransform(matrix);
      return [{ id: person.id, x: client.x, y: client.y }];
    });
    return nearestFieldDots(dots, { x: clientX, y: clientY }, pointerType === 'touch' ? display.touchRadiusPx : display.pointerRadiusPx);
  }

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function wheel(event: WheelEvent) {
      event.preventDefault();
      const next = clamp(safeZoom * Math.exp(-event.deltaY * 0.0015), 0.6, 3);
      const cursor = fieldViewPoint(pointAt(event.clientX, event.clientY), project.field, orientation);
      const ratio = safeZoom / next;
      setPan(old => ({ x: cursor.x - width / 2 - (cursor.x - width / 2 - old.x) * ratio, y: cursor.y - height / 2 - (cursor.y - height / 2 - old.y) * ratio }));
      onZoom(next);
    }
    svg.addEventListener('wheel', wheel, { passive: false });
    return () => svg.removeEventListener('wheel', wheel);
  }, [safeZoom, width, height, onZoom, orientation]);

  useEffect(() => {
    if (!gesture.current) return;
    gesture.current = null;
    setPreview({});
    setMarquee(null);
    setMoving(false);
  }, [positions, readOnly, project.id, orientation, snap, project.snapping]);

  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [project.id, fitVersion, orientation]);

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
    if (transformPreview || formationPreview || spacingPreview || coordinatePreview) return;
    const idsAtPointer = hitsAt(event.clientX, event.clientY, event.pointerType);
    hitCycle.current = cycleFieldHit(idsAtPointer, { x: event.clientX, y: event.clientY }, hitCycle.current);
    const id = idsAtPointer[hitCycle.current.index];
    if (id && positions[id]) {
      focusPerformer(id, false);
      if (event.shiftKey && selectionMembership(selectedIds).has(id)) {
        onSelect(selectedIds.filter(selectedId => selectedId !== id));
        return;
      }
      const ids = selectionMembership(selectedIds).has(id) ? selectedIds : event.shiftKey ? [...selectedIds, id] : [id];
      onSelect(ids);
      if (readOnly) return;
      const originals = Object.fromEntries(ids.filter(selectedId => positions[selectedId]).map(selectedId => [selectedId, { ...positions[selectedId] }]));
      gesture.current = { kind: 'move', start: point, anchorId: id, originals, updates: {}, moved: false };
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
      const dx = point.x - current.start.x;
      const dy = point.y - current.start.y;
      const scale = Math.hypot(svgRef.current?.getScreenCTM()?.a ?? 1, svgRef.current?.getScreenCTM()?.b ?? 0);
      const threshold = event.pointerType === 'touch' ? 8 : 3;
      if (Math.hypot(dx, dy) * scale < threshold && !current.moved) return;
      current.moved = true;
      hitCycle.current = null;
      current.updates = moveSelection(current.originals, Object.keys(current.originals), { x: dx, y: dy }, project.field, project.snapping ?? DEFAULT_SNAPPING, snap, current.anchorId);
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
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter' && coordinatePreview) { event.preventDefault(); event.stopPropagation(); coordinatePreview.onApply(); return; }
    if (event.key === 'Escape' && coordinatePreview) { event.preventDefault(); event.stopPropagation(); coordinatePreview.onCancel(); return; }
    if (event.key === 'Enter' && spacingPreview) { event.preventDefault(); event.stopPropagation(); spacingPreview.onApply(); return; }
    if (event.key === 'Escape' && spacingPreview) { event.preventDefault(); event.stopPropagation(); spacingPreview.onCancel(); return; }
    if (event.key === 'Enter' && formationPreview) { event.preventDefault(); event.stopPropagation(); formationPreview.onApply(); return; }
    if (event.key === 'Escape' && formationPreview) { event.preventDefault(); event.stopPropagation(); formationPreview.onCancel(); return; }
    if (event.key === 'Escape' && transformPreview) { event.preventDefault(); event.stopPropagation(); transformPreview.onCancel(); return; }
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
      onSelect(event.shiftKey ? selectionMembership(selectedIds).has(targetId) ? selectedIds.filter(id => id !== targetId) : [...selectedIds, targetId] : [targetId]);
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
        const viewPositions = Object.fromEntries(Object.entries(positions).map(([id, p]) => [id, fieldViewPoint(p, project.field, orientation)]));
        focusPerformer(nextFieldFocus(project.performers.map(person => person.id), viewPositions, targetId, event.key as FieldKey));
        return;
      }
      if (!isNudgeKey(event.key) || !selectedIds.length || readOnly) return;
      onNudge(event.key, event.shiftKey);
    }
  }

  return <div className={`field-stage${readOnly ? ' field-stage--readonly' : ''}${tool === 'pan' ? ' field-stage--pan' : ''}${moving ? ' field-stage--moving' : ''}`}>
    <svg ref={svgRef} className="field-stage__svg" viewBox={viewport} tabIndex={focusedId ? -1 : 0} role="group" aria-label={coordinatePreview ? 'Coordinate preview. Type a phrase in the Inspector, then Apply or Cancel.' : spacingPreview ? 'Spacing preview. Adjust the Inspector or interval handle, then Apply or Cancel.' : formationPreview ? 'Formation preview. Adjust the Inspector or field handles, then Apply or Cancel.' : transformPreview ? 'Transform preview. Adjust the Inspector or field handles, then Apply or Cancel.' : readOnly ? 'Read-only drill preview. Go to a set to edit positions.' : 'Interactive drill field. Drag performers to move; drag empty space to select. Repeat a click or tap to cycle equally near performers.'} aria-describedby={`${keyboardHelpId}${readOnly ? ' field-preview-message' : ''}`} onFocus={event => { fieldHasFocus.current = true; const id = (event.target as Element).closest('[data-performer-id]')?.getAttribute('data-performer-id'); if (id) setRememberedFocus({ project: project.id, id }); }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) fieldHasFocus.current = false; }} onPointerDown={startGesture} onPointerMove={continueGesture} onPointerUp={finishGesture} onPointerCancel={event => finishGesture(event, true)} onLostPointerCapture={event => { if (gesture.current) finishGesture(event, true); }} onKeyDown={onKeyDown} onDoubleClick={event => { if (!hitsAt(event.clientX, event.clientY).length) { setPan({ x: 0, y: 0 }); onZoom(1); } }}>
      <g ref={geometryRef} data-field-geometry={orientation} transform={fieldViewTransform(project.field, orientation)}>
      <FieldDrawing project={project} positions={displayedPositions} neighbors={moving ? [] : neighbors} selectedIds={selectedIds} showLabels={showLabels} showGrid={showGrid} coordinateFormat={coordinateFormat} readoutId={readoutId} focusedId={focusedId} keyboardHelpId={keyboardHelpId} keyboardFocusId={keyboardFocus ? focusedId : null} presentation={display} screen={screen} orientation={orientation} />
      {formationPreview && <FormationHandles key={orientation} preview={formationPreview} field={project.field} scale={screen?.scale ?? 1} />}
      {transformPreview && <TransformHandles key={orientation} preview={transformPreview} field={project.field} scale={screen?.scale ?? 1} />}
      {coordinatePreview && <CoordinateGuides preview={coordinatePreview} scale={screen?.scale ?? 1} />}
      {spacingPreview && <SpacingGuides key={orientation} preview={spacingPreview} project={project} scale={screen?.scale ?? 1} flipped={orientation === 'audience-top'} />}
      {moving && Object.keys(preview).length > 0 && <g data-snap-preview="true" aria-hidden="true" pointerEvents="none" stroke="#fff" strokeWidth={1 / (screen?.scale ?? 1)} strokeDasharray=".4 .3">{Object.entries(preview).map(([id, point]) => <line key={id} x1={positions[id].x} y1={positions[id].y} x2={point.x} y2={point.y} />)}</g>}
      {marquee && <rect x={Math.min(marquee.start.x, marquee.current.x)} y={Math.min(marquee.start.y, marquee.current.y)} width={Math.abs(marquee.start.x - marquee.current.x)} height={Math.abs(marquee.start.y - marquee.current.y)} fill="#c5f47b18" stroke="#caf38a" strokeWidth="0.15" strokeDasharray="0.6 0.4" pointerEvents="none" />}
      </g>
    </svg>
    <div id={keyboardHelpId} className="field-keyboard-help">{coordinatePreview ? 'Enter: apply coordinates · Escape: cancel preview · Type the phrase in the Inspector.' : spacingPreview ? 'Enter: apply spacing · Escape: cancel preview · Use Inspector numbers or the interval handle to adjust.' : formationPreview ? 'Enter: apply formation · Escape: cancel preview · Use Inspector numbers or drag the field handles to adjust.' : <>Arrows: focus · Enter/Space: select · Shift+Enter/Space: add/remove · {nudgeHelp} · Page Up/Down: roster · Home/End: first/last</>}</div>
    <div className="field-snap-status" role="status">{coordinatePreview ? 'Exact coordinate entry · snapping bypassed' : spacingPreview ? 'Exact spacing · snapping bypassed' : snapDescription(project.snapping ?? DEFAULT_SNAPPING, snap)}{moving && Object.keys(preview).length ? " · Release to apply · Escape to cancel" : ""}</div>
    <FieldReadout id={readoutId} svgRef={svgRef} geometryRef={geometryRef} orientation={orientation} project={project} positions={displayedPositions} selectedIds={selectedIds} coordinateFormat={coordinateFormat} viewport={viewport} readOnly={readOnly} keyboardFocusedId={keyboardFocus ? focusedId : null} presentation={display} />
    <div className="field-stage__corner"><span className="stage-status-light" /> {project.field.preset === 'college' ? 'NCAA' : 'HIGH SCHOOL'} FIELD <span className="field-stage__dimensions">{width} × {height.toFixed(1)} yd</span></div>
    <div className="field-stage__hint">{coordinatePreview ? 'COORDINATE PREVIEW' : spacingPreview ? 'SPACING PREVIEW' : formationPreview ? 'FORMATION PREVIEW' : transformPreview ? 'TRANSFORM PREVIEW' : readOnly ? 'PLAYBACK PREVIEW' : tool === 'pan' ? 'Drag to pan' : 'Drag to select · Shift to add'}<span>Scroll to zoom · Double-click to fit</span></div>
    <div className="field-stage__orientation" aria-label={orientation === 'audience-top' ? 'Flipped field: audience and front sideline at top' : 'Audience and front sideline at bottom'}><span>↑</span> {orientation === 'audience-top' ? 'FRONT · AUDIENCE TOP' : 'BACK · AUDIENCE BOTTOM'}</div>
  </div>;
}
