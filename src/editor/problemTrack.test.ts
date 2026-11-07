import { describe, expect, it } from 'vitest';
import { analyzeTransition, createBlankProject } from '../domain';
import type { MoveCheck } from '../analysis/show';
import type { TransitionIssue } from '../types';
import type { Finding } from '../analysis/show';
import { BADGE_CAP, CAPPED_TARGET, PROBLEM_TARGET, activeCluster, awaitsRecheck, clusterBadge, clusterFindings, clusterName, clusterSeverity, findingName, findingQuantity, performerLabels, problemClusters, rovingIndex, wholeCount, type ProblemCluster } from './problemTrack';

const issue = (atCount: number, severity: 'danger' | 'warning' = 'warning', type: 'collision' | 'stride' = 'collision', ids = type === 'collision' ? ['a', 'b'] : ['a']): TransitionIssue =>
  ({ type, severity, performerIds: ids, message: type === 'collision' ? `A / B: 0.75 yards apart near count ${atCount}.` : 'A: 6.0 yards in 2 counts; 1.7 steps per 5 yards. Limit 1.25 yd/count (minimum 4 steps per 5 yd); base.', atCount });
const move = (index: number, issues: TransitionIssue[], status: MoveCheck['status'] = 'ready'): MoveCheck => ({ index, moveId: `m${index}`, signature: [], status, issues });
/** n findings spread over a 6-move, 192-count show, deliberately unsorted within each move. */
function show(n: number) {
  const moves = Array.from({ length: 6 }, (_, i) => move(i + 1, []));
  for (let k = 0; k < n; k++) { const at = (k * 7919 % 1920) / 10, m = Math.min(5, Math.floor(at / 32)); moves[m].issues.push(issue(at, k % 5 ? 'warning' : 'danger', k % 3 ? 'collision' : 'stride')); }
  for (const m of moves) m.issues.reverse();
  return moves;
}
/** Reference: ready findings inside the inclusive window, by count then move. */
const visibleFindings = (moves: MoveCheck[], start: number, span: number): Finding[] => moves.filter(m => m.status === 'ready')
  .flatMap(m => m.issues.filter(i => i.atCount! >= start && i.atCount! <= start + span).map(issue => ({ index: m.index, moveId: m.moveId, issue })))
  .sort((a, b) => a.issue.atCount! - b.issue.atCount! || a.index - b.index);
function invariants(clusters: ProblemCluster[], moves: MoveCheck[], start: number, span: number, width: number) {
  const visible = visibleFindings(moves, start, span), x = (c: number) => (c - start) / span * width;
  expect(clusters.flatMap(c => clusterFindings(c)).map(f => f.issue.atCount)).toEqual(visible.map(f => f.issue.atCount));
  expect(new Set(clusters.flatMap(c => clusterFindings(c).map(f => f.issue)))).toEqual(new Set(visible.map(f => f.issue)));
  for (const [i, c] of clusters.entries()) {
    const findings = clusterFindings(c), people = [...new Set(findings.flatMap(f => f.issue.performerIds))];
    expect(c.width).toBeGreaterThanOrEqual(PROBLEM_TARGET - 1e-9);
    expect(c.left).toBeGreaterThanOrEqual(-PROBLEM_TARGET / 2 - 1e-9); expect(c.left + c.width).toBeLessThanOrEqual(width + PROBLEM_TARGET / 2 + 1);
    if (i) expect(clusters[i - 1].left + clusters[i - 1].width).toBeLessThanOrEqual(c.left + 1e-9);
    // One-pixel buckets: each finding lies within its marker to within a pixel.
    for (const f of findings) { expect(x(f.issue.atCount!)).toBeGreaterThanOrEqual(c.left - 1e-9); expect(x(f.issue.atCount!)).toBeLessThanOrEqual(c.left + c.width + 1); }
    expect([c.size, c.danger, c.spacing]).toEqual([findings.length, findings.filter(f => f.issue.severity === 'danger').length, findings.filter(f => f.issue.type === 'collision').length]);
    expect([c.first, c.last]).toEqual([findings[0].issue.atCount, findings.at(-1)!.issue.atCount]);
    expect([c.people, c.others]).toEqual([people.slice(0, 3), people.length > 3]);
    expect(clusterFindings(c, 2)).toEqual(findings.slice(0, 2));
  }
  // Separate markers only where findings are a target apart or at a tile boundary inside a dense run.
  for (let i = 1; i < clusters.length; i++) expect(clusters[i].left).toBeGreaterThanOrEqual(x(clusters[i - 1].last) - PROBLEM_TARGET / 2);
  expect(new Set(clusters.map(c => c.key)).size).toBe(clusters.length);
  expect(clusters.length).toBeLessThanOrEqual(Math.ceil((width + PROBLEM_TARGET) / PROBLEM_TARGET));
}

