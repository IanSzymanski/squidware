import { describe, expect, it } from 'vitest';
import { createShowcaseProject } from './demoShow';
import { countToSeconds, secondsToCount, setStartCount, totalCounts } from './domain';
import timing from '../scripts/demo-show/space-show-timing.json';
import { transitionInput } from './analysis/input';
import { TransitionAnalyzer } from './analysis/engine';

describe('bundled demo production', () => {
  const project = createShowcaseProject();
  it('is a full drum corps cast with the Space show timing', () => {
    const count = (section: string) => project.performers.filter(p => p.sectionId === section).length;
    expect(project.performers).toHaveLength(165);
    expect(['sec-sop', 'sec-mel', 'sec-tbn', 'sec-bar', 'sec-eup', 'sec-tub'].reduce((n, s) => n + count(s), 0)).toBe(84);
    expect(['sec-snr', 'sec-ten', 'sec-bas', 'sec-cym'].reduce((n, s) => n + count(s), 0)).toBe(24);
    expect(count('sec-pit')).toBe(13);
    expect(['sec-flg', 'sec-rif', 'sec-sab'].reduce((n, s) => n + count(s), 0)).toBe(44);
    expect(project.sets).toHaveLength(67);
    expect(totalCounts(project)).toBe(1226);
    expect(countToSeconds(project, totalCounts(project))).toBeCloseTo(673.91, 1);
  });
  it('opens with exactly one deliberate teaching finding, explained in its set notes', async () => {
    const analyzer = new TransitionAnalyzer(), flagged: string[] = [];
    for (let i = 1; i < project.sets.length; i++) {
      const result = await analyzer.analyze(transitionInput(project, i, 1)!, () => false, () => Promise.resolve());
      if (result?.issues.length) flagged.push(...result.issues.map(() => project.sets[i].name));
    }
    expect(flagged).toEqual(['TE 5 · Layers']);
    expect(project.sets.find(s => s.name === 'TE 5 · Layers')!.notes).toContain('TEACHING FINDING');
  }, 120000);
  it('aligns every set arrival with the source score timing, including movement gaps', () => {
    for (let i = 0; i < project.sets.length; i++) {
      const count = setStartCount(project, i);
      const movement = timing.movements.find(m => count <= m.offsetCount + m.counts)!;
      const expected = movement.offsetSeconds + movement.times[count - movement.offsetCount];
      // The authoring generator adds anchors for arrivals more than 1 ms off
      // the tempo map and rounds anchors to four decimal places.
      expect(Math.abs(countToSeconds(project, count) - expected), project.sets[i].name).toBeLessThan(.001);
      expect(Math.abs(secondsToCount(project, expected) - count), project.sets[i].name).toBeLessThan(.005);
    }
  });
  it('keeps the front ensemble fixed at every authored set', () => {
    for (const performer of project.performers.filter(p => p.sectionId === 'sec-pit')) {
      for (const set of project.sets) expect(set.positions[performer.id]).toEqual(project.sets[0].positions[performer.id]);
    }
  });
});
