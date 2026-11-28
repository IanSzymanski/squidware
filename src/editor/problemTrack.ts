import { formatYards } from '../coordinates';
import { setStartCount } from '../domain';
import { DEFAULT_SNAPPING } from '../snapping';
import { isCustomSurface, surfaceUnits, yardsInUnit } from '../surfaces';
import { formatTimelineCount } from './timelineNavigation';
import type { Finding, MoveCheck } from '../analysis/show';
import type { Project, TransitionIssue } from '../types';

/** Minimum pointer target (WCAG 2.5.8) for every control in the timeline problem row, in CSS pixels. */
export const PROBLEM_TARGET = 24;
/** A group list renders at most this many findings; Show-wide problems pages through the rest. */
export const GROUP_LIST_LIMIT = 500;
/** Groups this large show the capped four-character badge “99k+”. */
export const BADGE_CAP = 100000;
/** Marker width for a row holding a capped group: at 11 px, “99k+” needs about 28 px in DejaVu Sans Bold, the widest
 * common fallback face, and 24 px in Inter. */
export const CAPPED_TARGET = 32;
interface Part { move: MoveCheck; issues: TransitionIssue[]; from: number; to: number }
/** A marker covers `left`…`left + width` track pixels and every finding drawn inside that span.
 * `people` holds up to three performer or prop IDs in order of appearance; `others` marks more. */
export interface ProblemCluster { key: string; left: number; width: number; size: number; danger: number; spacing: number; clearance: number; first: number; last: number; people: string[]; others: boolean; parts: Part[] }
export type ProblemLabels = ReadonlyMap<string, string>;
/** Findings within one track pixel of a move: counts, severity/type totals and up to four distinct participants. */
interface Bucket { from: number; to: number; x0: number; x1: number; danger: number; spacing: number; clearance: number; ids: string[] }
type Placed = Bucket & { move: MoveCheck; issues: TransitionIssue[] };

const at = (issue: TransitionIssue) => issue.atCount ?? 0;
const participants = (issue: TransitionIssue) => issue.propIds ? [...issue.performerIds, ...issue.propIds] : issue.performerIds;
const cache = new WeakMap<TransitionIssue[], { issues: TransitionIssue[]; min: number; max: number; view?: { start: number; span: number; width: number; buckets: Bucket[] } }>();
/** One sorted copy per immutable worker result and one bucketed viewport: a worker reply rebuckets only its own move,
 * so a dense show is not rescanned for every reply. */
function moveBuckets(issues: TransitionIssue[], start: number, span: number, width: number) {
  let cached = cache.get(issues);
  if (!cached) {
    const sorted = [...issues].sort((a, b) => at(a) - at(b));
    cached = { issues: sorted, min: sorted.length ? at(sorted[0]) : Infinity, max: sorted.length ? at(sorted[sorted.length - 1]) : -Infinity };
    cache.set(issues, cached);
  }
  const { issues: sorted, min, max } = cached, end = start + span;
  if (min > end || max < start) return { sorted, buckets: [] as Bucket[] };
  const view = cached.view;
  if (view && view.start === start && view.span === span && view.width === width) return { sorted, buckets: view.buckets };
  let i = 0, high = sorted.length;
  while (i < high) { const mid = (i + high) >> 1; if (at(sorted[mid]) < start) i = mid + 1; else high = mid; }
  const buckets: Bucket[] = [];
  for (let bucket: Bucket | undefined; i < sorted.length && at(sorted[i]) <= end; i++) {
    const issue = sorted[i], x = (at(issue) - start) / span * width;
    if (!bucket || Math.floor(x) !== Math.floor(bucket.x0)) buckets.push(bucket = { from: i, to: i, x0: x, x1: x, danger: 0, spacing: 0, clearance: 0, ids: [] });
    bucket.to = i + 1; bucket.x1 = x; bucket.danger += Number(issue.severity === 'danger'); bucket.spacing += Number(issue.type === 'collision');
    bucket.clearance += Number(issue.type === 'clearance');
    for (const id of participants(issue)) if (bucket.ids.length < 4 && !bucket.ids.includes(id)) bucket.ids.push(id);
  }
  cached.view = { start, span, width, buckets };
  return { sorted, buckets };
}