describe('timeline problem clusters', () => {
  it.each([0, 1, 25, 400])('keep %i findings reachable in non-overlapping targets of at least 24 px', n => {
    const moves = show(n);
    for (const width of [48, 140, 769, 1366, 4000]) for (const [start, span] of [[0, 192], [40, 30], [190, 2]]) {
      const clusters = problemClusters(moves, start, span, width);
      invariants(clusters, moves, start, span, width);
      if (n === 0) expect(clusters).toEqual([]);
    }
    if (n === 1) expect(problemClusters(moves, 0, 192, 769)).toMatchObject([{ left: 0 - 12, width: 24, size: 1, first: 0 }]);
    if (n === 400) expect(problemClusters(moves, 0, 192, 769).length).toBeLessThanOrEqual(33);
  });

  it('places isolated findings centered on their count and merges closer ones', () => {
    const moves = [move(1, [issue(2), issue(10), issue(10.5, 'danger'), issue(30)])];
    const clusters = problemClusters(moves, 0, 32, 320);
    expect(clusters.map(c => [c.left, c.width, c.size, c.danger])).toEqual([[8, 24, 1, 0], [88, 29, 2, 1], [288, 24, 1, 0]]);
    // A long dense run splits into equal tiles at least one target wide.
    const run = problemClusters([move(1, Array.from({ length: 30 }, (_, i) => issue(i)))], 0, 32, 320);
    expect(run.length).toBe(13); expect(new Set(run.map(c => c.width.toFixed(6))).size).toBe(1);
    invariants(run, [move(1, Array.from({ length: 30 }, (_, i) => issue(i)))], 0, 32, 320);
  });

  it('includes window boundaries, skips unavailable moves and never mutates worker results', () => {
    const first = issue(0), edge = issue(8), danger = issue(8, 'danger'), outside = issue(100, 'danger');
    const ready = move(1, [outside, edge, first, danger]), copy = [...ready.issues], all = (moves: MoveCheck[], start: number, span: number) => problemClusters(moves, start, span, 1000).flatMap(c => clusterFindings(c).map(f => f.issue));
    for (let repeat = 0; repeat < 2; repeat++) {
      expect(all([ready], 0, 8)).toEqual([first, edge, danger]);
      expect(all([ready], 1, 6)).toEqual([]);
      expect(all([ready], 99, 1)).toEqual([outside]);
    }
    expect(all([move(2, [issue(9)]), ready], 0, 10).map(f => f.atCount)).toEqual([0, 8, 8, 9]);
    expect(problemClusters([move(2, [issue(9)]), ready], 0, 10, 1000)[1]).toMatchObject({ size: 2, danger: 1, parts: [{ move: { moveId: 'm1' } }] });
    expect(all([{ ...ready, status: 'pending' }, { ...ready, status: 'error' }], 0, 200)).toEqual([]);
    expect(ready.issues).toEqual(copy);
  });

  // “99k+” is about 28 px wide at 11 px in DejaVu Sans Bold, the widest common fallback face.
  it('widens the markers of a row that holds a capped group so its four-character badge fits', () => {
    const at = (size: number) => [move(1, Array.from({ length: size }, (_, i) => ({ ...issue(6), performerIds: [`p${i % 9}`, `p${(i + 1) % 9}`] }))), move(2, [issue(40), issue(41, 'danger'), issue(44)])];
    const capped = problemClusters(at(BADGE_CAP), 0, 64, 640), group = capped.find(c => c.size >= BADGE_CAP)!;
    expect(clusterBadge(group.size)).toBe('99k+');
    expect(capped.every(c => c.width >= CAPPED_TARGET - 1e-9)).toBe(true);
    for (let i = 1; i < capped.length; i++) expect(capped[i - 1].left + capped[i - 1].width).toBeLessThanOrEqual(capped[i].left + 1e-9);
    expect(capped.reduce((n, c) => n + c.size, 0)).toBe(BADGE_CAP + 3);
    // One finding fewer keeps the row's 24 px targets.
    expect(problemClusters(at(BADGE_CAP - 1), 0, 64, 640).map(c => [c.width, c.size])).toEqual([[PROBLEM_TARGET, BADGE_CAP - 1], [34, 2], [PROBLEM_TARGET, 1]]);
  });

  // The timeline viewport pads the track by 14 px and clips there: 32 px markers centered on the window's ends would lose
  // 2 px and the outer side of their focus outline, so they stop half a 24 px target past the track, as 24 px markers do.
  // (At 1366 px the capped group already spans 32 px, so that row keeps its 24 px tiling.)
  it('keeps the wider markers of a capped row within half a target of the track at the ends of the count window', () => {
    const capped = Array.from({ length: BADGE_CAP }, (_, i) => ({ ...issue(0), performerIds: [`p${i % 9}`, `p${(i + 1) % 9}`] }));
    const moves = [move(1, [...capped, issue(.5), issue(30)]), move(2, [issue(63.8, 'danger'), issue(64)])];
    for (const width of [320, 640, 1366]) {
      const row = problemClusters(moves, 0, 64, width);
      expect(row.reduce((n, c) => n + c.size, 0)).toBe(BADGE_CAP + 4);
      expect(row[0].left).toBeCloseTo(-PROBLEM_TARGET / 2); expect(row.at(-1)!.left + row.at(-1)!.width).toBeCloseTo(width + PROBLEM_TARGET / 2);
      for (const [i, c] of row.entries()) {
        expect(c.width).toBeGreaterThanOrEqual((c.size >= BADGE_CAP || width < 1000 ? CAPPED_TARGET : PROBLEM_TARGET) - 1e-9);
        expect(c.left).toBeGreaterThanOrEqual(-PROBLEM_TARGET / 2 - 1e-9); expect(c.left + c.width).toBeLessThanOrEqual(width + PROBLEM_TARGET / 2 + 1e-9);
        if (i) expect(row[i - 1].left + row[i - 1].width).toBeLessThanOrEqual(c.left + 1e-9);
        expect(clusterFindings(c).map(f => f.issue.atCount! / 64 * width).filter(x => x < c.left - 1e-9 || x > c.left + c.width + 1)).toEqual([]);
      }
    }
  });

  it('bounds markers for very dense shows', () => {
    const moves = show(20000), clusters = problemClusters(moves, 0, 192, 769);
    expect(clusters.reduce((n, c) => n + c.size, 0)).toBe(20000);
    expect(clusters.length).toBeLessThanOrEqual(33);
    // A worker reply for one move reuses every other move's buckets for the same viewport.
    const replaced = moves.map((m, i) => i === 2 ? { ...m, issues: [...m.issues] } : m);
    expect(problemClusters(replaced, 0, 192, 769).map(c => [c.left, c.size, c.danger])).toEqual(clusters.map(c => [c.left, c.size, c.danger]));
  });
});

