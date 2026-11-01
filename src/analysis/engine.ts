import { isScheduledPath } from '../movementPaths';
import { compileTrack, detailedCollision, detailedStride } from './detailed';
import type { CompiledTrack } from './detailed';
import { PROJECT_LIMITS } from '../projectValidation';
import { spacingRuleText, strideRuleText } from './rules';
import type { TransitionIssue } from '../types';
import type { AnalysisInput, AnalysisResult, Track } from './input';

const EPSILON = 1e-8;
interface Bounds { minX: number; maxX: number; minY: number; maxY: number }
interface CachedMove { input: AnalysisInput; collisions: Map<number, TransitionIssue>; strides: Map<number, TransitionIssue>; shapes?: CompiledTrack[]; detailed: boolean }
const bounds = (p: Track): Bounds => ({ minX: Math.min(p.from.x, p.to.x), maxX: Math.max(p.from.x, p.to.x), minY: Math.min(p.from.y, p.to.y), maxY: Math.max(p.from.y, p.to.y) });
const overlaps = (a: Bounds, b: Bounds, spacing: number) => a.minX <= b.maxX + spacing && b.minX <= a.maxX + spacing && a.minY <= b.maxY + spacing && b.minY <= a.maxY + spacing;
const sameTrack = (a: Track, b: Track) => a.from.x === b.from.x && a.from.y === b.from.y && a.to.x === b.to.x && a.to.y === b.to.y && JSON.stringify(a.path) === JSON.stringify(b.path);

function stride(input: AnalysisInput, p: Track): TransitionIssue | undefined {
  const distance = Math.hypot(p.to.x - p.from.x, p.to.y - p.from.y);
  const peak = distance / input.counts * (input.transition === 'ease' ? 1.5 : 1);
  if (peak <= p.maximumStride + EPSILON) return;
  return { type: 'stride', performerIds: [p.id], severity: peak > p.maximumStride * 4 / 3 ? 'danger' : 'warning',
    message: `${p.label}: ${distance.toFixed(1)} yards in ${input.counts} counts; ${input.transition === 'ease' ? 'peak ' : ''}${(5 / peak).toFixed(1)} steps per 5 yards.${strideRuleText(p)}`, atCount: input.startCount + input.counts / 2 };
}
function collision(input: AnalysisInput, a: Track, b: Track): TransitionIssue | undefined {
  const rx = a.from.x - b.from.x, ry = a.from.y - b.from.y;
  const vx = (a.to.x - a.from.x) - (b.to.x - b.from.x), vy = (a.to.y - a.from.y) - (b.to.y - b.from.y);
  const squared = vx * vx + vy * vy;
  const closest = squared < EPSILON ? 0 : Math.max(0, Math.min(1, -(rx * vx + ry * vy) / squared));
  const distance = Math.hypot(rx + vx * closest, ry + vy * closest);
  const minimumSpacing = Math.max(a.minimumSpacing, b.minimumSpacing);
  if (distance >= minimumSpacing - EPSILON) return;
  let progress = closest;
  if (input.transition === 'ease') {
    let low = 0, high = 1;
    for (let i = 0; i < 40; i++) { const mid = (low + high) / 2; if (mid * mid * (3 - 2 * mid) < closest) low = mid; else high = mid; }
    progress = (low + high) / 2;
  }
  const atCount = input.startCount + progress * input.counts;
  return { type: 'collision', performerIds: [a.id, b.id], severity: distance < minimumSpacing / 2 ? 'danger' : 'warning',
    message: `${a.label} / ${b.label}: ${distance.toFixed(2)} yards apart near count ${Number(atCount.toFixed(1))}.${spacingRuleText(a, b)}`, atCount };
}
function compatible(a: AnalysisInput, b: AnalysisInput) {
  return a.projectKey === b.projectKey && a.modelKey === b.modelKey && a.counts === b.counts && a.tempo === b.tempo
    && a.transition === b.transition && a.startCount === b.startCount && a.minimumSpacing === b.minimumSpacing && a.maximumStride === b.maximumStride
    && a.tracks.length === b.tracks.length && a.tracks.every((p, i) => p.id === b.tracks[i].id && p.label === b.tracks[i].label && p.minimumSpacing === b.tracks[i].minimumSpacing && p.maximumStride === b.tracks[i].maximumStride && p.context === b.tracks[i].context);
}

