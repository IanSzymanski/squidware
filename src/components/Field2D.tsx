import { isCustomSurface, surfaceDimensionText, surfaceReferences, SURFACE_NAMES, type CustomSurface } from '../surfaces';
import { resolveEquipment } from '../equipment';
import { describeFacing, facingAt } from '../performerFacing';
import { TravelOverlay, type TravelPreview } from '../editor/TravelCanvas';
import { FieldCanvas } from './FieldCanvas';
import { StagingFootprints } from './StagingFootprints';
import type { StagingSample } from '../staging';
import { fieldDotColor, fieldLabels, measureFieldLabels, type FieldScreen } from './fieldScene';
import { ScatterFormationHandles } from './ScatterFormationHandles';
import { BezierFormationHandles } from './BezierFormationHandles';
import { isNudgeKey, type NudgeKey } from '../editIncrements';
import { DEFAULT_SNAPPING, gridInterval, hashLines, moveSelection } from '../snapping';
import type { CoordinateOptions } from '../coordinates';
import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { Performer, PerformerFacings, Point, Project } from '../types';
import { selectionMembership } from '../selection';
import type { SelectionReview } from '../selectionTools';
import { coordinateDescription } from '../domain';
import { FieldReadout } from './FieldReadout';
import { FIELD_KEYS, nextFieldFocus } from './fieldKeyboard';
import type { FieldKey } from './fieldKeyboard';
import { fieldPaletteFor, fieldPaletteStyle, type FieldPalette } from './fieldPalette';
import type { FieldScheme } from '../appearance';
import { cycleFieldHit, DEFAULT_FIELD_PRESENTATION, labelLeader, nearestFieldDots } from './fieldPresentation';
import type { FieldPresentation, HitCycle, ScreenBox } from './fieldPresentation';
import './stages.css';
import { NeighborDrawing } from './NeighborDrawing';
import { FormationHandles, type FieldFormationPreview } from './FormationHandles';
import { TransformHandles, type FieldTransformPreview } from './TransformHandles';
import { SelectionBox, type FieldSelectionBox } from './SelectionBox';
import { SpacingGuides, type FieldSpacingPreview } from './SpacingGuides';
import { CoordinateGuides, type FieldCoordinatePreview } from './CoordinateGuides';
import type { NeighborOverlay } from '../neighborPaths';
import { fieldViewBox, fieldViewPoint, fieldViewTransform, type FieldOrientation } from './fieldOrientation';

interface DrawingProps {
  orientation?: FieldOrientation;
  project: Project;
  facings?: PerformerFacings;
  staging?: readonly StagingSample[];
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
  screen?: FieldScreen;
  dynamicOnly?: boolean;
  deferMotion?: boolean;
}

function CustomFieldMarkings({ field, showGrid, flipped, snapping, gridScale, palette }: { field: CustomSurface; showGrid: boolean; flipped: boolean; snapping: NonNullable<Project['snapping']>; gridScale?: number; palette: FieldPalette }) {
  const { width, height, background } = field;
  const ink = palette.floor;
  const x = surfaceReferences(field, 'x');
  const y = surfaceReferences(field, 'y');
  const step = gridInterval(snapping) * gridStride(gridInterval(snapping), gridScale);
  const minorGrid = showGrid && snapping.target === 'grid';
  // On screen the floor speaks as quietly as the football field does; print and export keep their stronger ink.
  const screen = gridScale !== undefined;
  const line = (coordinate: number, axis: 'x' | 'y') => axis === 'x'
    ? <line key={coordinate} x1={coordinate} x2={coordinate} y2={height} />
    : <line key={coordinate} y1={coordinate} y2={coordinate} x2={width} />;
  const label = (text: string, px: number, py: number) => <text x={px} y={py} transform={flipped ? `rotate(180 ${px} ${py})` : undefined}>{text}</text>;
  const mark = Math.min(width, height, 30) / 24;
  return <g data-field-markings="true" aria-hidden="true">
    <rect data-field-surface="true" width={width} height={height} fill={field.preset === 'indoor' ? ink.indoor : ink.custom} />
    {background && <image href={background.image} x={background.x} y={background.y} width={background.width} height={background.height} preserveAspectRatio="none" />}
    {minorGrid && <g stroke={ink.grid} strokeWidth=".035" opacity={screen ? .13 : .25}>
      {Array.from({ length: Math.floor(width / step) }, (_, i) => line((i + 1) * step, 'x'))}
      {Array.from({ length: Math.floor(height / step) }, (_, i) => line((i + 1) * step, 'y'))}
    </g>}
    <g stroke={ink.reference} strokeWidth={screen ? .06 : .09} opacity={screen ? .3 : .48} strokeDasharray=".35 .2">
      {x.slice(1, -1).map(value => line(value, 'x'))}
      {y.slice(1, -1).map(value => line(value, 'y'))}
    </g>
    <rect width={width} height={height} fill="none" stroke={ink.edge} strokeWidth={screen ? .1 : .15} strokeOpacity={screen ? .7 : 1} />
    <path d={`M0,${mark}V0H${mark}`} fill="none" stroke={ink.origin} strokeWidth={screen ? .12 : .2} strokeOpacity={screen ? .8 : 1} />
    {screen
      ? <g className="field-captions" fill={ink.caption} opacity=".7" fontFamily="Arial, sans-serif" fontWeight="600" fontSize={mark * .56} letterSpacing={mark * .18} textAnchor="middle">
        {label('ORIGIN', mark * 1.6, -mark * .55)}
        {label('AUDIENCE EDGE', width / 2, height + mark * 1.05)}
      </g>
      : <g fill={ink.printCaption} fontFamily="Arial, sans-serif" fontWeight="600" fontSize={mark} textAnchor="middle">
        {label('0, 0', 0, -mark * 1.1)}
        {label('AUDIENCE EDGE', width / 2, height + mark * 1.65)}
      </g>}
  </g>;
}

