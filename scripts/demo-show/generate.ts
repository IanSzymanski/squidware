// Builds the "Tether" demo production from Squidwriter's Space show timing, validates it with the real codec,
// runs show-wide analysis and writes examples/ plus review data. Run: node scripts/demo-show/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { parseProject, serializeProject, validateProject, countToSeconds, totalCounts } from '../../src/domain';
import { transitionInput } from '../../src/analysis/input';
import { TransitionAnalyzer } from '../../src/analysis/engine';
import { effectiveMove } from '../../src/groupMotion';
import { sampleMovement } from '../../src/movementPaths';
import type { Meter, Performer, Point, Project, Section } from '../../src/types';
import { FIELD, P, Show } from './lib';
import { SECTION_OF } from './forms';
import { buildShow, CAST } from './show';
import timing from './space-show-timing.json';

const root = path.resolve(process.cwd());
const T = timing as unknown as { movements: { title: string; offsetCount: number; offsetSeconds: number; counts: number; seconds: number; bars: { bar: number; count: number; meter: number[] }[]; tempo: { count: number; bpm: number; ramp: boolean }[]; rehearsal: Record<string, string>; times: number[]; gapAfter: number }[]; totalCounts: number };

// ---- timing ---------------------------------------------------------------------------------------------
function trueSeconds(count: number): number {
  for (const m of T.movements) if (count <= m.offsetCount + m.counts) {
    const local = count - m.offsetCount, i = Math.floor(local), f = local - i;
    return m.offsetSeconds + (f ? m.times[i] + (m.times[i + 1] - m.times[i]) * f : m.times[i]);
  }
  return T.movements.at(-1)!.offsetSeconds + T.movements.at(-1)!.seconds;
}
function bpmAt(count: number): number {
  const m = [...T.movements].reverse().find(x => count >= x.offsetCount)!, local = count - m.offsetCount;
  let k = 0; for (let i = 0; i < m.tempo.length; i++) if (m.tempo[i].count <= local) k = i;
  const e = m.tempo[k], n = m.tempo[k + 1];
  return e.ramp && n ? e.bpm + (n.bpm - e.bpm) * (local - e.count) / (n.count - e.count) : e.bpm;
}
function tempoMap(): Project['tempoMap'] {
  const regions: NonNullable<Project['tempoMap']>['regions'] = [];
  for (const m of T.movements) {
    // Fractional ramp points round to whole counts; recording anchors absorb the difference.
    m.tempo.forEach((e, i) => {
      const next = m.tempo[i + 1], start = m.offsetCount + Math.round(e.count), end = m.offsetCount + Math.round(next?.count ?? m.counts);
      if (end > start) regions.push({ startCount: start, endCount: end, startTempo: e.bpm, endTempo: e.ramp && next ? next.bpm : e.bpm });
    });
  }
  const holds = T.movements.slice(0, -1).map(m => ({ count: m.offsetCount + m.counts, seconds: m.gapAfter }));
  return { version: 1, regions, holds };
}
const METERS: Record<string, Meter> = {
  '4,4': { numerator: 4, denominator: 4, grouping: [4] }, '6,4': { numerator: 6, denominator: 4, grouping: [3, 3] },
  '3,4': { numerator: 3, denominator: 4, grouping: [3] }, '5,4': { numerator: 5, denominator: 4, grouping: [3, 2] }, '2,4': { numerator: 2, denominator: 4, grouping: [2] },
};
function scoreMap(): Project['score'] {
  const changes: NonNullable<Project['score']>['changes'] = [], marks: NonNullable<Project['score']>['marks'] = [];
  let meter = '4,4';
  const short: Record<string, string> = { 'Event Horizon': 'EH', 'Gravity Assist': 'GA', Tether: 'TE', Reentry: 'RE' };
  for (const m of T.movements) {
    for (const b of m.bars) {
      const g = m.offsetCount + b.count;
      const key = b.meter.join(',');
      if (key !== meter && g > 0) changes.push({ count: g, meter: METERS[key] });
      meter = key;
      const reh = m.rehearsal[String(b.bar)];
      if (b.bar === 1) marks.push({ count: g, label: m.title });
      else if (reh) marks.push({ count: g, label: `${short[m.title]} ${reh} (m${b.bar})` });
    }
  }
  return { firstMeasure: 1, pickupCounts: 0, changes, marks };
}