/** Findings closer than one target chain together; each chain splits into equal tiles at least one target wide.
 * Markers therefore never overlap, each is at least `target` wide, and each contains its findings' positions
 * (to within the one-pixel buckets that keep dense shows cheap). Moves are sequential, so their buckets concatenate in order. */
export function problemClusters(moves: readonly MoveCheck[], start: number, span: number, width: number, target = PROBLEM_TARGET): ProblemCluster[] {
  const all: Placed[] = [];
  for (const move of moves) {
    if (move.status !== 'ready' || !move.issues.length) continue;
    const { sorted, buckets } = moveBuckets(move.issues, start, span, width);
    for (const b of buckets) all.push({ ...b, move, issues: sorted });
  }
  for (let i = 1; i < all.length; i++) if (all[i].x0 < all[i - 1].x0) { all.sort((a, b) => a.x0 - b.x0 || a.move.index - b.move.index); break; }
  const clusters = tileChains(all, width, target);
  // “99k+” is wider than one target: a row holding a capped group tiles again with markers wide enough for it.
  return target < CAPPED_TARGET && clusters.some(c => c.size >= BADGE_CAP && c.width < CAPPED_TARGET) ? tileChains(all, width, CAPPED_TARGET) : clusters;
}
/** Markers wider than one target center on findings at most half a target inside the track's ends, so none reaches
 * further past the track than a 24 px marker does (the padded timeline viewport shows that much, focus ring included). */
function tileChains(all: Placed[], width: number, target: number) {
  const inset = (target - PROBLEM_TARGET) / 2, x0 = (b: Placed) => Math.min(Math.max(b.x0, inset), width - inset), x1 = (b: Placed) => Math.min(Math.max(b.x1, inset), width - inset);
  const clusters: ProblemCluster[] = [];
  for (let i = 0; i < all.length;) {
    let j = i + 1;
    while (j < all.length && x0(all[j]) - x1(all[j - 1]) < target) j++;
    const left = x0(all[i]) - target / 2, total = x1(all[j - 1]) - x0(all[i]) + target, tiles = Math.max(1, Math.floor(total / target + 1e-9)), tile = total / tiles;
    for (let t = 0, k = i; t < tiles && k < j; t++) {
      const from = k, right = t === tiles - 1 ? Infinity : left + (t + 1) * tile;
      while (k < j && x0(all[k]) < right) k++;
      if (k === from) continue;
      const group = all.slice(from, k), head = group[0], firstIssue = head.issues[head.from], tail = group[group.length - 1], ids: string[] = [];
      let others = false;
      for (const b of group) { for (const id of b.ids) if (!ids.includes(id)) ids.push(id); if (ids.length > 3) { others = true; break; } }
      clusters.push({ key: `${head.move.moveId}:${at(firstIssue)}:${firstIssue.type}:${participants(firstIssue).join(',')}`, left: left + t * tile, width: tile,
        size: group.reduce((n, b) => n + b.to - b.from, 0), danger: group.reduce((n, b) => n + b.danger, 0), spacing: group.reduce((n, b) => n + b.spacing, 0),
        clearance: group.reduce((n, b) => n + b.clearance, 0),
        first: at(firstIssue), last: at(tail.issues[tail.to - 1]), people: ids.slice(0, 3), others, parts: group.map(b => ({ move: b.move, issues: b.issues, from: b.from, to: b.to })) });
    }
    i = j;
  }
  return clusters;
}
/** The group's findings in show-count order, materialized on demand (at most `limit`). */
export function clusterFindings(cluster: ProblemCluster, limit = Infinity): Finding[] {
  const rows: Finding[] = [];
  for (const { move, issues, from, to } of cluster.parts) for (let i = from; i < to && rows.length < limit; i++) rows.push({ index: move.index, moveId: move.moveId, issue: issues[i] });
  return rows;
}

export const problemLabels = (project: Project): ProblemLabels => new Map([
  ...project.performers.map(p => [p.id, p.label] as const), ...(project.stagingObjects ?? []).map(p => [p.id, p.name] as const),
]);
export const findingLocation = (project: Project, index: number) => index === 0 ? `Opening set · ${project.sets[0].name}`
  : `Move ${index} · Set ${index} → ${index + 1} · ${project.sets[index].name}`;
