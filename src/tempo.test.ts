import { describe, expect, it } from 'vitest';
import { countToSeconds, secondsToCount, createDemoProject, sampleProject, serializeProject, parseProject, totalCounts, exportCoordinatesCsv } from './domain';
import { compileTempo, holdAt, tempoAt, validateTempoMap } from './tempo';
import type { Project, TempoMap } from './types';
import { projectV2AsLegacy } from './projectV2';
import { createEditorStore } from './editor/store';
import { ClickSchedule, tempoSpans } from './editor/clickSchedule';
import { RehearsalClock } from './editor/rehearsalClock';
import { parseTempoText } from './editor/tempoMapText';
import { splitTransition } from './editor/splitTransition';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrintOutput } from './components/PrintOutput';

function fixture(): Project {
  const p=createDemoProject();p.sets=p.sets.slice(0,3);p.moves=p.moves.slice(0,2).map(m=>({...m,counts:16,tempo:120,transition:'linear',paths:{}}));return p;
}
const ramp: TempoMap = {version:1,regions:[{startCount:0,endCount:16,startTempo:120,endTempo:240},{startCount:16,endCount:32,startTempo:240,endTempo:60}],holds:[{count:8,seconds:2},{count:16,seconds:1}]};
function mapped(): Project{return {...fixture(),tempoMap:structuredClone(ramp)};}
function oldSeconds(p:Project,count:number){let left=count,t=0;for(const m of p.moves){const used=Math.min(left,m.counts);t+=used*60/m.tempo;left-=used;if(left<=0)break;}return t;}

describe('tempo map analytic timing',()=>{
  it('integrates linear BPM over counts against a closed form and independent midpoint quadrature',()=>{
    const p=mapped();const a=8*Math.log(2),b=16/3*Math.log(4);
    expect(countToSeconds(p,32)).toBeCloseTo(a+b+3,11);
    for(const region of ramp.regions){const n=10000,dx=(region.endCount-region.startCount)/n;let integral=0;for(let i=0;i<n;i++)integral+=60/(region.startTempo+(region.endTempo-region.startTempo)*(i+.5)/n)*dx;
      const without={...p,tempoMap:{...ramp,holds:[]}};
      expect(countToSeconds(without,region.endCount)-countToSeconds(without,region.startCount)).toBeCloseTo(integral,7);
    }
  });
  it('round-trips fractional counts and holds a non-invertible time interval at its exact count',()=>{
    const p=mapped();let last=-1;
    for(let c=0;c<=32;c+=.03125){const t=countToSeconds(p,c);expect(t).toBeGreaterThanOrEqual(last);expect(secondsToCount(p,t)).toBeCloseTo(c,10);last=t;}
    for(const h of ramp.holds){const arrival=countToSeconds(p,h.count);for(const offset of [0,.01,h.seconds/2,h.seconds-.000001]){expect(secondsToCount(p,arrival+offset)).toBe(h.count);expect(holdAt(p,arrival+offset)?.remaining).toBeCloseTo(h.seconds-offset,10);}expect(holdAt(p,arrival+h.seconds)).toBeNull();expect(secondsToCount(p,arrival+h.seconds+.001)).toBeGreaterThan(h.count);}
    expect(secondsToCount(p,1e9)).toBe(32);expect(countToSeconds(p,-1)).toBe(0);expect(countToSeconds(p,1e9)).toBeCloseTo(compileTempo(p).totalSeconds);
  });
  it('preserves fixed-tempo legacy durations exactly, and uses base move tempos in gaps',()=>{
    const p=createDemoProject(),before=serializeProject(p);for(const c of [0,.1,5,31.9,32,64,85,totalCounts(p)])expect(countToSeconds(p,c)).toBe(oldSeconds(p,c));expect(serializeProject(p)).toBe(before);
    const q={...fixture(),tempoMap:{version:1 as const,regions:[{startCount:4,endCount:8,startTempo:60,endTempo:60}],holds:[{count:0,seconds:1}]}};
    expect(countToSeconds(q,0)).toBe(0);expect(secondsToCount(q,.9)).toBe(0);expect(countToSeconds(q,4)).toBe(3);expect(countToSeconds(q,8)).toBe(7);expect(countToSeconds(q,32)).toBe(19);expect(tempoAt(q,5)).toBe(60);expect(tempoAt(q,8)).toBe(120);
  });
  it('handles nearly constant slopes and extreme legal increasing/decreasing ramps without drift',()=>{
    for(const [a,b] of [[120,120.000000001],[20,400],[400,20]]){const p={...fixture(),tempoMap:{version:1 as const,regions:[{startCount:0,endCount:32,startTempo:a,endTempo:b}],holds:[]}};for(const c of [0,.0001,1,15.123,16,31.999,32])expect(secondsToCount(p,countToSeconds(p,c))).toBeCloseTo(c,8);expect(countToSeconds(p,32)).toBeGreaterThan(0);}
  });
  it('splitting preserves movement, absolute tempo anchors, fermatas and total mapped duration',()=>{
    const p=mapped(),split=splitTransition(p,{moveId:p.moves[0].id,count:8});expect(split.tempoMap).toBe(p.tempoMap);
    for(let t=0;t<countToSeconds(p,32);t+=.17){const count=secondsToCount(p,t);expect(secondsToCount(split,t)).toBeCloseTo(count,10);const a=sampleProject(split,count).positions,b=sampleProject(p,count).positions;for(const id of Object.keys(a)){expect(a[id].x).toBeCloseTo(b[id].x,10);expect(a[id].y).toBeCloseTo(b[id].y,10);}}
  });
});