// ---- build ----------------------------------------------------------------------------------------------
const show = new Show(CAST.virtualStart, c => Math.round(bpmAt(c) * 100) / 100);
const extras = buildShow(show);
for (const p of CAST.performers) SECTION_OF[p.id] = p.sectionId;

const draft: Project = {
  schemaVersion: 2, id: 'demo-tether-space-show', title: 'Tether', ensemble: 'Squidware Demo Corps · 165 members',
  field: FIELD, sections: CAST.sections as Section[], performers: CAST.performers as Performer[],
  sets: show.sets, moves: show.moves, audioOffsetSeconds: 0,
  openingTiming: { tempo: 56, transition: 'linear' },
  meter: METERS['4,4'], score: scoreMap(), tempoMap: tempoMap(),
  sharedRoutes: show.routes, selectionGroups: extras.selectionGroups, rehearsal: extras.rehearsal,
  analysisRules: extras.analysisRules, snapping: { steps: 8, subdivision: 2, target: 'grid', group: 'anchor' },
};
// ---- repair: stagger departures (hold, then go) or arrivals (go, then hold) to clear crossing pairs -----------------
let epoch = 10;
async function moveIssues(project: Project, i: number) {
  const input = transitionInput(project, i, ++epoch);
  try { return input ? (await new TransitionAnalyzer().analyze(input, () => false, () => Promise.resolve()))!.issues : []; }
  catch (e) { console.log(`analysis failed at ${project.sets[i].name}: ${(e as Error).message}`); return Array(999).fill({ type: 'error' }); }
}
async function repair(project: Project) {
  const fixes: string[] = [];
  for (let i = 1; i < project.sets.length; i++) {
    const move = project.moves[i - 1], grouped = new Set(move.groupMotions?.flatMap(g => g.members) ?? []);
    let issues = await moveIssues(project, i);
    if (process.env.DRAFT || issues.filter(x => x.type === 'collision').length > 12) continue;
    for (let guard = 0; guard < 40 && issues.some(x => x.type === 'collision'); guard++) {
      const pair = issues.find(x => x.type === 'collision')!.performerIds;
      let best: { id: string; path: Project['moves'][number]['paths'][string]; n: number } | undefined;
      for (const id of pair) {
        if (grouped.has(id) || move.paths[id]) continue;
        const from = project.sets[i - 1].positions[id], to = project.sets[i].positions[id];
        if (Math.hypot(to.x - from.x, to.y - from.y) < 1e-9) continue;
        for (let d = 1; d <= Math.floor(move.counts / 2); d++) for (const kind of ['late', 'early'] as const) {
          const path = { segments: kind === 'late' ? [{ id: 'wait', kind: 'hold' as const, startCount: 0, endCount: d }, { id: 'go', kind: 'line' as const, startCount: d, endCount: move.counts }]
            : [{ id: 'go', kind: 'line' as const, startCount: 0, endCount: move.counts - d }, { id: 'set', kind: 'hold' as const, startCount: move.counts - d, endCount: move.counts }] };
          move.paths[id] = path;
          const n = (await moveIssues(project, i)).length;
          delete move.paths[id];
          if (n < issues.length && (!best || n < best.n)) best = { id, path, n };
        }
      }
      if (!best) break;
      move.paths[best.id] = best.path; issues = await moveIssues(project, i);
      fixes.push(`${project.sets[i].name}: ${project.performers.find(p => p.id === best!.id)!.label} ${best.path.segments[0].kind === 'hold' ? `waits ${best.path.segments[0].endCount}` : `arrives ${move.counts - best.path.segments[0].endCount} early`}`);
    }
  }
  return fixes;
}

// While drafting, trim timing data to the counts written so far.
{
  const total = show.at, sc = draft.score!, tm = draft.tempoMap!;
  sc.changes = sc.changes.filter(c => c.count < total); sc.marks = sc.marks.filter(m => m.count <= total);
  tm.regions = tm.regions.filter(r => r.startCount < total).map(r => r.endCount <= total ? r : { ...r, endCount: total, endTempo: r.startTempo + (r.endTempo - r.startTempo) * (total - r.startCount) / (r.endCount - r.startCount) });
  tm.holds = tm.holds.filter(h => h.count < total);
}
// Recording anchors: movement downbeats and big hits always; every set arrival the tempo map misses by > 1 ms.
const nominal = validateProject({ ...draft, audioAnchors: [] });
const anchorCounts = new Set<number>(extras.anchorCounts);
show.arrivals.forEach(c => { if (c > 0 && Math.abs(countToSeconds(nominal, c) - trueSeconds(c)) > .001) anchorCounts.add(c); });
draft.audioAnchors = [...anchorCounts].filter(c => c > 0 && c <= totalCounts(nominal)).sort((a, b) => a - b).map(c => ({ count: c, seconds: Math.round(trueSeconds(c) * 1e4) / 1e4 }));
const fixes = await repair(draft);
const project = validateProject(draft);
const text = serializeProject(project);
const reparsed = parseProject(text);