/** The coarsest whole multiple of the grid that keeps drawn lines at least this many pixels apart on screen. */
const GRID_MIN_PITCH_PX = 6;
const gridStride = (interval: number, scale?: number) => scale ? [1, 2, 4, 8, 16].find(stride => interval * stride * scale >= GRID_MIN_PITCH_PX) ?? 16 : 1;

export const StaticFieldMarkings = memo(function StaticFieldMarkings(props: Project['field'] & { showGrid: boolean; flipped?: boolean; snapping?: Project['snapping']; /** Screen pixels per yard; the grid thins out when its lines would crowd into texture. Print and export draw every line. */ gridScale?: number; /** The standard turf unless a personal field look or a Classic chart drill book asks otherwise. */ scheme?: FieldScheme; /** A personal background behind the field, which its captions must read on. */ well?: string | null }) {
  const { width, height, preset, showGrid, flipped = false, snapping = DEFAULT_SNAPPING, gridScale, scheme, well } = props;
  const palette = fieldPaletteFor(scheme, well), ink = palette.football;
  if (isCustomSurface(props)) return <CustomFieldMarkings field={props} showGrid={showGrid} flipped={flipped} snapping={snapping} gridScale={gridScale} palette={palette} />;

  const hashInset = preset === 'college' ? 20 : height / 3;
  const interval = snapping.target === 'grid' ? gridInterval(snapping) : 5;
  // Snapping still uses every grid point; only the drawing thins out.
  const stride = snapping.target === 'grid' ? gridStride(interval, gridScale) : 1, drawn = interval * stride;
  const gridY = snapping.target === 'grid' ? Array.from({ length: Math.floor(height / drawn) + 1 }, (_, i) => i * drawn) : hashLines(props);
  const yardLines = Array.from({ length: Math.floor(width / 5) + 1 }, (_, index) => index * 5);
  const hashes = Array.from({ length: Math.floor(width) - 1 }, (_, index) => index + 1).filter(x => x % 5 !== 0);
  return <g data-field-markings="true" aria-hidden="true">
    <rect x={-2} y={-2} width={width + 4} height={height + 4} rx="0.5" fill={ink.apron} stroke={ink.apronLine} strokeWidth="0.12" />
    <rect data-field-surface="true" width={width} height={height} fill={ink.turf} />
    {ink.stripeOpacity > 0 && yardLines.filter((_, i) => i % 2 === 0).map(x => <rect key={`stripe-${x}`} x={x} width={Math.min(5, width - x)} height={height} fill={ink.stripe} opacity={ink.stripeOpacity} />)}
    {showGrid && <g stroke={ink.grid} strokeWidth="0.045" opacity={ink.gridOpacity}>
      {Array.from({ length: Math.floor(width / drawn) + 1 }, (_, i) => <line key={`gx-${i}`} x1={i * drawn} x2={i * drawn} y1={0} y2={height} />)}
      {gridY.map((y, i) => <line key={`gy-${i}`} x1={0} x2={width} y1={y} y2={y} />)}
    </g>}
    <g stroke={ink.line} opacity={ink.lineOpacity} strokeWidth="0.14">
      {yardLines.map(x => <line key={`yard-${x}`} x1={x} x2={x} y1={0} y2={height} opacity={x % 10 === 0 ? 1 : 0.6} />)}
      <rect width={width} height={height} fill="none" strokeWidth="0.27" opacity="1" />
      {hashes.map(x => <g key={`hash-${x}`}>
        <line x1={x} x2={x} y1={0} y2={0.75} />
        <line x1={x} x2={x} y1={height - 0.75} y2={height} />
        <line x1={x} x2={x} y1={hashInset - 0.3} y2={hashInset + 0.3} />
        <line x1={x} x2={x} y1={height - hashInset - 0.3} y2={height - hashInset + 0.3} />
      </g>)}
    </g>
    <g className="field-yard-numbers" fill={ink.number} textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="2.5" opacity={ink.numberOpacity}>
      {yardLines.filter(x => x > 0 && x < width && x % 10 === 0).map(x => {
        const label = Math.min(x, width - x);
        return <g key={`number-${x}`}>
          <text x={x} y={height - 4.2} letterSpacing="0.15">{label}</text>
          <text x={x} y={-6.3} transform={`rotate(180 ${x} 0)`} letterSpacing="0.15">{label}</text>
        </g>;
      })}
    </g>
    <g className="field-captions" fill={ink.caption} opacity={ink.captionOpacity} textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="600" fontSize="0.9" letterSpacing="0.3">
      <text x={width / 2} y={-2.75} transform={flipped ? `rotate(180 ${width / 2} -3.07)` : undefined}>BACK SIDELINE</text>
      <text className="field-caption-front" x={width / 2} y={height + 3.4} transform={flipped ? `rotate(180 ${width / 2} ${height + 3.08})` : undefined}>FRONT SIDELINE</text>
      {/* Side 1 is the left half from the audience, as every coordinate reads. */}
      <text x={width * .28} y={-2.75} transform={flipped ? `rotate(180 ${width * .28} -3.07)` : undefined}>SIDE 1</text>
      <text x={width * .72} y={-2.75} transform={flipped ? `rotate(180 ${width * .72} -3.07)` : undefined}>SIDE 2</text>
    </g>
  </g>;
});
StaticFieldMarkings.displayName = 'StaticFieldMarkings';

