import { describe, expect, it } from 'vitest';
import { analyzeTransition, createDemoProject } from '../domain';
import { createPerformanceFixture } from '../performanceFixtures';
import type { Project } from '../types';
import { TransitionAnalyzer } from './engine';
import { transitionInput } from './input';

const rules = { minimumSpacing: 1, maximumStride: 1.25 };
const noWait = async () => {};
async function compare(engine: TransitionAnalyzer, p: Project, index = 1, epoch = 0, thresholds = rules) {
  const result = (await engine.analyze(transitionInput(p, index, epoch, thresholds)!, undefined, noWait))!;
  // Identical formulas retain exact severity, text, count, IDs and stable order.
  expect(result.issues).toEqual(analyzeTransition(p, index, thresholds));
  return result.stats;
}
function edit(p: Project, performer = 0, x = 50): Project {
  const id = p.performers[performer].id;
  return { ...p, sets: p.sets.map((s, i) => i === 1 ? { ...s, positions: { ...s.positions, [id]: { ...s.positions[id], x } } } : s) };
}
describe('swept bounds and incremental move analysis', () => {
  it('matches the oracle for deterministic sparse/dense, stationary, crossing and eased random paths', async () => {
    let seed = 9824;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    for (let sample = 0; sample < 24; sample++) {
      let p = createPerformanceFixture('demo');
      const dense = sample % 3 === 0;
      p = { ...p, sets: p.sets.map(s => ({ ...s, positions: Object.fromEntries(p.performers.map(person => [person.id, { x: random() * (dense ? 2 : 100), y: random() * (dense ? 2 : 50) }])) })),
        moves: p.moves.map(m => ({ ...m, transition: sample % 2 ? 'ease' : 'linear', counts: 1 + sample })) };
      if (sample % 4 === 0) p.sets[1].positions = structuredClone(p.sets[0].positions);
      const engine = new TransitionAnalyzer();
      await compare(engine, p, 1, 0, { minimumSpacing: .1 + random() * 4.9, maximumStride: .1 + random() * 4.9 });
    }
  });
  it('keeps threshold boundaries, danger cutoffs and coincident endpoints identical', async () => {
    const original = createPerformanceFixture('demo');
    for (const separation of [0, .5 - 1e-10, .5, 1 - 2e-8, 1 - 1e-8, 1, 1 + 1e-8]) {
      const p = { ...original, performers: original.performers.slice(0, 2) };
      p.sets = p.sets.map(s => ({ ...s, positions: { [p.performers[0].id]: { x: 0, y: 0 }, [p.performers[1].id]: { x: separation, y: 0 } } }));
      await compare(new TransitionAnalyzer(), p);
    }
  });
  it('prunes sparse stationary forms and only checks pairs touching changed performers', async () => {
    let p = createPerformanceFixture('demo');
    p = { ...p, sets: p.sets.map(s => ({ ...s, positions: p.sets[0].positions })) };
    const engine = new TransitionAnalyzer();
    const first = await compare(engine, p);
    expect(first.exactPairs).toBe(0);
    const moved = edit(p, 0, p.sets[0].positions[p.performers[1].id].x);
    const next = await compare(engine, moved);
    expect(next.mode).toBe('incremental'); expect(next.changedPerformers).toBe(1);
    expect(next.exactPairs).toBeLessThanOrEqual(p.performers.length - 1);
    expect((await compare(engine, p)).mode).toBe('incremental'); // undo clears obsolete flags
    expect((await compare(engine, p)).mode).toBe('cached');
  });
  it('matches the maximum fixture and a worst-case coincident 500-person form', async () => {
    const p = createPerformanceFixture('maximum'), engine = new TransitionAnalyzer();
    await compare(engine, p);
    const changed = edit(p, 0, 65);
    const stats = await compare(engine, changed);
    expect(stats.mode).toBe('incremental'); expect(stats.exactPairs).toBeLessThanOrEqual(499);
    const dense = { ...p, sets: p.sets.map(s => ({ ...s, positions: Object.fromEntries(p.performers.map(person => [person.id, { x: 50, y: 25 }])) })) };
    expect((await compare(engine, dense)).exactPairs).toBe(124750);
    await compare(engine, edit(dense, 0, 20));
  // This oracle comparison materializes and deeply compares 124,750 explained
  // flags repeatedly; it is a correctness check, not a single-worker budget.
  }, 15000);
  it('invalidates timing, rules, paths, roster, ordering and replacement, retaining other move caches', async () => {
    const p = createDemoProject(), engine = new TransitionAnalyzer();
    await compare(engine, p); await compare(engine, p, 2);
    expect((await compare(engine, p)).mode).toBe('cached');
    const variants: Project[] = [
      { ...p, moves: p.moves.map((m, i) => i === 0 ? { ...m, counts: m.counts + 1 } : m) },
      { ...p, moves: p.moves.map((m, i) => i === 0 ? { ...m, tempo: m.tempo + 1 } : m) },
      { ...p, moves: p.moves.map((m, i) => i === 0 ? { ...m, transition: m.transition === 'ease' ? 'linear' : 'ease' } : m) },
      { ...p, moves: p.moves.map((m, i) => i === 0 ? { ...m, paths: { [p.performers[0].id]: { segments: [{ id: 'line', kind: 'line', startCount: 0, endCount: m.counts }] } } } : m) },
      { ...p, performers: p.performers.map((person, i) => i === 0 ? { ...person, label: 'Renamed' } : person) },
      { ...p, performers: [...p.performers].reverse() },
      { ...p, performers: p.performers.slice(1) },
    ];
    for (const variant of variants) { await compare(engine, p); expect((await compare(engine, variant)).mode).toBe('full'); }
    await compare(engine, p);
    expect((await compare(engine, p, 1, 0, { ...rules, minimumSpacing: 2 })).mode).toBe('full');
    expect((await compare(engine, p, 1, 1)).mode).toBe('full');
    // Alter an earlier move so absolute counts in a cached later move change.
    await compare(engine, p, 2);
    expect((await compare(engine, variants[0], 2)).mode).toBe('full');
  });
  it('cancels cooperatively without poisoning the previous cache', async () => {
    const p = createPerformanceFixture('maximum'), engine = new TransitionAnalyzer();
    await compare(engine, p);
    let canceled = false;
    const allMoved = { ...p, sets: p.sets.map((s, i) => i === 1 ? { ...s, positions: p.sets[0].positions } : s) };
    const result = await engine.analyze(transitionInput(allMoved, 1, 0, rules)!, () => canceled, async () => { canceled = true; });
    expect(result).toBeNull();
    expect((await compare(engine, p)).mode).toBe('cached');
  });
  it('bounds retained move caches and clears them at a new project epoch', async () => {
    const p = createPerformanceFixture('demo'), engine = new TransitionAnalyzer();
    for (let i = 1; i <= 5; i++) await compare(engine, p, i);
    expect((await compare(engine, p, 5)).mode).toBe('cached');
    expect((await compare(engine, p, 1)).mode).toBe('full');
    expect((await compare(engine, p, 5, 1)).mode).toBe('full');
    expect((await compare(engine, p, 1, 1)).mode).toBe('full');
  });
});