// ---- verify -----------------------------------------------------------------------------------------------
const worst = show.arrivals.reduce((w, c) => Math.max(w, Math.abs(countToSeconds(reparsed, c) - trueSeconds(c))), 0);
let maxStride = 0;
const strideBy: Record<string, number> = {};
const analyzer = new TransitionAnalyzer();
const report: string[] = [];
let findings = 0;
const run = async () => {
  for (let i = 1; i < reparsed.sets.length; i++) {
    const input = transitionInput(reparsed, i, 1)!;
    let result; try { result = await analyzer.analyze(input, () => false, () => Promise.resolve()); } catch (e) { console.log(`ANALYSIS ERROR ${reparsed.sets[i].name}: ${(e as Error).message}`); continue; }
    const move = effectiveMove(reparsed, i - 1);
    for (const p of reparsed.performers) {
      const from = reparsed.sets[i - 1].positions[p.id], to = reparsed.sets[i].positions[p.id];
      let len = 0, prev = from; const steps = Math.max(8, move.counts * 4);
      for (let k = 1; k <= steps; k++) { const q = sampleMovement(from, to, move.paths[p.id], move.counts * k / steps, move.counts, move.transition); len += Math.hypot(q.x - prev.x, q.y - prev.y); prev = q; }
      const s = len / move.counts; strideBy[p.sectionId] = Math.max(strideBy[p.sectionId] ?? 0, s); maxStride = Math.max(maxStride, s);
    }
    if (result?.issues.length) {
      findings += result.issues.length;
      report.push(`${reparsed.sets[i].name} (${move.counts} ct): ${result.issues.length} finding(s)`);
      for (const issue of result.issues.slice(0, 6)) report.push(`   ${issue.type} ${issue.severity}: ${issue.message}`);
    }
  }
  const out = path.join(root, 'examples');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'tether-space-show.squid'), text);
  const preview = { field: FIELD, sections: reparsed.sections, performers: reparsed.performers.map(p => ({ id: p.id, s: p.sectionId, l: p.label })),
    sets: reparsed.sets.map((s, i) => ({ name: s.name, count: show.arrivals[i], notes: s.notes, live: (s.liveFormations ?? []).map(f => f.name), pos: Object.fromEntries(Object.entries(s.positions).map(([k, v]) => [k, [+v.x.toFixed(3), +v.y.toFixed(3)]])) })) };
  fs.mkdirSync(path.join(root, 'node_modules/.cache/demo-show'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules/.cache/demo-show/preview.json'), JSON.stringify(preview));
  const live = reparsed.sets.reduce((n, s) => n + (s.liveFormations?.length ?? 0), 0);
  const groups = reparsed.moves.reduce((n, m) => n + (m.groupMotions?.length ?? 0), 0);
  const pathed = reparsed.moves.reduce((n, m) => n + Object.keys(m.paths).length, 0);
  console.log(report.join('\n'));
  console.log(`staggers added: ${fixes.length}${fixes.length ? '\n   ' + fixes.join('\n   ') : ''}`);
  console.log(`sets ${reparsed.sets.length}, counts ${totalCounts(reparsed)}, seconds ${countToSeconds(reparsed, totalCounts(reparsed)).toFixed(2)} (music ${trueSeconds(T.totalCounts).toFixed(2)}), worst arrival drift ${(worst * 1000).toFixed(2)} ms`);
  console.log(`anchors ${reparsed.audioAnchors?.length}, tempo regions ${reparsed.tempoMap?.regions.length}, holds ${reparsed.tempoMap?.holds.length}, routes ${reparsed.sharedRoutes?.length}, live formations ${live}, group motions ${groups}, authored paths ${pathed}`);
  console.log(`max path stride ${maxStride.toFixed(3)} yd/count; by section ${Object.entries(strideBy).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ')}`);
  console.log(`FINDINGS ${findings}; file ${(text.length / 1024).toFixed(0)} KiB`);
};
await run();