describe('tempo map validation and persistence',()=>{
  it('writes mapped productions as v3, reads them as canonical editor snapshots and keeps ordinary saves v2',()=>{
    const p=mapped(),wire=serializeProject(p);expect(JSON.parse(wire).schemaVersion).toBe(3);expect(parseProject(wire)).toEqual(p);expect(JSON.parse(serializeProject(fixture())).schemaVersion).toBe(2);
    expect(()=>parseProject(JSON.stringify({...p,schemaVersion:2}))).toThrow(/requires schema version 3/);expect(()=>projectV2AsLegacy(p)).toThrow(/cannot be downgraded/);expect(()=>parseProject(JSON.stringify({schemaVersion:5}))).toThrow(/Update Squidware/);
  });
  it('rejects overlap, duplicates, nonfinite/blank/oversized events and anchors outside the current show',()=>{
    const bad:unknown[]=[null,{...ramp,version:2},{...ramp,regions:[{...ramp.regions[0],endCount:0}]},{...ramp,regions:[ramp.regions[0],{...ramp.regions[1],startCount:15}]},{...ramp,regions:[{...ramp.regions[0],startTempo:0}]},{...ramp,holds:[{count:32,seconds:1}]},{...ramp,holds:[{count:1.5,seconds:1}]},{...ramp,holds:[{count:4,seconds:NaN}]},{...ramp,holds:[{count:4,seconds:601}]},{...ramp,holds:[{count:4,seconds:0}]},{...ramp,holds:[{count:4,seconds:1},{count:4,seconds:2}]},{...ramp,regions:Array(257).fill(ramp.regions[0])}];
    for(const value of bad)expect(()=>validateTempoMap(value,32)).toThrow();
    expect(()=>parseTempoText('0,16,,120','',32)).toThrow(/numeric/);expect(()=>parseTempoText('From,To,Start,End','',32)).toThrow();
    expect(parseTempoText('0\t16\t120\t120','8,2',32).holds).toEqual([{count:8,seconds:2}]);
  });
  it('applies one named undo action, revalidates stale requests, and rejects count edits that would truncate an anchor',()=>{
    const store=createEditorStore(fixture()),state=store.getState();const request={map:ramp,revision:state.project.revision,epoch:state.ui.projectEpoch};
    expect(store.dispatch('tempo.save',request)).toBe(true);expect(store.getState().project.past.at(-1)?.name).toBe('Edit tempo map');const saved=store.getState().project.present;
    expect(store.dispatch('set.update',{index:2,update:{counts:1}})).toBe(false);expect(store.getState().project.present).toBe(saved);
    expect(store.dispatch('tempo.save',request)).toBe(false);store.dispatch('history.undo');expect(store.getState().project.present.tempoMap).toBeUndefined();store.dispatch('history.redo');expect(store.getState().project.present.tempoMap).toEqual(ramp);
    const s=store.getState();expect(store.dispatch('tempo.save',{map:{version:1,regions:[],holds:[]},revision:s.project.revision,epoch:s.ui.projectEpoch})).toBe(true);expect(JSON.parse(serializeProject(store.getState().project.present)).schemaVersion).toBe(2);
  });
  it('exports the actual timing and a paginated PDF map without changing field geometry',()=>{
    const p=mapped(),before=serializeProject(p),csv=exportCoordinatesCsv(p);expect(csv).toContain('Arrival seconds');expect(csv).toContain('Hold 8: 2s');
    const markup=renderToStaticMarkup(PrintOutput({project:p,mode:'charts'}));expect(markup).toContain('SQUIDWARE / TEMPO MAP');expect(markup).toContain('Fermatas hold positions');expect(markup).toContain(countToSeconds(p,32).toFixed(3));expect(serializeProject(p)).toBe(before);
  });
});