/** SVG children shared by the interactive field and exported field diagrams. */
export function FieldDrawing({ project, facings, staging, positions, neighbors, selectedIds = [], showLabels = true, showGrid = false, readoutId, focusedId, keyboardHelpId, keyboardFocusId, coordinateFormat, presentation, screen, dynamicOnly = false, deferMotion = false, orientation = 'audience-bottom' }: DrawingProps) {
  const selected = selectionMembership(selectedIds);
  const colors = new Map(project.sections.map(section => [section.id, section.color]));
  const sectionNames = new Map(project.sections.map(section => [section.id, section.name]));
  const display = { ...DEFAULT_FIELD_PRESENTATION, ...presentation };
  const palette = fieldPaletteFor(display.scheme, display.well);
  const scale = screen?.scale ?? 1;
  const radius = screen ? display.dotRadiusPx / scale : .52;
  const flipped = !!screen && orientation === 'audience-top';
  const viewPoint = (point: Point) => fieldViewPoint(point, project.field, flipped ? orientation : 'audience-bottom');
  // Measure the actual font once per roster/font change; use conservative fallback during SSR.
  const labelWidths = useMemo(() => measureFieldLabels(project, display.labelSizePx), [project.performers, display.labelSizePx]);
  const labels = screen ? fieldLabels(project, positions, selected, keyboardFocusId, { ...display, labelMode: showLabels ? display.labelMode : 'none' }, screen, orientation, labelWidths) : null;
  // The tie between a dot and a label placed away from its usual side, in the performer's own frame.
  const leader = (at: Point, box: ScreenBox) => {
    const line = labelLeader({ x: at.x * scale, y: at.y * scale }, box, display.dotRadiusPx);
    return line && <line className="field-label-leader" x1={line.x1 / scale - at.x} y1={line.y1 / scale - at.y} x2={line.x2 / scale - at.x} y2={line.y2 / scale - at.y} stroke={palette.label.leader} strokeOpacity=".5" strokeWidth={1 / scale} pointerEvents="none" />;
  };
  return <>
    {!dynamicOnly && <StaticFieldMarkings {...project.field} snapping={project.snapping} showGrid={showGrid} flipped={flipped} gridScale={screen?.scale} scheme={display.scheme} well={display.well} />}
    <StagingFootprints objects={staging} />
    {neighbors && <NeighborDrawing overlays={neighbors} scale={scale} />}
    {project.performers.map(performer => {
      const point = positions[performer.id];
      if (!point) return null;
      const isSelected = selected.has(performer.id);
      const sectionColor = colors.get(performer.sectionId) ?? '#b9ed85';
      const color = screen ? fieldDotColor(sectionColor, isSelected, display) : sectionColor;
      const labelPoint = viewPoint(point);
      const details = [performer.label, performer.name, sectionNames.get(performer.sectionId), describeFacing(facingAt(facings, performer.id)), !deferMotion && coordinateDescription(point, project.field, coordinateFormat)].filter(Boolean).join(' · ');
      const label = labels?.get(performer.id);
      const focusRadius = screen ? (display.dotRadiusPx + 5) / scale : 1.35;
      return <g key={performer.id} data-performer-id={performer.id} tabIndex={readoutId ? focusedId === performer.id ? 0 : -1 : undefined} role={readoutId ? 'button' : undefined} aria-label={readoutId ? `${details}${isSelected ? ', selected' : ''}` : undefined} aria-describedby={keyboardHelpId} aria-pressed={readoutId ? isSelected : undefined} className={`field-performer${keyboardFocusId === performer.id ? ' field-performer--focused' : ''}`} transform={`translate(${point.x} ${point.y})`}>
        <title>{details}</title>
        <g transform={flipped ? 'rotate(180)' : undefined}>
        <circle className="field-hit-area" r={screen ? display.pointerRadiusPx / scale : 1.15} fill="transparent" />
        {readoutId && <rect className="field-focus-ring" x={-focusRadius} y={-focusRadius} width={focusRadius * 2} height={focusRadius * 2} rx={screen ? 1 / scale : .15} fill="none" stroke={palette.dot.ring} strokeWidth={screen ? 2 / scale : .24} pointerEvents="none" />}
        {isSelected && screen && <circle className="field-selection-halo" r={(display.dotRadiusPx + 3) / scale} fill="none" stroke={palette.dot.halo} strokeWidth={4 / scale} pointerEvents="none" />}
        {isSelected && <circle className={screen ? "field-selection-ring" : undefined} r={screen ? (display.dotRadiusPx + 3) / scale : .96} fill={`${color}22`} stroke={palette.dot.ring} strokeWidth={screen ? 1.5 / scale : .16} pointerEvents="none" />}
        <circle className="field-dot" r={radius} fill={color} stroke={isSelected ? palette.dot.outlineSelected : palette.dot.outline} strokeWidth={screen ? 1 / scale : .16} />
        <circle cx={-radius * .23} cy={-radius * .27} r={radius / 4} fill="#ffffff" opacity={palette.dot.gloss} pointerEvents="none" />
        {showLabels && screen && label && (isSelected || performer.id === keyboardFocusId) && leader(labelPoint, label) }
        {showLabels && (!screen || label) && <text data-performer-label={performer.id} x={label ? (label.left + 2) / scale - labelPoint.x : .83} y={label ? (label.top + 2 + display.labelSizePx * .8) / scale - labelPoint.y : .34} fill={isSelected ? palette.label.selected : screen ? palette.label.screen : palette.label.print} stroke={palette.label.halo} strokeWidth={screen ? 2.5 / scale : .2} strokeLinejoin="round" paintOrder="stroke" fontFamily={screen ? 'Arial, sans-serif' : 'Inter, Arial, sans-serif'} fontSize={screen ? display.labelSizePx / scale : 1.05} fontWeight={isSelected ? 700 : 500} opacity={!screen || isSelected ? undefined : selected.size ? .45 : .85} pointerEvents="none">{performer.label}</text>}
        </g>
      </g>;
    })}
  </>;
}