describe('problem names', () => {
  const labels = new Map([['a', 'B4'], ['b', 'B5'], ['c', 'W2'], ['d', 'W3'], ['e', 'P1']]);
  it('state type, measured quantity, performer labels and whole counts', () => {
    expect(findingName({ ...issue(5.688), message: 'B4 / B5: 1.13 yards apart near count 5.7. Minimum 2 yd (base).' }, labels)).toBe('Spacing 1.13 yd · B4, B5 · count 6');
    expect(findingName(issue(12, 'danger', 'stride'), labels)).toBe('Stride 1.7 steps per 5 yd · B4 · count 12');
    expect(findingName({ ...issue(.4), measurement: { lower: .8312, upper: .8318, tolerance: .001, unit: 'yd', converged: true } }, labels)).toBe('Spacing 0.83 yd · B4, B5 · count 0');
    expect(findingQuantity({ ...issue(1), measurement: { lower: .5, upper: .9, tolerance: .001, unit: 'yd', converged: false } })).toBe('0.5–0.9 yd');
    expect(findingQuantity({ ...issue(1, 'danger', 'stride'), measurement: { lower: 1.666, upper: 1.667, tolerance: .001, unit: 'yd/count', converged: true } })).toBe('1.67 yd/count');
    expect(findingName({ ...issue(3), message: 'Unrecognized', performerIds: ['a', 'zz'] }, labels)).toBe('Spacing · B4, zz · count 3');
    expect([wholeCount(-.2), wholeCount(5.5), wholeCount(1024)]).toEqual(['0', '6', '1024']);
  });
  it('match every message the straight-line engine writes', () => {
    const p = createBlankProject();
    p.performers = Array.from({ length: 16 }, (_, i) => ({ id: `p${i}`, label: `P${i}`, name: '', sectionId: p.sections[0].id }));
    p.sets = Array.from({ length: 3 }, (_, i) => ({ id: `s${i}`, name: `Picture ${i}`, notes: '', positions: Object.fromEntries(p.performers.map((person, j) => [person.id, { x: 10 + i * 12, y: 10 + j * .2 }])) }));
    p.moves = Array.from({ length: 2 }, (_, i) => ({ id: `m${i}`, fromSetId: `s${i}`, toSetId: `s${i + 1}`, counts: 8, tempo: 120, transition: i ? 'ease' as const : 'linear' as const, paths: {} }));
    const issues = [1, 2].flatMap(i => analyzeTransition(p, i)), names = issues.map(i => findingName(i, performerLabels(p)));
    expect(issues.some(i => i.type === 'stride') && issues.some(i => i.type === 'collision')).toBe(true);
    for (const name of names) expect(name).toMatch(/^(Spacing \d+(\.\d+)? yd · P\d+, P\d+|Stride \d+(\.\d+)? steps per 5 yd · P\d+) · count \d+$/);
  });
  it('summarize groups by type, severity, performers and count range', () => {
    const at = (findings: TransitionIssue[]) => problemClusters([move(3, findings)], 0, 100, 10)[0];
    const spacing = at([issue(30.2), issue(31, 'danger'), { ...issue(33.6), performerIds: ['c', 'd'] }, { ...issue(34), performerIds: ['e', 'a'] }]);
    expect(clusterName(spacing, labels)).toBe('4 spacing problems · B4, B5, W2 and others · counts 30–34');
    expect(clusterSeverity(spacing)).toBe('1 danger, 3 warning');
    const mixed = at([issue(6), issue(6.2, 'danger', 'stride')]);
    expect(clusterName(mixed, labels)).toBe('2 problems (1 spacing, 1 stride) · B4, B5 · count 6');
    expect(clusterName(at([issue(6, 'danger', 'stride'), issue(6.1, 'danger', 'stride', ['b'])]), labels)).toBe('2 stride problems · B4, B5 · count 6');
    const single = at([issue(5.688, 'danger')]);
    expect([clusterName(single, labels), clusterSeverity(single)]).toEqual([findingName(clusterFindings(single)[0].issue, labels), 'Danger']);
    expect(clusterName(at([issue(6), { ...issue(6.1), performerIds: ['b', 'c'] }]), labels)).toBe('2 spacing problems · B4, B5, W2 · count 6');
    // Whole thousands rounded down, then a capped badge that never claims fewer findings than the group holds.
    expect([1, 12, 999, 1000, 25400, 99999, 100000, 325513, 1e7].map(clusterBadge)).toEqual(['1', '12', '999', '1k', '25k', '99k', '99k+', '99k+', '99k+']);
    for (const size of [1, 999, 1000, 99999]) expect(clusterBadge(size).length).toBeLessThanOrEqual(3);
  });
  // WCAG 2.5.3 Label in Name: a group marker's only visible text is its badge, so its name starts with it.
  it.each([3, 999, 1000, 25400, 99999, 100000, 325513])('start a %i-finding group name with its visible badge and keep the exact size', size => {
    const findings = Array.from({ length: size }, (_, i) => ({ ...issue(6), performerIds: [`p${i % 5}`, `p${(i + 1) % 5}`] }));
    const group = problemClusters([move(1, findings)], 0, 100, 1000)[0], name = clusterName(group, labels), badge = clusterBadge(group.size);
    expect(group.size).toBe(size);
    expect(name.startsWith(badge)).toBe(true);
    expect(name).toContain(`${size} spacing problems · `);
    expect(name).toBe(`${size < 1000 ? '' : `${badge} · `}${size} spacing problems · p0, p1, p2 and others · count 6`);
  });
});

