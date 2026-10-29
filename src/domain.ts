import { compileTempo, secondsAt, countAt, moveTempoText } from './tempo';
import { resolveAnalysisRules, spacingRuleText, strideRuleText } from './analysis/rules';
import { affinePoint } from './transforms';
import type { LegacyDrillSet, FormationKind, FormationOptions, Move, Performer, Point, Project, Section, TimelineSample, TransitionIssue } from './types';
import { PROJECT_LIMITS } from './projectValidation';
import { migrateProjectV1, validateProjectV2 } from './projectV2';
import { coordinateDescription, coordinatePrecisionLabel } from './coordinates';
import type { CoordinateOptions } from './coordinates';
export { coordinateDescription, coordinatePrecisionLabel, COORDINATE_CONVENTIONS } from './coordinates';
export { PROJECT_LIMITS, setCountLimits, validateSetUpdate } from './projectValidation';
export { parseProjectV2 as parseProject, serializeProjectV2 as serializeProject } from './projectV2';

const EPSILON = 1e-8;
const defaultField: Project['field'] = { width: 100, height: 160 / 3, preset: 'college' };
const defaultSections: Section[] = [
  { id: 'brass', name: 'Brass', color: '#f0bf62' },
  { id: 'woodwinds', name: 'Woodwinds', color: '#b9a1e5' },
  { id: 'percussion', name: 'Percussion', color: '#85c9dd' },
  { id: 'guard', name: 'Guard', color: '#e3a08b' },
];