// Retain the roving SVG buttons and vector fallback without reconciling hidden
// paint on every clock tick. Canonical positions are synchronized below.
const InteractiveFieldDrawing = memo(FieldDrawing, (before, after) => {
  if (!before.deferMotion || !after.deferMotion) return false;
  return (Object.keys(after) as (keyof DrawingProps)[]).every(key => ['positions', 'facings', 'screen'].includes(key) || before[key] === after[key]);
});
InteractiveFieldDrawing.displayName = 'InteractiveFieldDrawing';
const NO_POSITIONS: Record<string, Point> = {};
const NO_NEIGHBORS: NeighborOverlay[] = [];

function PerformerMarks({ facings, performers, positions, scale, radius, ink }: {
  facings?: PerformerFacings; performers: { id: string; role?: NonNullable<Performer['appearance']>['role']; costumeColor?: string }[]; positions: Record<string, Point>; scale: number; radius: number; ink: FieldPalette['mark'];
}) {
  const start = radius + 4;
  return <g className="performer-marks" pointerEvents="none" aria-hidden="true">
    {Object.entries(facings ?? {}).map(([id, angle]) => {
      const point = Object.hasOwn(positions, id) ? positions[id] : undefined;
      return point && <path key={id} data-performer-facing={id} data-facing-degrees={angle}
        transform={`translate(${point.x} ${point.y}) scale(${1 / scale}) rotate(${-angle})`}
        d={`M -3 ${start} L 0 ${start + 5} L 3 ${start} Z`} fill={ink.fill} stroke={ink.outline} strokeWidth="1" />;
    })}
    {performers.map(({ id, role, costumeColor }) => {
      const point = positions[id];
      return point && <g key={id} data-performer-appearance={id} data-performer-role={role}
        transform={`translate(${point.x} ${point.y}) scale(${1 / scale})`}>
        {costumeColor && <circle r={Math.max(1.4, radius * .6)} fill={costumeColor} stroke={ink.outline} strokeWidth="1" />}
        {role && <path transform={`translate(${-start - 5} ${-start - 5})`}
          d={role === 'guard' ? 'M -2 3 V -3 H 3 L 1 0 H -2 Z' : 'M -3 -2 H 3 V 2 H -3 Z'}
          fill={ink.fill} stroke={ink.outline} strokeWidth="1" />}
      </g>;
    })}
  </g>;
}