/** LRU is bounded to four moves. Canceled work never mutates a committed cache. */
export class TransitionAnalyzer {
  private cache = new Map<string, CachedMove>();
  private projectKey = '';
  async analyze(input: AnalysisInput, canceled = () => false, yieldTask = () => new Promise<void>(resolve => setTimeout(resolve, 0))): Promise<AnalysisResult | null> {
    const started = performance.now();
    const detailed = input.tracks.some(t => isScheduledPath(t.path, input.counts) || t.path?.segments.some(s => s.kind === 'cubic'));
    if (![input.minimumSpacing, input.maximumStride, ...input.tracks.flatMap(t => [t.minimumSpacing, t.maximumStride])].every(n => Number.isFinite(n) && n >= PROJECT_LIMITS.analysisThreshold.min && n <= PROJECT_LIMITS.analysisThreshold.max)) throw new Error('Check thresholds must be between 0.1 and 5.');
    if (input.projectKey !== this.projectKey) { this.cache.clear(); this.projectKey = input.projectKey; }
    const old = this.cache.get(input.moveId), reuse = old && old.detailed === detailed && compatible(old.input, input);
    const n = input.tracks.length, dirty = new Set<number>();
    input.tracks.forEach((p, i) => { if (!reuse || !sameTrack(p, old.input.tracks[i])) dirty.add(i); });
    const mode = !reuse ? 'full' : dirty.size ? 'incremental' : 'cached';
    const collisions = reuse ? new Map(old.collisions) : new Map<number, TransitionIssue>();
    const strides = reuse ? new Map(old.strides) : new Map<number, TransitionIssue>();
    // Remove all formerly flagged pairs touching an edited performer, including
    // those that have moved outside the new broad-phase bounds.
    if (dirty.size) for (const key of collisions.keys()) if (dirty.has(Math.floor(key / n)) || dirty.has(key % n)) collisions.delete(key);
    let exactPairs = 0, visits = 0;
    let shapes: CompiledTrack[] | undefined;
    if (detailed) {
      await yieldTask(); if (canceled()) return null;
      const work = function* () {
        shapes = [];
        for (let i = 0; i < n; i++) {
          shapes.push(reuse && !dirty.has(i) && old.shapes ? old.shapes[i] : compileTrack(input.tracks[i], input.counts, input.transition));
          yield;
        }
        for (const i of dirty) { strides.delete(i); const issue = yield* detailedStride(input, input.tracks[i], shapes[i]); if (issue) strides.set(i, issue); }
        const boxes = shapes.map(s => s.bounds);
        const check = function* (a: number, b: number) {
          if (overlaps(boxes[a], boxes[b], input.minimumSpacing)) {
            exactPairs++;
            const issue = yield* detailedCollision(input, input.tracks[a], input.tracks[b], shapes![a], shapes![b]);
            if (issue) collisions.set(a * n + b, issue);
          }
          visits++; yield;
        };
        if (mode === 'full') {
          const order = boxes.map((_, i) => i).sort((a, b) => boxes[a].minX - boxes[b].minX);
          for (let i = 0; i < n; i++) for (let j = i + 1; j < n && boxes[order[j]].minX <= boxes[order[i]].maxX + input.minimumSpacing; j++) {
            yield* check(Math.min(order[i], order[j]), Math.max(order[i], order[j]));
          }
        } else if (mode === 'incremental') {
          for (const i of dirty) for (let j = 0; j < n; j++) if (i !== j && (!dirty.has(j) || i < j)) yield* check(Math.min(i, j), Math.max(i, j));
        }
      };
      let lastYield = performance.now(), steps = 0;
      for (const _ of work()) {
        if (++steps % 4096 === 0 || performance.now() - lastYield >= 8) {
          await yieldTask(); if (canceled()) return null; lastYield = performance.now();
        }
      }
    } else {
    for (const i of dirty) { strides.delete(i); const issue = stride(input, input.tracks[i]); if (issue) strides.set(i, issue); }
    const boxes = input.tracks.map(bounds);
    const check = (a: number, b: number) => {
      if (!overlaps(boxes[a], boxes[b], input.minimumSpacing)) return;
      exactPairs++;
      const issue = collision(input, input.tracks[a], input.tracks[b]);
      if (issue) collisions.set(a * n + b, issue);
    };
    if (mode === 'full') {
      const order = boxes.map((_, i) => i).sort((a, b) => boxes[a].minX - boxes[b].minX);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n && boxes[order[j]].minX <= boxes[order[i]].maxX + input.minimumSpacing; j++) {
        const a = Math.min(order[i], order[j]), b = Math.max(order[i], order[j]); check(a, b);
        if (++visits % 2048 === 0) { await yieldTask(); if (canceled()) return null; }
      }
    } else if (mode === 'incremental') {
      for (const i of dirty) for (let j = 0; j < n; j++) {
        if (i !== j && (!dirty.has(j) || i < j)) check(Math.min(i, j), Math.max(i, j));
        if (++visits % 2048 === 0) { await yieldTask(); if (canceled()) return null; }
      }
    }
    }
    if (canceled()) return null;
    // Preserve the reference's stable order for equal severity and count.
    const issues = [...[...strides].sort(([a], [b]) => a - b).map(([, issue]) => issue),
      ...[...collisions].sort(([a], [b]) => a - b).map(([, issue]) => issue)];
    issues.sort((a, b) => a.severity === b.severity ? (a.atCount ?? 0) - (b.atCount ?? 0) : a.severity === 'danger' ? -1 : 1);
    this.cache.delete(input.moveId); this.cache.set(input.moveId, { input: detailed ? structuredClone(input) : input, collisions, strides, shapes, detailed });
    if (this.cache.size > 4) this.cache.delete(this.cache.keys().next().value!);
    return { issues, stats: { mode, changedPerformers: dirty.size, possiblePairs: n * (n - 1) / 2, exactPairs, elapsedMs: performance.now() - started } };
  }
}