export function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `sq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const lerp = (a: number, b: number, progress: number) => a + (b - a) * progress;
const smoothstep = (t: number) => t * t * (3 - 2 * t);

function inverseSmoothstep(progress: number): number {
  let low = 0;
  let high = 1;
  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2;
    if (smoothstep(mid) < progress) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export function clampPoint(point: Point, field: Project['field']): Point {
  return { x: clamp(point.x, 0, field.width), y: clamp(point.y, 0, field.height) };
}

/** Fits a whole shape, preserving relative geometry instead of clipping its dots. */
export function fitFormationToField(points: Point[], field: Project['field']): Point[] {
  if (![field.width, field.height].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('Field dimensions must be positive finite numbers.');
  }
  if (!points.length) return [];
  if (!points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) {
    throw new Error('Formation positions must be finite numbers.');
  }
  const minimumX = Math.min(...points.map(point => point.x));
  const maximumX = Math.max(...points.map(point => point.x));
  const minimumY = Math.min(...points.map(point => point.y));
  const maximumY = Math.max(...points.map(point => point.y));
  const width = maximumX - minimumX;
  const height = maximumY - minimumY;
  if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error('Formation dimensions are too large.');
  const center = { x: minimumX + width / 2, y: minimumY + height / 2 };
  const scale = Math.min(1, width > 0 ? field.width / width : 1, height > 0 ? field.height / height : 1);
  const scaledMinimumX = center.x - width * scale / 2;
  const scaledMaximumX = center.x + width * scale / 2;
  const scaledMinimumY = center.y - height * scale / 2;
  const scaledMaximumY = center.y + height * scale / 2;
  const dx = scaledMinimumX < 0 ? -scaledMinimumX : scaledMaximumX > field.width ? field.width - scaledMaximumX : 0;
  const dy = scaledMinimumY < 0 ? -scaledMinimumY : scaledMaximumY > field.height ? field.height - scaledMaximumY : 0;
  return points.map(point => {
    const transformed = scale === 1
      ? { x: point.x + dx, y: point.y + dy }
      : { x: center.x + (point.x - center.x) * scale + dx, y: center.y + (point.y - center.y) * scale + dy };
    // Group bounds are already fitted; this only absorbs floating-point error
    // such as -3e-15 at a boundary, keeping serialized coordinates valid.
    return clampPoint(transformed, field);
  });
}

export function generateFormation(kind: FormationKind, count: number, options: FormationOptions): Point[] {
  if (!Number.isInteger(count) || count < 0 || count > PROJECT_LIMITS.performers) throw new Error(`Formation size must be an integer from 0 to ${PROJECT_LIMITS.performers}.`);
  if (![options.center.x, options.center.y, options.width, options.height, options.rotation, options.columns].every(Number.isFinite)) {
    throw new Error('Formation dimensions, center, rotation, and columns must be finite numbers.');
  }
  if (options.width < 0 || options.height < 0) throw new Error('Formation width and height cannot be negative.');
  if (!['line', 'arc', 'circle', 'block', 'curve'].includes(kind)) throw new Error('Unknown formation kind.');
  const radians = options.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const columns = clamp(Math.floor(options.columns), 1, Math.max(1, count));
  const rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    let x = 0;
    let y = 0;
    if (count > 1) {
      switch (kind) {
        case 'line': x = (t - 0.5) * options.width; break;
        case 'arc': {
          const angle = Math.PI * (1 - t);
          x = Math.cos(angle) * options.width / 2;
          y = Math.sin(angle) * options.height - options.height / 2;
          break;
        }
        case 'circle': {
          const angle = index / count * Math.PI * 2 - Math.PI / 2;
          x = Math.cos(angle) * options.width / 2;
          y = Math.sin(angle) * options.height / 2;
          break;
        }
        case 'block': {
          const column = index % columns;
          const row = Math.floor(index / columns);
          x = columns === 1 ? 0 : (column / (columns - 1) - 0.5) * options.width;
          y = rows === 1 ? 0 : (row / (rows - 1) - 0.5) * options.height;
          break;
        }
        case 'curve':
          x = (t - 0.5) * options.width;
          y = Math.sin((t - 0.5) * Math.PI * 2) * options.height / 2;
          break;
      }
    }
    return { x: options.center.x + x * cosine - y * sine, y: options.center.y + x * sine + y * cosine };
  });
}

export function transformPositions(
  positions: Record<string, Point>,
  ids: string[],
  transform: { dx?: number; dy?: number; rotation?: number; scale?: number },
  field: Project['field'],
): Record<string, Point> {
  const { dx = 0, dy = 0, rotation = 0, scale = 1 } = transform;
  if (![dx, dy, rotation, scale].every(Number.isFinite) || scale <= 0) throw new Error('Transforms require finite numbers and a positive scale.');
  const selected = [...new Set(ids)].filter(id => Object.hasOwn(positions, id));
  const result = Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { ...point }]));
  if (!selected.length) return result;
  if (rotation % 360 === 0 && scale === 1) {
    // A boundary stops the entire selection, preserving intervals and preventing
    // members from collapsing onto each other during a keyboard nudge.
    const selectedPoints = selected.map(id => positions[id]);
    const boundedDx = clamp(dx, -Math.min(...selectedPoints.map(point => point.x)), field.width - Math.max(...selectedPoints.map(point => point.x)));
    const boundedDy = clamp(dy, -Math.min(...selectedPoints.map(point => point.y)), field.height - Math.max(...selectedPoints.map(point => point.y)));
    selected.forEach(id => { result[id] = { x: positions[id].x + boundedDx, y: positions[id].y + boundedDy }; });
    return result;
  }
  const center = selected.reduce((sum, id) => ({ x: sum.x + positions[id].x / selected.length, y: sum.y + positions[id].y / selected.length }), { x: 0, y: 0 });
  const transformed = selected.map(id => {
    const point = affinePoint(positions[id], center, rotation, scale);
    return { x: point.x + dx, y: point.y + dy };
  });
  fitFormationToField(transformed, field).forEach((point, index) => { result[selected[index]] = point; });
  return result;
}

export function createBlankProject(): Project {
  return {
    schemaVersion: 2, id: uid(), title: 'Untitled show', ensemble: 'My ensemble',
    field: { ...defaultField }, sections: defaultSections.map(section => ({ ...section })), performers: [],
    sets: [{ id: uid(), name: 'Opening set', notes: '', positions: {} }],
    moves: [], openingTiming: { tempo: 120, transition: 'linear' },
    audioOffsetSeconds: 0,
  };
}

export function createDemoProject(): Project {
  const project = createBlankProject();
  project.title = 'Tidal forces';
  project.ensemble = 'Squidware Marching Ensemble';
  const sizes = [24, 24, 8, 8];
  project.performers = project.sections.flatMap((section, sectionIndex) => Array.from({ length: sizes[sectionIndex] }, (_, index) => ({
    id: `performer-${sectionIndex}-${index + 1}`, label: `${['B', 'W', 'P', 'G'][sectionIndex]}${index + 1}`,
    name: `${section.name} ${index + 1}`, sectionId: section.id,
  })));
  const center = { x: 50, y: 80 / 3 };
  const shapes: Point[][] = [
    generateFormation('block', 64, { center, width: 56, height: 28, rotation: 0, columns: 8 }),
    Array.from({ length: 64 }, (_, index) => {
      const row = Math.floor(index / 16);
      const angle = Math.PI * (index % 16) / 15;
      return { x: 50 - Math.cos(angle) * (34 - row * 4.5), y: 13 + Math.sin(angle) * (24 - row * 3.5) + row * 1.7 };
    }),
    Array.from({ length: 64 }, (_, index) => {
      const ring = Math.floor(index / 16);
      const angle = (index % 16) / 16 * Math.PI * 2 - Math.PI / 2;
      return { x: 50 + Math.cos(angle) * (31 - ring * 6), y: center.y + Math.sin(angle) * (21 - ring * 4) };
    }),
    generateFormation('block', 64, { center, width: 33, height: 25, rotation: 35, columns: 8 }),
    Array.from({ length: 64 }, (_, index) => {
      const row = Math.floor(index / 16);
      const t = (index % 16) / 15;
      return { x: 17 + t * 66, y: 17 + row * 6 + Math.sin(t * Math.PI * 2) * 5 };
    }),
    generateFormation('block', 64, { center: { x: 50, y: 37 }, width: 70, height: 15, rotation: 0, columns: 16 }),
  ];
  const names = ['The gathering', 'Tidal arc', 'Orbital motion', 'The prism', 'Standing wave', 'Final company'];
  const legacySets: LegacyDrillSet[] = shapes.map((points, index) => ({
    id: uid(), name: names[index], counts: [0, 32, 32, 24, 32, 32][index],
    tempo: [132, 132, 144, 144, 152, 152][index], notes: [
      'Opening picture. Establish spacing and posture before the first move.',
      'Open the arc toward the front sideline. Keep intervals consistent.',
      'Four concentric orbits. Check crossing paths in the transition inspector.',
      'Rotate into the prism. Arrive together on count 24.',
      'Let the wave breathe. Maintain horizontal alignment through the phrase.',
      'Company front finish. Hold the final picture for the release.',
    ][index], transition: index === 2 || index === 4 ? 'ease' : 'linear',
    positions: Object.fromEntries(project.performers.map((performer, performerIndex) => [performer.id, points[performerIndex]])),
  }));
  return migrateProjectV1({ ...project, schemaVersion: 1, sets: legacySets });
}

/** Timing displayed beside a picture is derived from its incoming move. */
export function setTiming(project: Project, index: number): Pick<Move, 'counts' | 'tempo' | 'transition'> {
  return index === 0 ? { counts: 0, ...project.openingTiming } : project.moves[index - 1];
}

export function totalCounts(project: Project): number {
  return project.moves.reduce((sum, move) => sum + move.counts, 0);
}

/** The arrival count of a set; its transition starts at the previous set's arrival. */
export function setStartCount(project: Project, index: number): number {
  return project.moves.slice(0, clamp(Math.floor(index), 0, project.moves.length)).reduce((sum, move) => sum + move.counts, 0);
}

/** Timeline metadata without allocating performer geometry for clock/navigation users. */
export function sampleTimeline(project: Project, count: number): Omit<TimelineSample, 'positions'> {
  const boundedCount = clamp(Number.isFinite(count) ? count : 0, 0, totalCounts(project));
  if (boundedCount === 0 || project.sets.length <= 1) {
    return { setIndex: 0, progress: 0, localCount: 0 };
  }
  let start = 0;
  for (let index = 1; index < project.sets.length; index += 1) {
    const move = project.moves[index - 1];
    if (boundedCount <= start + move.counts || index === project.sets.length - 1) {
      const localCount = clamp(boundedCount - start, 0, move.counts);
      const progress = move.counts ? localCount / move.counts : 1;
      return { setIndex: index, progress, localCount };
    }
    start += move.counts;
  }
  throw new Error('Unable to sample an invalid show timeline.');
}

/** Validated v2 moves currently support one full-count line per performer. */
export function moveEndpoints(project: Project, moveIndex: number, performerId: string): { from: Point; to: Point } | undefined {
  const move = project.moves[moveIndex];
  const fromSet = project.sets[moveIndex];
  const toSet = project.sets[moveIndex + 1];
  if (!move || move.fromSetId !== fromSet?.id || move.toSetId !== toSet?.id) return undefined;
  const from = fromSet.positions[performerId];
  const to = toSet.positions[performerId];
  return from && to ? { from, to } : undefined;
}

export function sampleProject(project: Project, count: number): TimelineSample {
  const timing = sampleTimeline(project, count);
  if (!project.sets.length) return { ...timing, positions: {} };
  if (timing.setIndex === 0) return { ...timing, positions: Object.fromEntries(Object.entries(project.sets[0].positions).map(([id, point]) => [id, { ...point }])) };
  const move = project.moves[timing.setIndex - 1];
  const positionProgress = move.transition === 'ease' ? smoothstep(timing.progress) : timing.progress;
  return { ...timing, positions: Object.fromEntries(project.performers.map(performer => {
    const { from, to } = moveEndpoints(project, timing.setIndex - 1, performer.id)!;
    return [performer.id, { x: lerp(from.x, to.x, positionProgress), y: lerp(from.y, to.y, positionProgress) }];
  })) };
}

export function countToSeconds(project: Project, count: number): number {
  if (project.tempoMap) return secondsAt(compileTempo(project).spans, clamp(Number.isFinite(count) ? count : 0, 0, totalCounts(project)));
  let remaining = clamp(Number.isFinite(count) ? count : 0, 0, totalCounts(project));
  let seconds = 0;
  for (const set of project.moves) {
    const used = Math.min(remaining, set.counts);
    seconds += used * 60 / set.tempo;
    remaining -= used;
    if (remaining <= 0) break;
  }
  return seconds;
}

export function secondsToCount(project: Project, seconds: number): number {
  if (project.tempoMap) return clamp(countAt(compileTempo(project).spans, Math.max(0, Number.isFinite(seconds) ? seconds : 0)), 0, totalCounts(project));
  let remaining = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  let count = 0;
  for (const set of project.moves) {
    const duration = set.counts * 60 / set.tempo;
    if (remaining <= duration) return count + remaining * set.tempo / 60;
    remaining -= duration;
    count += set.counts;
  }
  return count;
}

export function analyzeTransition(project: Project, setIndex: number, base?: Partial<import('./types').AnalysisThresholds>): TransitionIssue[] {
  if (!Object.values(base ?? {}).every(value => Number.isFinite(value) && value >= PROJECT_LIMITS.analysisThreshold.min && value <= PROJECT_LIMITS.analysisThreshold.max)) throw new Error('Check thresholds must be between 0.1 and 5.');
  if (!Number.isInteger(setIndex) || setIndex < 1 || setIndex >= project.sets.length) return [];
  const destination = project.sets[setIndex];
  const move = project.moves[setIndex - 1];
  const previous = project.sets[setIndex - 1];
  const issues: TransitionIssue[] = [];
  const startCount = setStartCount(project, setIndex - 1);
  const appliedRules = project.performers.map(p => resolveAnalysisRules(project, setIndex - 1, p, base));
  project.performers.forEach((performer, index) => {
    const rule = appliedRules[index], maximumStride = rule.maximumStride;
    const from = previous.positions[performer.id];
    const to = destination.positions[performer.id];
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const peakStride = distance / move.counts * (move.transition === 'ease' ? 1.5 : 1);
    if (peakStride > maximumStride + EPSILON) {
      issues.push({ type: 'stride', performerIds: [performer.id], severity: peakStride > maximumStride * 4 / 3 ? 'danger' : 'warning',
        message: `${performer.label}: ${distance.toFixed(1)} yards in ${move.counts} counts; ${move.transition === 'ease' ? 'peak ' : ''}${(5 / peakStride).toFixed(1)} steps per 5 yards.${strideRuleText(rule)}`,
        atCount: startCount + move.counts / 2 });
    }
  });
  for (let a = 0; a < project.performers.length; a += 1) {
    const first = project.performers[a];
    const firstFrom = previous.positions[first.id];
    const firstTo = destination.positions[first.id];
    for (let b = a + 1; b < project.performers.length; b += 1) {
      const second = project.performers[b];
      const secondFrom = previous.positions[second.id];
      const secondTo = destination.positions[second.id];
      const rx = firstFrom.x - secondFrom.x;
      const ry = firstFrom.y - secondFrom.y;
      const vx = (firstTo.x - firstFrom.x) - (secondTo.x - secondFrom.x);
      const vy = (firstTo.y - firstFrom.y) - (secondTo.y - secondFrom.y);
      const velocitySquared = vx * vx + vy * vy;
      const closestProgress = velocitySquared < EPSILON ? 0 : clamp(-(rx * vx + ry * vy) / velocitySquared, 0, 1);
      const distance = Math.hypot(rx + vx * closestProgress, ry + vy * closestProgress);
      const minimumSpacing = Math.max(appliedRules[a].minimumSpacing, appliedRules[b].minimumSpacing);
      if (distance < minimumSpacing - EPSILON) {
        const timeProgress = move.transition === 'ease' ? inverseSmoothstep(closestProgress) : closestProgress;
        const atCount = startCount + timeProgress * move.counts;
        issues.push({ type: 'collision', performerIds: [first.id, second.id], severity: distance < minimumSpacing / 2 ? 'danger' : 'warning',
          message: `${first.label} / ${second.label}: ${distance.toFixed(2)} yards apart near count ${Number(atCount.toFixed(1))}.${spacingRuleText(appliedRules[a], appliedRules[b])}`, atCount });
      }
    }
  }
  return issues.sort((a, b) => (a.severity === b.severity ? (a.atCount ?? 0) - (b.atCount ?? 0) : a.severity === 'danger' ? -1 : 1));
}

/** Accepts supported imports; the editor always receives a canonical v2 project. */
export function validateProject(input: unknown): Project {
  if (input && typeof input === 'object' && 'schemaVersion' in input && input.schemaVersion === 1) return migrateProjectV1(input);
  return validateProjectV2(input);
}

/** Reuse unchanged geometry only within structurally shared immutable edits. */
export function validateProjectEdit(previous: Project, next: Project): void {
  const rosterChanged = next.performers.length !== previous.performers.length
    || next.performers.some((performer, index) => performer.id !== previous.performers[index].id);
  const dimensionsChanged = next.field.width !== previous.field.width || next.field.height !== previous.field.height;
  validateProjectV2(next, rosterChanged || dimensionsChanged ? {} : { validatedPositions: new Set(previous.sets.map(set => set.positions)) });
}

function parseCsv(text: string): string[][] {
  if (text.length > 2_000_000) throw new Error('Roster CSV is too large. The limit is 2 MB.');
  const source = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let closedQuote = false;
  const endCell = () => { row.push(cell); cell = ''; closedQuote = false; };
  const endRow = () => {
    endCell();
    if (row.some(value => value.trim() !== '')) rows.push(row);
    row = [];
    if (rows.length > PROJECT_LIMITS.performers + 1) throw new Error(`A roster can contain at most ${PROJECT_LIMITS.performers} performers.`);
  };
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') { cell += '"'; index += 1; }
        else { quoted = false; closedQuote = true; }
      } else cell += char;
    } else if (char === ',') endCell();
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      endRow();
    } else if (char === '"') {
      if (cell !== '' || closedQuote) throw new Error(`CSV row ${rows.length + 1}: quote must begin a field.`);
      quoted = true;
    } else if (closedQuote) {
      if (char !== ' ' && char !== '\t') throw new Error(`CSV row ${rows.length + 1}: unexpected text after closing quote.`);
    } else cell += char;
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  if (cell || row.length || closedQuote) endRow();
  return rows;
}

export function importRosterCsv(text: string, sections: Section[]): Performer[] {
  if (!sections.length) throw new Error('Create a section before importing a roster.');
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('CSV must contain a header and at least one performer. Use label,name,section.');
  const headers = rows[0].map(header => header.trim().toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error('CSV contains duplicate column headers.');
  const labelIndex = headers.indexOf('label');
  const nameIndex = headers.indexOf('name');
  const sectionIndex = headers.includes('section') ? headers.indexOf('section') : headers.indexOf('sectionid');
  if (labelIndex < 0) throw new Error('CSV must include a label column. Recommended header: label,name,section.');
  const seenLabels = new Set<string>();
  return rows.slice(1).map((row, index) => {
    const rowNumber = index + 2;
    if (row.length !== headers.length) throw new Error(`CSV row ${rowNumber}: expected ${headers.length} columns, found ${row.length}. Quote names containing commas.`);
    const label = row[labelIndex].trim();
    const name = nameIndex >= 0 ? row[nameIndex].trim() : '';
    const sectionName = sectionIndex >= 0 ? row[sectionIndex].trim() : '';
    if (!label || label.length > PROJECT_LIMITS.text.performerLabel) throw new Error(`CSV row ${rowNumber}: label must have 1 to ${PROJECT_LIMITS.text.performerLabel} characters.`);
    if (name.length > PROJECT_LIMITS.text.performerName) throw new Error(`CSV row ${rowNumber}: name must have at most ${PROJECT_LIMITS.text.performerName} characters.`);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(label + name)) throw new Error(`CSV row ${rowNumber}: label or name contains an unsupported control character.`);
    if (seenLabels.has(label.toLowerCase())) throw new Error(`CSV row ${rowNumber}: duplicate label "${label}".`);
    seenLabels.add(label.toLowerCase());
    const section = !sectionName ? sections[0] : sections.find(item => item.name.toLowerCase() === sectionName.toLowerCase() || item.id.toLowerCase() === sectionName.toLowerCase());
    if (!section) throw new Error(`CSV row ${rowNumber}: unknown section "${sectionName}". Available sections: ${sections.map(item => item.name).join(', ')}.`);
    return { id: uid(), label, name, sectionId: section.id };
  });
}

function csvCell(value: string | number): string {
  const raw = String(value);
  // Excel and LibreOffice can interpret formula-like strings even inside CSV quotes.
  const safe = typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export interface PerformerMoveOutput {
  kind: 'opening' | 'hold' | 'move'; counts: number; arrival: string; direction: string;
  distanceYards: number; averageStepsPerFive: number | null; peakStepsPerFive: number | null;
  description: string;
}

/** Uses the same ordered move endpoints and easing profile as playback and analysis. */
export function performerMoveOutput(project: Project, index: number, performerId: string, options: CoordinateOptions = {}): PerformerMoveOutput {
  const point = project.sets[index]?.positions[performerId];
  if (!Number.isInteger(index) || !point) throw new Error('Move output requires a known performer and arrival set.');
  const arrival = coordinateDescription(point, project.field, options);
  if (index === 0) return { kind: 'opening', counts: 0, arrival, direction: 'Opening position', distanceYards: 0, averageStepsPerFive: null, peakStepsPerFive: null, description: 'Opening position' };
  const endpoints = moveEndpoints(project, index - 1, performerId);
  const move = project.moves[index - 1];
  if (!endpoints || !move || move.counts <= 0) throw new Error('Move output requires a valid incoming move.');
  const dx = endpoints.to.x - endpoints.from.x; const dy = endpoints.to.y - endpoints.from.y;
  const distanceYards = Math.hypot(dx, dy);
  if (distanceYards <= EPSILON) return { kind: 'hold', counts: move.counts, arrival, direction: 'Hold', distanceYards, averageStepsPerFive: null, peakStepsPerFive: null, description: `Hold for ${move.counts} ${move.counts === 1 ? 'count' : 'counts'}` };
  const direction = 'Toward ' + [Math.abs(dx) > distanceYards * 1e-9 ? dx > 0 ? 'Side 2' : 'Side 1' : '', Math.abs(dy) > distanceYards * 1e-9 ? dy > 0 ? 'front sideline' : 'back sideline' : ''].filter(Boolean).join(' and ');
  const averageStepsPerFive = 5 * move.counts / distanceYards;
  // Smoothstep has a peak derivative of 1.5, so its largest step is 1.5 × average.
  const peakStepsPerFive = averageStepsPerFive / (move.transition === 'ease' ? 1.5 : 1);
  const size = (value: number) => value < .005 ? '<0.01' : String(Number(value.toFixed(2)));
  return { kind: 'move', counts: move.counts, arrival, direction, distanceYards, averageStepsPerFive, peakStepsPerFive,
    description: `${direction}. Average ${size(averageStepsPerFive)} steps per 5 yd${move.transition === 'ease' ? `; peak ${size(peakStepsPerFive)} steps per 5 yd (eased)` : ''}.` };
}

export function exportCoordinatesCsv(project: Project, options: CoordinateOptions = {}): string {
  const checked = validateProject(project);
  const rows: (string | number)[][] = [['Set', 'Arrival count', 'Move counts', 'Tempo', 'Label', 'Name', 'Section', 'X (yards)', 'Y (yards)', 'Coordinate', 'Notes', 'Coordinate precision', 'Travel (yards)', 'Average step size (steps/5 yd)', 'Peak step size (steps/5 yd)', 'Direction']];
  const sectionNames = new Map(checked.sections.map(section => [section.id, section.name]));
  checked.sets.forEach((set, index) => checked.performers.forEach(performer => {
    const point = set.positions[performer.id];
    const move = performerMoveOutput(checked, index, performer.id, options);
    rows.push([set.name, setStartCount(checked, index), move.counts, setTiming(checked, index).tempo, performer.label, performer.name, sectionNames.get(performer.sectionId) ?? '', Number(point.x.toFixed(3)), Number(point.y.toFixed(3)), move.arrival, set.notes, coordinatePrecisionLabel(options), Number(move.distanceYards.toFixed(3)), move.averageStepsPerFive === null ? '' : Number(move.averageStepsPerFive.toFixed(3)), move.peakStepsPerFive === null ? '' : Number(move.peakStepsPerFive.toFixed(3)), move.direction]);
  }));
  if (checked.tempoMap) {
    rows[0][3] = 'Base tempo'; rows[0].push('Timing map', 'Arrival seconds', 'Incoming seconds');
    for (let i=1;i<rows.length;i++) {
      const index=Math.floor((i-1)/checked.performers.length), arrival=countToSeconds(checked,setStartCount(checked,index));
      rows[i].push(moveTempoText(checked,index),Number(arrival.toFixed(6)),Number((arrival-countToSeconds(checked,setStartCount(checked,Math.max(0,index-1)))).toFixed(6)));
    }
  }
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