interface Field2DProps extends DrawingProps {
  travelPreview?: TravelPreview;
  moveOperationPreview?: { overlay: React.ReactNode; onCancel: () => void; onApply: () => void };
  transformPreview?: FieldTransformPreview;
  /** Frames a multiple selection with its size and rotate/scale handles. */
  selectionBox?: FieldSelectionBox;
  spacingPreview?: FieldSpacingPreview;
  coordinatePreview?: FieldCoordinatePreview;
  formationPreview?: FieldFormationPreview;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onMove: (updates: Record<string, Point>) => void;
  onMovePreview?: (updates: Record<string, Point> | null) => void;
  problemOverlay?: React.ReactNode;
  tool: 'select' | 'pan' | 'lasso';
  selectionPreview?: SelectionReview | null;
  selectionToolsOpen?: boolean; onSelectionClose?: () => void;
  onLasso?: (points: Point[], additive: boolean) => void;
  onSelectionApply?: () => void; onSelectionCancel?: () => void;
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
  | { kind: 'lasso'; points: Point[]; additive: boolean }
  | { kind: 'move'; start: Point; anchorId: string; originals: Record<string, Point>; updates: Record<string, Point>; moved: boolean };

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export function Field2D({ project, facings, staging, positions, neighbors, selectedIds, onSelect, onMove, onMovePreview, problemOverlay, travelPreview, moveOperationPreview, tool, showLabels, showGrid, snap, zoom, onZoom, readOnly, fitVersion = 0, onNudge, nudgeHelp, coordinateFormat, presentation, transformPreview, selectionBox, formationPreview, spacingPreview, coordinatePreview, selectionPreview, selectionToolsOpen, onSelectionClose, onLasso, onSelectionApply, onSelectionCancel, orientation = 'audience-bottom' }: Field2DProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const geometryRef = useRef<SVGGElement>(null);
  const performerNodes = useRef<SVGGElement[]>([]);
  const paintedPositions = useRef(new WeakMap<SVGGElement, Point>());
  const readoutId = useId();
  const keyboardHelpId = useId();
  const fieldHasFocus = useRef(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  // Keyboard help is drawn only after a key press inside the field; pointer focus never shows it.
  const [keyboardHelp, setKeyboardHelp] = useState(false);
  const [rememberedFocus, setRememberedFocus] = useState<{ project: string; id: string } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const hitCycle = useRef<HitCycle | null>(null);
  const display = useMemo(() => ({ ...DEFAULT_FIELD_PRESENTATION, ...presentation }), [presentation?.colorMode, presentation?.scheme, presentation?.well, presentation?.customColor, presentation?.dotRadiusPx, presentation?.pointerRadiusPx, presentation?.touchRadiusPx, presentation?.labelSizePx, presentation?.labelMode, presentation?.labelKeepOut, presentation?.labelReachSelected, presentation?.labelSubset]);
  const [canvasReady, setCanvasReady] = useState(false);
  const [screen, setScreen] = useState<DrawingProps['screen']>();
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [preview, setPreview] = useState<Record<string, Point>>({});
  const [marquee, setMarquee] = useState<{ start: Point; current: Point } | null>(null);
  const [lasso, setLasso] = useState<Point[] | null>(null);
  const [moving, setMoving] = useState(false);
  const width = project.field.width;
  const height = project.field.height;
  const safeZoom = clamp(zoom, 0.6, 3);
  const view = fieldViewBox(project.field, safeZoom, pan);
  const viewWidth = view.width, viewHeight = view.height;
  const viewport = `${view.x} ${view.y} ${viewWidth} ${viewHeight}`;
  const palette = useMemo(() => fieldPaletteFor(display.scheme, display.well), [display.scheme, display.well]);
  const paletteStyle = useMemo(() => fieldPaletteStyle(palette), [palette]);
  const displayedPositions = useMemo(() => Object.keys(preview).length ? { ...positions, ...preview } : positions, [positions, preview]);
  const spatialPreview = moveOperationPreview ?? travelPreview;
  const markedPerformers = useMemo(() => {
    const defaults = new Map(project.sections.map(section => [section.id, section.equipment]));
    return project.performers.flatMap(({ id, sectionId, appearance }) => {
      const { role } = resolveEquipment(appearance, defaults.get(sectionId));
      const costumeColor = appearance?.costumeColor;
      return role || costumeColor ? [{ id, role, costumeColor }] : [];
    });
  }, [project.performers, project.sections]);
  const wantsCanvas = readOnly || moving || !!selectionPreview || !!neighbors?.length;
  const canvasActive = wantsCanvas && canvasReady;
  const focusedId = rememberedFocus?.project === project.id && positions[rememberedFocus.id]
    ? rememberedFocus.id : selectedIds.find(id => positions[id]) ?? project.performers[0]?.id ?? null;

  useLayoutEffect(() => {
    performerNodes.current = [...(geometryRef.current?.querySelectorAll<SVGGElement>('[data-performer-id]') ?? [])];
  }, [project.performers]);
  useLayoutEffect(() => {
    for (const node of performerNodes.current) {
      const id = node.dataset.performerId!, point = displayedPositions[id];
      if (!point) continue;
      const old = paintedPositions.current.get(node);
      if (!old || old.x !== point.x || old.y !== point.y) {
        node.setAttribute('transform', `translate(${point.x} ${point.y})`); paintedPositions.current.set(node, point);
      }
      // Only the focused button announces live coordinates during motion. The
      // whole SVG refreshes on return to editing, including every description.
      if (canvasActive && id === focusedId) {
        const person = project.performers.find(person => person.id === id)!;
        const section = project.sections.find(section => section.id === person.sectionId)?.name;
        node.setAttribute('aria-label', [person.label, person.name, section, describeFacing(facingAt(facings, id)), coordinateDescription(point, project.field, coordinateFormat)].filter(Boolean).join(' · ') + (selectionMembership(selectedIds).has(id) ? ', selected' : ''));
      }
    }
  });

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const matrix = svg.getScreenCTM(); if (!matrix) return;
      const scale = Math.hypot(matrix.a, matrix.b); if (!scale) return;
      const rect = svg.getBoundingClientRect();
      const topLeft = new DOMPoint(rect.left, rect.top).matrixTransform(matrix.inverse());
      const bottomRight = new DOMPoint(rect.right, rect.bottom).matrixTransform(matrix.inverse());
      const next = { scale, pixelRatio: window.devicePixelRatio, bounds: { left: topLeft.x * scale, top: topLeft.y * scale, right: bottomRight.x * scale, bottom: bottomRight.y * scale } };
      setScreen(old => old && old.scale === next.scale && old.pixelRatio === next.pixelRatio && Object.keys(next.bounds).every(key => old.bounds[key as keyof ScreenBox] === next.bounds[key as keyof ScreenBox]) ? old : next);
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
      setKeyboardHelp(!!active && !!svgRef.current?.contains(active));
      if (id) { fieldHasFocus.current = true; setRememberedFocus({ project: project.id, id }); }
      else fieldHasFocus.current = false;
    };
    const pointer = () => { setKeyboardFocus(false); setKeyboardHelp(false); };
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

  // Retire the old gesture before the new tool can receive pointer input.
  // A passive effect could otherwise cancel a gesture started after commit.
  useLayoutEffect(() => {
    if (!gesture.current) return;
    gesture.current = null;
    onMovePreview?.(null);
    setPreview({});
    setMarquee(null);
    setLasso(null);
    setMoving(false);
  }, [positions, readOnly, project.id, orientation, snap, project.snapping, tool, onMovePreview]);
  useEffect(() => () => onMovePreview?.(null), [onMovePreview]);

  useLayoutEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [project.id, fitVersion, orientation]);