describe('problem row keyboard', () => {
  it.each([0, 1, 25, 400])('moves within %i markers without wrapping', count => {
    for (const orientation of ['horizontal', 'vertical'] as const) {
      const [back, forward, other] = orientation === 'horizontal' ? ['ArrowLeft', 'ArrowRight', 'ArrowDown'] : ['ArrowUp', 'ArrowDown', 'ArrowRight'];
      if (!count) { for (const key of [back, forward, 'Home', 'End']) expect(rovingIndex(key, 0, count, orientation)).toBeNull(); continue; }
      let index = 0;
      const visited = [index];
      while (rovingIndex(forward, index, count, orientation) !== index) visited.push(index = rovingIndex(forward, index, count, orientation)!);
      expect(visited).toEqual(Array.from({ length: count }, (_, i) => i));
      expect(rovingIndex(forward, count - 1, count, orientation)).toBe(count - 1);
      expect(rovingIndex(back, 0, count, orientation)).toBe(0);
      expect(rovingIndex(back, count - 1, count, orientation)).toBe(Math.max(0, count - 2));
      expect([rovingIndex('Home', count - 1, count, orientation), rovingIndex('End', 0, count, orientation)]).toEqual([0, count - 1]);
      expect(rovingIndex('End', count + 5, count, orientation)).toBe(count - 1);
      for (const key of [other, 'Enter', ' ', 'Tab', 'Escape', 'a']) expect(rovingIndex(key, 0, count, orientation)).toBeNull();
    }
  });
  it('restores the remembered marker after reclustering', () => {
    const moves = show(25), wide = problemClusters(moves, 0, 192, 1366), narrow = problemClusters(moves, 0, 192, 300);
    expect(activeCluster([], null)).toBe(-1);
    expect(activeCluster(wide, null)).toBe(0);
    const target = wide[7];
    expect(activeCluster(wide, { key: target.key, count: target.first })).toBe(7);
    const restored = narrow[activeCluster(narrow, { key: 'gone', count: target.first })];
    expect(restored.first <= target.first && restored.last >= target.first || narrow.every(c => Math.min(Math.abs(c.first - target.first), Math.abs(c.last - target.first)) >= Math.min(Math.abs(restored.first - target.first), Math.abs(restored.last - target.first)))).toBe(true);
    expect(activeCluster(wide, { key: 'gone', count: 1e6 })).toBe(wide.length - 1);
  });
  // An empty row keeps focus for the remembered marker only while its own moves are rechecked: a count window scrolled
  // past every finding (playback) leaves it empty too, while other moves are pending, and must let focus go.
  it('waits for a recheck only under the remembered marker', () => {
    const [group] = problemClusters([move(1, [issue(2)]), move(2, [issue(2.2)]), move(3, [issue(60)])], 0, 64, 640), moves = (pending: string[]) => ['m1', 'm2', 'm3', 'm4'].map((id, i) => ({ ...move(i + 1, []), status: pending.includes(id) ? 'pending' as const : id === 'm4' ? 'error' as const : 'ready' as const }));
    const remembered = { key: group.key, count: group.first, moves: group.parts.map(p => p.move.moveId) };
    expect(remembered.moves).toEqual(['m1', 'm2']);
    expect([awaitsRecheck(moves(['m1', 'm2', 'm3']), remembered), awaitsRecheck(moves(['m2']), remembered)]).toEqual([true, true]);
    expect([awaitsRecheck(moves(['m3']), remembered), awaitsRecheck(moves([]), remembered), awaitsRecheck(moves(['m1']), null)]).toEqual([false, false, false]);
    expect(awaitsRecheck(moves([]), { ...remembered, moves: ['m4'] })).toBe(false);
  });
});
