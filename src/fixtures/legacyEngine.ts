// Frozen v1 timing/analysis oracle for migration regressions; never used by the editor.
import type { LegacyProject as Project, TimelineSample, TransitionIssue } from '../types';
import { validateLegacyProject as validateProject } from '../projectValidation';
import { coordinateDescription } from '../domain';
const EPSILON = 1e-8;
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


export function totalCounts(project: Project): number {
  return project.sets.slice(1).reduce((sum, set) => sum + set.counts, 0);
}

/** The arrival count of a set; its transition starts at the previous set's arrival. */
export function setStartCount(project: Project, index: number): number {
  return project.sets.slice(1, clamp(Math.floor(index) + 1, 1, project.sets.length)).reduce((sum, set) => sum + set.counts, 0);
}

export function sampleProject(project: Project, count: number): TimelineSample {
  if (!project.sets.length) return { positions: {}, setIndex: 0, progress: 0, localCount: 0 };
  const boundedCount = clamp(Number.isFinite(count) ? count : 0, 0, totalCounts(project));
  if (boundedCount === 0 || project.sets.length === 1) {
    return { positions: Object.fromEntries(Object.entries(project.sets[0].positions).map(([id, point]) => [id, { ...point }])), setIndex: 0, progress: 0, localCount: 0 };
  }
  let start = 0;
  for (let index = 1; index < project.sets.length; index += 1) {
    const set = project.sets[index];
    if (boundedCount <= start + set.counts || index === project.sets.length - 1) {
      const localCount = clamp(boundedCount - start, 0, set.counts);
      const progress = set.counts ? localCount / set.counts : 1;
      const positionProgress = set.transition === 'ease' ? smoothstep(progress) : progress;
      const previous = project.sets[index - 1];
      return {
        positions: Object.fromEntries(project.performers.map(performer => {
          const from = previous.positions[performer.id];
          const to = set.positions[performer.id];
          return [performer.id, { x: lerp(from.x, to.x, positionProgress), y: lerp(from.y, to.y, positionProgress) }];
        })), setIndex: index, progress, localCount,
      };
    }
    start += set.counts;
  }
  throw new Error('Unable to sample an invalid show timeline.');
}

export function countToSeconds(project: Project, count: number): number {
  let remaining = clamp(Number.isFinite(count) ? count : 0, 0, totalCounts(project));
  let seconds = 0;
  for (const set of project.sets.slice(1)) {
    const used = Math.min(remaining, set.counts);
    seconds += used * 60 / set.tempo;
    remaining -= used;
    if (remaining <= 0) break;
  }
  return seconds;
}

export function secondsToCount(project: Project, seconds: number): number {
  let remaining = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  let count = 0;
  for (const set of project.sets.slice(1)) {
    const duration = set.counts * 60 / set.tempo;
    if (remaining <= duration) return count + remaining * set.tempo / 60;
    remaining -= duration;
    count += set.counts;
  }
  return count;
}

export function analyzeTransition(project: Project, setIndex: number): TransitionIssue[] {
  if (!Number.isInteger(setIndex) || setIndex < 1 || setIndex >= project.sets.length) return [];
  const destination = project.sets[setIndex];
  const previous = project.sets[setIndex - 1];
  const issues: TransitionIssue[] = [];
  const startCount = setStartCount(project, setIndex - 1);
  project.performers.forEach(performer => {
    const from = previous.positions[performer.id];
    const to = destination.positions[performer.id];
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const peakStride = distance / destination.counts * (destination.transition === 'ease' ? 1.5 : 1);
    if (peakStride > 1.25 + EPSILON) {
      issues.push({ type: 'stride', performerIds: [performer.id], severity: peakStride > 5 / 3 ? 'danger' : 'warning',
        message: `${performer.label}: ${distance.toFixed(1)} yards in ${destination.counts} counts; ${destination.transition === 'ease' ? 'peak ' : ''}${(5 / peakStride).toFixed(1)} steps per 5 yards.`,
        atCount: startCount + destination.counts / 2 });
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
      if (distance < 1 - EPSILON) {
        const timeProgress = destination.transition === 'ease' ? inverseSmoothstep(closestProgress) : closestProgress;
        const atCount = startCount + timeProgress * destination.counts;
        issues.push({ type: 'collision', performerIds: [first.id, second.id], severity: distance < 0.5 ? 'danger' : 'warning',
          message: `${first.label} / ${second.label}: ${distance.toFixed(2)} yards apart near count ${Number(atCount.toFixed(1))}.`, atCount });
      }
    }
  }
  return issues.sort((a, b) => (a.severity === b.severity ? (a.atCount ?? 0) - (b.atCount ?? 0) : a.severity === 'danger' ? -1 : 1));
}

function csvCell(value: string | number): string {
  const raw = String(value);
  // Excel and LibreOffice can interpret formula-like strings even inside CSV quotes.
  const safe = typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function exportCoordinatesCsv(project: Project): string {
  const checked = validateProject(project);
  const rows: (string | number)[][] = [['Set', 'Arrival count', 'Move counts', 'Tempo', 'Label', 'Name', 'Section', 'X (yards)', 'Y (yards)', 'Coordinate', 'Notes']];
  const sectionNames = new Map(checked.sections.map(section => [section.id, section.name]));
  checked.sets.forEach((set, index) => checked.performers.forEach(performer => {
    const point = set.positions[performer.id];
    rows.push([set.name, setStartCount(checked, index), set.counts, set.tempo, performer.label, performer.name, sectionNames.get(performer.sectionId) ?? '', Number(point.x.toFixed(3)), Number(point.y.toFixed(3)), coordinateDescription(point, checked.field), set.notes]);
  }));
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

