import { describe, expect, it } from 'vitest';
import { compileScore, countForScore, defaultScore, scoreAccent, scoreLabel, scorePosition, scoreTicks, validateScore } from './score';
import { parseMeterText } from './meter';
import { countToSeconds, parseProject, sampleTimeline, serializeProject } from './domain';
import { createPerformanceFixture } from './performanceFixtures';
import { ClickSchedule } from './editor/clickSchedule';
import v1 from './fixtures/schema-v1.squid?raw';
const source = () => ({ meter: parseMeterText('4/4'), moves:[{counts:40}], score: { ...defaultScore(), pickupCounts:2,
  changes:[{count:10,meter:parseMeterText('6/8')},{count:22,meter:parseMeterText('7/8:2+2+3')}],marks:[{count:10,label:'A'},{count:22,label:'B'}] } });

describe('musical score map',()=>{
  it('maps pickups, compound/mixed meters, marks and boundaries with reversible fractional beats',()=>{
    const map=compileScore(source());
    for(const [count,measure,beat] of [[0,0,3],[1,0,4],[2,1,1],[6,2,1],[9.5,2,4.5],[10,3,1],[15,3,6],[16,4,1],[22,5,1],[24,5,3],[29,6,1],[40,7,5]]) {
      expect(scorePosition(map,count)).toMatchObject({measure,beat}); expect(countForScore(map,measure,beat)).toBe(count);
    }
    expect(scorePosition(map,24).mark).toBe('B'); expect(scoreLabel(map,10)).toBe('M3 · beat 1');
    expect(()=>countForScore(map,0,1)).toThrow(/pickup/); expect(()=>countForScore(map,3,7)).toThrow();
  });
  it('preserves defaults, original motion, time and the wire shape of legacy files',()=>{
    const p=parseProject(v1), before=JSON.parse(serializeProject(p)); expect(before.score).toBeUndefined();
    expect(scorePosition(compileScore(p),16)).toMatchObject({measure:5,beat:1});
    const scored={...p,...source(),moves:p.moves,score:{...defaultScore(),changes:[{count:16,meter:parseMeterText('3/4')}],marks:[{count:16,label:'Bridge'}]}};
    const reopened=parseProject(serializeProject(scored)); expect(reopened.score).toEqual(scored.score);
    for(const count of [0,.25,8,16,17,40]) {expect(sampleTimeline(reopened,count)).toEqual(sampleTimeline(p,count));expect(countToSeconds(reopened,count)).toBe(countToSeconds(p,count));}
  });
  it('rejects contradictory, duplicate, out-of-range and malformed anchors',()=>{
    expect(()=>parseMeterText('3000000000/8')).toThrow(/1 and 32/);
    expect(()=>parseMeterText('1'.repeat(101))).toThrow(/100/);
    const s=source();
    for(const score of [{...s.score,pickupCounts:4},{...s.score,firstMeasure:0},{...s.score,changes:[{count:3,meter:s.meter}]},
      {...s.score,changes:[{count:42,meter:s.meter}]},{...s.score,changes:[s.score.changes[0],s.score.changes[0]]},
      {...s.score,marks:[{count:41,label:'End'}]},{...s.score,marks:[{count:0,label:'A'},{count:10,label:'a'}]},
      {...s.score,marks:[{count:0,label:'A'},{count:0,label:'B'}]},{...s.score,marks:[{count:0,label:'\u0000'}]}]) expect(()=>compileScore({...s,score})).toThrow();
    expect(()=>validateScore(null)).toThrow(); expect(()=>compileScore({...s,score:{...s.score,changes:[{count:3,meter:s.meter}]}})).toThrow(/next bar starts at count 6/);
  });
  it('round trips every count across 3/4, 4/4, compound and mixed meters, including all pickup lengths',()=>{
    for(const meter of ['3/4','4/4','6/8','7/8:2+2+3','12/8']) for(let pickup=0;pickup<parseMeterText(meter).numerator;pickup++) {
      const map=compileScore({meter:parseMeterText(meter),moves:[{counts:1024}],score:{...defaultScore(),firstMeasure:42,pickupCounts:pickup}});
      for(let count=0;count<=1024;count+=.25){const p=scorePosition(map,count);expect(countForScore(map,p.measure,p.beat)).toBe(count);}
    }
  });
  it('bounds timeline work for maximum-size shows and preserves measure phase while zooming',()=>{
    const p=createPerformanceFixture('maximum');p.meter=parseMeterText('1/4'); const map=compileScore(p);
    const ticks=scoreTicks(map,0,map.total,800);expect(ticks.length).toBeLessThanOrEqual(12);expect(ticks[0]).toEqual({count:0,label:'M1'});
    expect(scoreTicks(map,500,504,800)).toContainEqual({count:502,label:'M503'});
  });
  it('shares pickup and meter-change accents with the actual audio scheduler across loops and a start cue',()=>{
    const map=compileScore(source());
    expect([0,1,2,6,10,13,16,22,24,26].map(c=>scoreAccent(c,map.spans))).toEqual(['beat','beat','bar','bar','bar','group','bar','bar','group','group']);
    const plan={spans:[{count:0,seconds:0,counts:40,secondsPerCount:.5}],meter:source().meter,scoreSpans:map.spans,anchorTime:0,seconds:0,speed:1,start:0,end:20,loop:false,clicks:true};
    const events=new ClickSchedule(plan,0).until(20);expect(events.find(e=>e.count===10)?.accent).toBe('bar');expect(events.find(e=>e.count===13)?.accent).toBe('group');
    const loop=new ClickSchedule({...plan,seconds:5,start:5,end:8,loop:true,cue:{count:10,time:0}},0).until(7);
    expect(loop.filter(e=>e.count===10).map(e=>e.accent)).toEqual(['bar','bar','bar']);
  });
});