/** Whole counts for names and help; navigation keeps the exact count. */
export const wholeCount = (count: number) => String(Math.round(count) || 0);
export const findingType = (issue: TransitionIssue) => issue.type === 'collision' ? 'Spacing' : issue.type === 'stride' ? 'Stride' : 'Clearance';
const twoPlaces = (value: number) => formatYards(Math.round(value * 100) / 100);
/** The measured quantity: detailed bounds when present, else the value the straight-line engine states in its message. */
export function findingQuantity(issue: TransitionIssue): string | undefined {
  if (issue.type === 'clearance') return;
  const m = issue.measurement;
  if (m) { const low = twoPlaces(m.lower), high = twoPlaces(m.upper); return `${low === high ? low : `${low}–${high}`} ${m.unit}`; }
  const value = issue.type === 'collision' ? /(\d+(?:\.\d+)?) yards apart/.exec(issue.message) : /(\d+(?:\.\d+)?) steps per 5 yards/.exec(issue.message);
  return value ? issue.type === 'collision' ? `${formatYards(Number(value[1]))} yd` : `${value[1]} steps per 5 yd` : undefined;
}
const label = (id: string, labels: ProblemLabels) => labels.get(id) ?? id;
/** “Spacing 1.13 yd · B4, B5 · count 6”: type and measurement, performers, whole show count. */
export function findingName(issue: TransitionIssue, labels: ProblemLabels): string {
  const quantity = findingQuantity(issue);
  const count = issue.type === 'clearance' ? formatTimelineCount(at(issue)) : wholeCount(at(issue));
  return `${findingType(issue)}${quantity ? ` ${quantity}` : ''} · ${participants(issue).map(id => label(id, labels)).join(', ')} · count ${count}`;
}
const countRange = (first: number, last: number) => wholeCount(first) === wholeCount(last) ? `count ${wholeCount(first)}` : `counts ${wholeCount(first)}–${wholeCount(last)}`;
/** “12 problems (9 spacing, 3 stride) · B4, B5, W2 and others · counts 30–34”; a single finding uses its own name.
 * An abbreviated badge leads the name (“12k · 12345 spacing problems · …”), so the visible label is in the name (WCAG 2.5.3). */
export function clusterName(cluster: ProblemCluster, labels: ProblemLabels): string {
  if (cluster.size === 1) return findingName(cluster.parts[0].issues[cluster.parts[0].from], labels);
  const stride = cluster.size - cluster.spacing - cluster.clearance, badge = clusterBadge(cluster.size);
  const types = [cluster.spacing && `${cluster.spacing} spacing`, stride && `${stride} stride`, cluster.clearance && `${cluster.clearance} clearance`].filter(Boolean);
  const kinds = types.length === 1 ? `${types[0]} problems` : `${cluster.size} problems (${types.join(', ')})`;
  return `${badge === String(cluster.size) ? '' : `${badge} · `}${kinds} · ${cluster.people.map(id => label(id, labels)).join(', ')}${cluster.others ? ' and others' : ''} · ${countRange(cluster.first, cluster.last)}`;
}
/** Severity text, the non-color counterpart of the marker glyph or badge. */
export function clusterSeverity(cluster: ProblemCluster): string {
  const warnings = cluster.size - cluster.danger;
  return cluster.size === 1 ? cluster.danger ? 'Danger' : 'Warning' : [cluster.danger && `${cluster.danger} danger`, warnings && `${warnings} warning`].filter(Boolean).join(', ');
}
/** Visible group size that fits its marker: exact below 1000, whole thousands (rounded down) below 100,000, then “99k+”,
 * so it is never numerically wrong. The name starts with an abbreviated badge and carries the exact size. */
export const clusterBadge = (size: number) => size < 1000 ? String(size) : size < BADGE_CAP ? `${Math.floor(size / 1000)}k` : '99k+';

/** Roving focus within the problem row (horizontal) or a group's list (vertical). Null leaves the key to the browser. */
export function rovingIndex(key: string, index: number, count: number, orientation: 'horizontal' | 'vertical'): number | null {
  if (!count) return null;
  const [back, forward] = orientation === 'horizontal' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
  const current = Math.max(0, Math.min(count - 1, index));
  return key === forward ? Math.min(count - 1, current + 1) : key === back ? Math.max(0, current - 1) : key === 'Home' ? 0 : key === 'End' ? count - 1 : null;
}
/** The marker the row last focused: its group, first count and moves. */
export interface Remembered { key: string; count: number; moves: readonly string[] }
/** A recheck emptied the row under the remembered marker while one of its moves is pending again, or while any move is
 * pending once none of its moves is left (an undo or redo replaced them, as undoing a transition split replaces the
 * first half's move). An empty row with only other moves pending while the marker's moves remain (a count window
 * without findings) is not the row's to wait for. */