describe('shared audio-clock and metronome map',()=>{
  it.each([.5,.75,1,1.25,1.5])('schedules each beat once through ramps, fermatas and loops at %s speed',speed=>{
    const p=mapped(),duration=countToSeconds(p,32),plan={spans:tempoSpans(p),meter:{numerator:4,denominator:4,grouping:[4]},anchorTime:0,seconds:0,speed,start:0,end:duration,loop:true,clicks:true};
    const schedule=new ClickSchedule(plan,0),events=[];for(let t=0;t<duration*2/speed;t+=.071)events.push(...schedule.until(Math.min(duration*2/speed,t+.071)));
    expect(events.map(e=>e.count)).toEqual([...Array.from({length:32},(_,i)=>i),...Array.from({length:32},(_,i)=>i)]);
    events.forEach((e,i)=>expect(e.time).toBeCloseTo((countToSeconds(p,e.count)+Math.floor(i/32)*duration)/speed,8));
    for(const h of ramp.holds){const start=countToSeconds(p,h.count)/speed;expect(events.filter(e=>e.time>start+1e-7&&e.time<(countToSeconds(p,h.count)+h.seconds)/speed)).toHaveLength(0);}
  });
  it('keeps partial fermata progress across pause/resume and scales the remaining pause when speed changes',()=>{
    const p=mapped(),start=countToSeconds(p,8);let now=0;const clock=new RehearsalClock({totalSeconds:countToSeconds(p,32),offset:0,now:()=>now});
    clock.update({playing:true,speed:1,loop:false},start);now=.7;const held=clock.sample();expect(secondsToCount(p,held.seconds)).toBe(8);
    clock.update({playing:false,speed:1,loop:false});now=3;expect(clock.sample().seconds).toBeCloseTo(start+.7);clock.update({playing:true,speed:2,loop:false});now=3.6;expect(secondsToCount(p,clock.sample().seconds)).toBe(8);now=3.7;expect(secondsToCount(p,clock.sample().seconds)).toBeGreaterThan(8);
  });
});

it('retains 256 ranges and 256 fermatas across maximum-length moves with bounded compiled spans',()=>{
  const p=fixture();p.moves=p.moves.map(m=>({...m,counts:1024}));
  const map:TempoMap={version:1,regions:Array.from({length:256},(_,i)=>({startCount:i*8,endCount:(i+1)*8,startTempo:i%2?400:20,endTempo:i%2?20:400})),holds:Array.from({length:256},(_,i)=>({count:i*8+4,seconds:.001+i/1000}))};
  const q={...p,tempoMap:map},wire=serializeProject(q),reopened=parseProject(wire);expect(reopened.tempoMap).toEqual(map);expect(compileTempo(q).spans.length).toBeLessThanOrEqual(768);
  const printed=renderToStaticMarkup(PrintOutput({project:q,mode:'charts'}));expect(printed.match(/SQUIDWARE \/ TEMPO MAP/g)).toHaveLength(39);expect(printed).toContain('Hold 0.256s');
  for(const count of [0,.1,4,8,1023.99,1024,1028,2047.999,2048])expect(secondsToCount(q,countToSeconds(q,count))).toBeCloseTo(count,8);
});