  function startGesture(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0 && event.button !== 1) return;
    if (spatialPreview && event.button !== 1 && !event.altKey) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    const point = pointAt(event.clientX, event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === 'pan' || event.button === 1 || event.altKey) {
      gesture.current = { kind: 'pan', startClient: { x: event.clientX, y: event.clientY }, startPan: pan, scale: svgRef.current?.getScreenCTM()?.a || 1 };
      setMoving(true);
      return;
    }
    if (transformPreview || formationPreview || spacingPreview || coordinatePreview || selectionPreview) return;
    if (tool === 'lasso') {
      if (readOnly) return;
      gesture.current = { kind: 'lasso', points: [point], additive: event.shiftKey };
      setLasso([point]); return;
    }
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
    // Native hover events can arrive while capture is retiring. Only held
    // pointer buttons may change a gesture; pointerup commits its last drag.
    if (!current || event.buttons === 0) return;
    if (current.kind === 'pan') {
      setPan({ x: current.startPan.x - (event.clientX - current.startClient.x) / current.scale, y: current.startPan.y - (event.clientY - current.startClient.y) / current.scale });
      return;
    }
    const point = pointAt(event.clientX, event.clientY);
    if (current.kind === 'lasso') {
      const last = current.points.at(-1)!;
      if (current.points.length < 513 && Math.hypot(point.x - last.x, point.y - last.y) * (screen?.scale ?? 1) >= 3) { current.points.push(point); setLasso([...current.points]); }
      return;
    }
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
      onMovePreview?.(current.updates);
      setPreview(current.updates);
      setMoving(true);
    }
  }

  function finishGesture(event: ReactPointerEvent<SVGSVGElement>, cancelled = false) {
    const current = gesture.current;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (current && !cancelled) {
      if (current.kind === 'lasso') { const end = pointAt(event.clientX, event.clientY); if (current.points.length < 512) current.points.push(end); onLasso?.(current.points, current.additive); }
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
    onMovePreview?.(null);
    setPreview({});
    setMarquee(null);
    setLasso(null);
    setMoving(false);
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.nativeEvent.isComposing) return;
    if (spatialPreview) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); spatialPreview.onCancel?.(); }
      if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); spatialPreview.onApply?.(); }
      return;
    }
    if (event.key === 'Escape' && gesture.current?.kind === 'move') {
      event.preventDefault(); event.stopPropagation(); gesture.current = null; setPreview({}); setMoving(false); onMovePreview?.(null); return;
    }
    if (selectionPreview && ['Enter', 'Escape'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); if (event.key === 'Escape') onSelectionCancel?.(); else onSelectionApply?.(); return; }
    if (event.key === 'Escape' && selectionToolsOpen && !gesture.current) { event.preventDefault(); event.stopPropagation(); onSelectionClose?.(); return; }
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
      const cancelledLasso = gesture.current?.kind === 'lasso';
      gesture.current = null;
      setPreview({});
      setMarquee(null);
      setLasso(null);
      setMoving(false);
      if (!cancelledLasso) onSelect([]);
      return;
    }
    const targetId = (event.target as Element).closest('[data-performer-id]')?.getAttribute('data-performer-id') ?? focusedId;
    if (selectionPreview && (event.key === ' ' || (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a')) { event.preventDefault(); event.stopPropagation(); return; }
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

  // While a shape, transform or spacing preview is open, the performers it is about stand out and the rest recede.
  const previewIds = formationPreview?.session.ids ?? transformPreview?.session.ids ?? spacingPreview?.session.ids;
  const previewSubject = useMemo(() => previewIds ? new Set(previewIds) : undefined, [previewIds]);
  const pathCount = moving ? 0 : neighbors?.reduce((count, overlay) => count + overlay.paths.length, 0) ?? 0;
  // The static markings redraw only when zoom crosses a grid level, not on every zoom step: one representative scale per level.
  const gridLevel = screen ? 2 ** (Math.round(Math.log2(screen.scale) * 4) / 4) : undefined;
  return <div className={`field-stage${readOnly ? ' field-stage--readonly' : ''}${tool === 'pan' ? ' field-stage--pan' : ''}${moving ? ' field-stage--moving' : ''}${keyboardHelp ? ' field-stage--keyboard' : ''}`} data-surface={project.field.preset} data-field-scheme={display.scheme} style={paletteStyle}>
    <svg className="field-stage__background" viewBox={viewport} aria-hidden="true">
      <g transform={fieldViewTransform(project.field, orientation)}>
        <StaticFieldMarkings {...project.field} snapping={project.snapping} showGrid={showGrid} flipped={orientation === 'audience-top'} gridScale={gridLevel} scheme={display.scheme} well={display.well} />
        <StagingFootprints objects={staging} />
      </g>
    </svg>
    {screen && <FieldCanvas project={project} positions={displayedPositions} selectedIds={selectedIds} display={display} screen={screen} orientation={orientation} focusedId={keyboardFocus ? focusedId : null} showLabels={showLabels} enabled={wantsCanvas} neighbors={moving ? NO_NEIGHBORS : neighbors} selectionPreview={selectionPreview} snapPreview={moving ? preview : NO_POSITIONS} original={positions} onReady={setCanvasReady} subject={previewSubject} quietLabels={pathCount > 30} />}
    <svg ref={svgRef} className="field-stage__svg" viewBox={viewport} tabIndex={moveOperationPreview ? 0 : travelPreview || focusedId ? -1 : 0} role="group" aria-label={moveOperationPreview ? 'Move operation field preview. Enter to apply or Escape to cancel.' : travelPreview?.routeMode ? 'Shared route preview. Draw or edit handles on the field, then Apply or Cancel in the panel.' : travelPreview ? 'Movement path preview. Draw or edit handles on the field, then Apply or Cancel in the panel.' : selectionPreview ? 'Selection preview. Review the candidate rings in Selection tools, then Apply or Cancel.' : coordinatePreview ? 'Coordinate preview. Type a phrase in the Inspector, then Apply or Cancel.' : spacingPreview ? 'Spacing preview. Adjust the Inspector or interval handle, then Apply or Cancel.' : formationPreview ? 'Formation preview. Adjust the Inspector or field handles, then Apply or Cancel.' : transformPreview ? 'Transform preview. Adjust the Inspector or field handles, then Apply or Cancel.' : readOnly ? 'Read-only drill preview. Go to a set to edit positions.' : 'Interactive drill field. Drag performers to move; drag empty space to select. Repeat a click or tap to cycle equally near performers.'} aria-describedby={spatialPreview ? undefined : `${keyboardHelpId}${readOnly ? ' field-preview-message' : ''}`} onFocus={event => { fieldHasFocus.current = true; const id = (event.target as Element).closest('[data-performer-id]')?.getAttribute('data-performer-id'); if (id) setRememberedFocus({ project: project.id, id }); }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) fieldHasFocus.current = false; }} onPointerDown={startGesture} onPointerMove={continueGesture} onPointerUp={finishGesture} onPointerCancel={event => finishGesture(event, true)} onLostPointerCapture={event => { if (gesture.current) finishGesture(event, true); }} onKeyDown={onKeyDown} onDoubleClick={event => { if (!hitsAt(event.clientX, event.clientY).length) { setPan({ x: 0, y: 0 }); onZoom(1); } }}>
      <g ref={geometryRef} data-field-geometry={orientation} transform={fieldViewTransform(project.field, orientation)}>
      <g className="field-drawing" opacity={canvasActive ? 0 : 1}>
      <InteractiveFieldDrawing dynamicOnly deferMotion={canvasActive} project={project} facings={facings} positions={displayedPositions} neighbors={moving ? NO_NEIGHBORS : neighbors} selectedIds={selectedIds} showLabels={showLabels} showGrid={showGrid} coordinateFormat={coordinateFormat} readoutId={spatialPreview ? undefined : readoutId} focusedId={focusedId} keyboardHelpId={keyboardHelpId} keyboardFocusId={keyboardFocus ? focusedId : null} presentation={display} screen={screen} orientation={orientation} />
      </g>
      {(facings || markedPerformers.length > 0) && screen && <PerformerMarks facings={facings}
        performers={markedPerformers} positions={displayedPositions} scale={screen.scale} radius={display.dotRadiusPx} ink={palette.mark} />}
      {!spatialPreview && problemOverlay}
      {moveOperationPreview?.overlay}
      {travelPreview && <TravelOverlay {...travelPreview} zoom={safeZoom} snap={travelPreview.snapHandles ?? snap} mainField pan={tool === 'pan'} scale={screen?.scale} flipped={orientation === 'audience-top'} />}
      {selectionPreview && <g opacity={canvasActive ? 0 : 1} aria-hidden="true" pointerEvents="none">{selectionPreview.candidates.map(candidate => <circle key={candidate.id} data-selection-candidate={candidate.id} data-included={selectionPreview.ids.includes(candidate.id)} className="selection-preview-ring" cx={positions[candidate.id].x} cy={positions[candidate.id].y} r={11 / (screen?.scale ?? 1)} strokeWidth={2 / (screen?.scale ?? 1)} />)}</g>}
      {(lasso || selectionPreview?.spec.kind === 'lasso') && <polygon data-selection-lasso="true" points={(lasso ?? (selectionPreview!.spec.kind === 'lasso' ? selectionPreview!.spec.points : [])).map(p => `${p.x},${p.y}`).join(' ')} fill={`${palette.ink.lasso}22`} fillRule="evenodd" stroke={palette.ink.lasso} strokeWidth={1.5 / (screen?.scale ?? 1)} pointerEvents="none" />}
      {formationPreview && (formationPreview.session.scatter ? <ScatterFormationHandles key={orientation} preview={formationPreview} project={project} snap={snap} scale={screen?.scale ?? 1}/> : formationPreview.session.bezier ? <BezierFormationHandles key={orientation} preview={formationPreview} project={project} snap={snap} scale={screen?.scale ?? 1}/> : <FormationHandles key={orientation} preview={formationPreview} field={project.field} scale={screen?.scale ?? 1} />)}
      {/* One selected performer among many: a second ring, so the eye finds it at once. */}
      {screen && selectedIds.length === 1 && displayedPositions[selectedIds[0]] && !spatialPreview && <circle className="field-single-halo" data-single-selection="" cx={displayedPositions[selectedIds[0]].x} cy={displayedPositions[selectedIds[0]].y}
        r={(display.dotRadiusPx + 8) / screen.scale} fill="none" stroke={palette.dot.ring} strokeOpacity=".55" strokeWidth={1.5 / screen.scale} pointerEvents="none" />}
      {transformPreview && <TransformHandles key={orientation} preview={transformPreview} field={project.field} scale={screen?.scale ?? 1} />}
      {screen && selectionBox && !readOnly && tool === 'select' && selectedIds.length > 1 && !spatialPreview && !formationPreview && !spacingPreview && !coordinatePreview && !selectionPreview && !transformPreview && !neighbors?.length
        && <SelectionBox key={orientation} ids={selectedIds} positions={displayedPositions} original={positions} box={selectionBox} field={project.field} scale={screen.scale} flipped={orientation === 'audience-top'} radius={display.dotRadiusPx}
          onPreview={updates => { setPreview(updates ?? {}); onMovePreview?.(updates); }} />}
      {coordinatePreview && <CoordinateGuides preview={coordinatePreview} scale={screen?.scale ?? 1} />}
      {spacingPreview && <SpacingGuides key={orientation} preview={spacingPreview} project={project} scale={screen?.scale ?? 1} flipped={orientation === 'audience-top'} />}
      {moving && Object.keys(preview).length > 0 && <g opacity={canvasActive ? 0 : 1} data-snap-preview="true" aria-hidden="true" pointerEvents="none" stroke={palette.ink.snap} strokeWidth={1 / (screen?.scale ?? 1)} strokeDasharray=".4 .3">{!canvasActive && Object.entries(preview).map(([id, point]) => <line key={id} x1={positions[id].x} y1={positions[id].y} x2={point.x} y2={point.y} />)}</g>}
      {marquee && <rect x={Math.min(marquee.start.x, marquee.current.x)} y={Math.min(marquee.start.y, marquee.current.y)} width={Math.abs(marquee.start.x - marquee.current.x)} height={Math.abs(marquee.start.y - marquee.current.y)} fill={`${palette.ink.marquee}18`} stroke={palette.ink.marquee} strokeWidth="0.15" strokeDasharray="0.6 0.4" pointerEvents="none" />}
      </g>
    </svg>

    {moving && Object.keys(preview).length > 0 && <div className="field-drag-status">Release to apply · Escape to cancel</div>}
    <div className="field-status-line">
      {!spatialPreview && <FieldReadout id={readoutId} svgRef={svgRef} geometryRef={geometryRef} orientation={orientation} project={project} facings={facings} positions={displayedPositions} selectedIds={selectedIds} coordinateFormat={coordinateFormat} viewport={viewport} readOnly={readOnly} keyboardFocusedId={keyboardFocus ? focusedId : null} presentation={display} />}
      <div id={keyboardHelpId} className="field-keyboard-help">{moveOperationPreview ? 'Review the saved and proposed paths. Enter: apply · Escape: cancel.' : travelPreview ? 'Edit handles with brackets and arrows, or draw using the panel. Enter: apply · Escape: cancel.' : coordinatePreview ? 'Enter: apply coordinates · Escape: cancel preview · Type the phrase in the Inspector.' : spacingPreview ? 'Enter: apply spacing · Escape: cancel preview · Use Inspector numbers or the interval handle to adjust.' : formationPreview ? 'Enter: apply formation · Escape: cancel preview · Use Inspector numbers or drag the field handles to adjust.' : <>Arrows browse · Space selects<span className="sr-only"> · Shift+Enter/Space: add/remove · {nudgeHelp} · Page Up/Down: roster · Home/End: first/last</span></>}</div>
    </div>
    <div className="field-stage__corner"><span className="stage-status-light" /> {isCustomSurface(project.field) ? SURFACE_NAMES[project.field.preset] : project.field.preset === 'college' ? 'NCAA FIELD' : 'HIGH SCHOOL FIELD'} <span className="field-stage__dimensions">{isCustomSurface(project.field) ? surfaceDimensionText(project.field) : `${width} × ${height.toFixed(1)} yd`}</span></div>
    <div className="field-stage__hint">{moveOperationPreview ? 'MOVE OPERATION PREVIEW' : travelPreview?.routeMode ? 'SHARED ROUTE PREVIEW' : travelPreview ? 'MOVEMENT PATH PREVIEW' : coordinatePreview ? 'COORDINATE PREVIEW' : spacingPreview ? 'SPACING PREVIEW' : formationPreview ? 'FORMATION PREVIEW' : transformPreview ? 'TRANSFORM PREVIEW' : readOnly ? 'PLAYBACK PREVIEW' : selectionPreview ? 'SELECTION PREVIEW · APPLY OR CANCEL' : tool === 'lasso' ? 'Draw lasso · Shift to add · Review before Apply' : tool === 'pan' ? 'Drag to pan' : 'Drag to select · Shift to add'}<span>Scroll to zoom · Double-click to fit{moveOperationPreview && ' · Alt-drag to pan'}</span></div>
    <div className="field-stage__orientation" aria-label={orientation === 'audience-top' ? 'Flipped field: audience and front sideline at top' : 'Audience and front sideline at bottom'}><span>↑</span> {orientation === 'audience-top' ? 'FRONT · AUDIENCE TOP' : 'BACK · AUDIENCE BOTTOM'}</div>
  </div>;
}