export function awaitsRecheck(moves: readonly MoveCheck[], remembered: Remembered | null) {
  if (!remembered) return false;
  const replaced = !moves.some(m => remembered.moves.includes(m.moveId));
  return moves.some(m => m.status === 'pending' && (replaced || remembered.moves.includes(m.moveId)));
}
/** The remembered marker after regrouping: the same group, else the group nearest its count, else the first. */
export function activeCluster(clusters: readonly ProblemCluster[], remembered: { key: string; count: number } | null): number {
  if (!clusters.length) return -1;
  if (!remembered) return 0;
  const same = clusters.findIndex(c => c.key === remembered.key);
  if (same >= 0) return same;
  const distance = (c: ProblemCluster) => remembered.count < c.first ? c.first - remembered.count : Math.max(0, remembered.count - c.last);
  let best = 0;
  clusters.forEach((c, i) => { if (distance(c) < distance(clusters[best])) best = i; });
  return best;
}

/** How a writer reads a finding: who, what went wrong, by how much, and where, in steps rather than yards. */
export interface FindingSummary { headline: string; detail: string; where: string }
const names = (ids: string[]) => ids.length <= 2 ? ids.join(' and ') : `${ids.slice(0, -1).join(', ')} and ${ids[ids.length - 1]}`;
const trim = (value: number) => String(Number(value.toFixed(1)));
export function findingSummary(issue: TransitionIssue, project: Project, index: number, labels: ProblemLabels): FindingSummary {
  const custom = isCustomSurface(project.field), unit = surfaceUnits(project.field), stepYards = 5 / (project.snapping ?? DEFAULT_SNAPPING).steps;
  const length = (yards: number) => custom ? `${trim(yardsInUnit(yards, unit))} ${unit}` : `${trim(yards / stepYards)} ${Math.abs(yards / stepYards - 1) < .05 ? 'step' : 'steps'}`;
  const range = (low: number, high: number) => { const a = length(low), b = length(high); return a === b ? a : `${a.split(' ')[0]}–${b}`; };
  const who = names(participants(issue).map(id => label(id, labels)));
  const local = index === 0 ? at(issue) : at(issue) - setStartCount(project, index - 1);
  const where = index === 0 ? 'Opening set' : `Set ${index} → ${index + 1} · ct ${wholeCount(local)}`;
  const m = issue.measurement, number = (pattern: RegExp) => { const found = pattern.exec(issue.message); return found ? Number(found[1]) : undefined; };
  if (issue.type === 'stride') {
    const limit = number(/minimum ([\d.]+) steps per 5 yd/), engine = number(/([\d.]+) steps per 5 yards/);
    const size = m ? (m.upper > 0 ? `${trim(5 / m.upper)}-to-5` : '') : engine !== undefined ? `${trim(engine)}-to-5` : '';
    return { headline: `${who}: step too big`, detail: [size, limit !== undefined && `limit ${trim(limit)}-to-5`].filter(Boolean).join(' · '), where };
  }
  if (issue.type === 'collision') {
    const minimum = number(/Minimum ([\d.]+) yd/), apart = m ? range(Math.max(0, m.lower), Math.max(0, m.upper)) : (() => { const v = number(/([\d.]+) yards apart/); return v === undefined ? '' : length(v); })();
    return { headline: `${who} too close`, detail: [apart && `${apart} apart`, minimum !== undefined && `needs ${length(minimum)}`].filter(Boolean).join(' · '), where };
  }
  const overlap = number(/overlap by ([\d.]+) yd/), gap = number(/([\d.]+) yd edge gap/), required = number(/Required edge gap ([\d.]+) yd/);
  const measured = overlap !== undefined ? `overlap ${length(overlap)}` : gap !== undefined ? `${length(gap)} apart` : 'may touch';
  return { headline: `${who} too close`, detail: [measured, required !== undefined && `needs ${length(required)}`].filter(Boolean).join(' · '), where };
}
