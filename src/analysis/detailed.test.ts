import { describe, expect, it } from 'vitest';
import { analyzeTransition, createBlankProject, parseProject, sampleProject, serializeProject } from '../domain';
import type { Point, Project } from '../types';
import { compileTrack, curvePoint } from './detailed';
import { createPerformanceFixture } from '../performanceFixtures';
import { TransitionAnalyzer } from './engine';
import { transitionInput } from './input';
const noWait = async () => {};
function fixture(): Project {
  const p = createBlankProject(); p.performers = ['a','b'].map(id => ({id,label:id,name:'',sectionId:p.sections[0].id}));
  p.sets = [{id:'s0',name:'Opening',notes:'',positions:{a:{x:10,y:10},b:{x:20,y:25}}},{id:'s1',name:'Arrival',notes:'',positions:{a:{x:30,y:10},b:{x:20,y:25}}}];
  p.moves=[{id:'m',fromSetId:'s0',toSetId:'s1',counts:8,tempo:120,transition:'linear',paths:{a:{segments:[{id:'c',kind:'cubic',startCount:0,endCount:8,control1:{x:10,y:30},control2:{x:30,y:30}}]}}}];
  p.analysisRules={defaults:{minimumSpacing:1,maximumStride:5}}; return p;
}
function independentCubic(a:Point,b:Point,c:Point,d:Point,t:number) { const u=1-t;return{x:u**3*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t**3*d.x,y:u**3*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t**3*d.y}; }
async function checked(p=fixture(),engine=new TransitionAnalyzer()) { const input=transitionInput(p,1,0)!;const result=(await engine.analyze(input,undefined,noWait))!;expect(result.issues).toEqual(analyzeTransition(p,1));return result; }
/** Independent scalar bracketing on a dense grid followed by golden-section
 * refinement; it never consumes Bernstein bounds or the analysis sampler. */
function extremum(f:(t:number)=>number,maximum=false) {
  const sign=maximum?-1:1, n=256, values=Array.from({length:n+1},(_,i)=>f(i/n)*sign);let best=Math.min(values[0],values[n]);
  for(let i=1;i<n;i++)if(values[i]<=values[i-1]&&values[i]<=values[i+1]) {
    let a=(i-1)/n,b=(i+1)/n;
    for(let j=0;j<60;j++){const x=a+(b-a)*.3819660112501051,y=a+(b-a)*.6180339887498949;if(f(x)*sign<f(y)*sign)b=y;else a=x;}
    best=Math.min(best,f((a+b)/2)*sign);
  }
  return best*sign;
}
describe('conservative detailed movement checks',()=>{
 it('composes line/cubic parameter timing exactly, including degree-nine eased curves and bounded derivatives',()=>{
  const p=fixture();for(const transition of ['linear','ease'] as const){p.moves[0].transition=transition;const input=transitionInput(p,1,0)!,track=input.tracks[0],c=compileTrack(track,8,transition).parts[0];expect(c.points.length).toBe(transition==='ease'?10:4);
   for(const t of [0,.001,.21,.5,.87,1]){const u=transition==='ease'?t*t*(3-2*t):t,expected=independentCubic(track.from,{x:10,y:30},{x:30,y:30},track.to,u);const actual=curvePoint(c.points,t);expect(actual.x).toBeCloseTo(expected.x,10);expect(actual.y).toBeCloseTo(expected.y,10);expect(sampleProject(p,t*8).positions.a.x).toBeCloseTo(actual.x,10);}
   const v=curvePoint(c.velocity!,.37),h=1e-6,a=curvePoint(c.points,.37-h),b=curvePoint(c.points,.37+h);expect(v.x).toBeCloseTo((b.x-a.x)/(16*h),6);expect(v.y).toBeCloseTo((b.y-a.y)/(16*h),6);
  }
 });
 it('detects a curved crossing outside both endpoint chord boxes and reports a real unsafe count interval',async()=>{
  const p=fixture(),result=await checked(p),issue=result.issues.find(i=>i.type==='collision')!;expect(issue.certainty).toBe('confirmed');expect(issue.atCount).toBe(4);expect(issue.measurement!.upper).toBeLessThan(.001);expect(issue.countRange![0]).toBeLessThan(4);expect(issue.countRange![1]).toBeGreaterThan(4);
  for(const count of issue.countRange!){const pos=sampleProject(p,count).positions;expect(Math.hypot(pos.a.x-pos.b.x,pos.a.y-pos.b.y)).toBeLessThan(1);}
 });
 it('finds a very fast between-count curved crossing and peak stride instead of averaging across holds',async()=>{
  const p=fixture();p.moves[0].counts=16;p.moves[0].paths.a.segments=[{id:'fast',kind:'cubic',startCount:.11,endCount:.12,control1:{x:10,y:40},control2:{x:90,y:40}}];p.sets[1].positions.a={x:90,y:10};p.sets[0].positions.b=p.sets[1].positions.b={x:50,y:32.5};
  const issues=(await checked(p)).issues;expect(issues.find(i=>i.type==='collision')?.atCount).toBeCloseTo(.115,8);const stride=issues.find(i=>i.type==='stride')!;expect(stride.severity).toBe('danger');expect(stride.measurement!.lower).toBeGreaterThan(1000);expect(stride.countRange![0]).toBeGreaterThanOrEqual(.11);expect(stride.countRange![1]).toBeLessThanOrEqual(.12);
 });
 it('resolves holds/gaps and asynchronous line arrivals rather than testing spatial intersections without timing',async()=>{
  const p=fixture();p.moves[0].counts=4;p.sets[0].positions={a:{x:10,y:20},b:{x:15,y:15}};p.sets[1].positions={a:{x:20,y:20},b:{x:15,y:25}};p.moves[0].paths={a:{segments:[{id:'a',kind:'line',startCount:0,endCount:1}]},b:{segments:[{id:'b',kind:'line',startCount:2,endCount:3}]}};
  expect((await checked(p)).issues.filter(i=>i.type==='collision')).toEqual([]);
  p.moves[0].paths.b.segments[0].startCount=0;p.moves[0].paths.b.segments[0].endCount=1;expect((await checked(p)).issues.find(i=>i.type==='collision')?.certainty).toBe('confirmed');
 });
 it('distinguishes tangent uncertainty from a confirmed breach and a near miss beyond the declared error band',async()=>{
  const p=fixture();p.sets[0].positions.a={x:0,y:0};p.sets[1].positions.a={x:10,y:0};p.moves[0].paths.a.segments=[{id:'tangent',kind:'cubic',startCount:0,endCount:8,control1:{x:0,y:10},control2:{x:10,y:10}}];
  for(const [y,certainty] of [[8.49,'confirmed'],[8.5,'possible'],[8.51,undefined]] as const){p.sets[0].positions.b=p.sets[1].positions.b={x:5,y};const issue=(await checked(p)).issues.find(i=>i.type==='collision');expect(issue?.certainty).toBe(certainty);if(issue){expect(issue.measurement!.upper-issue.measurement!.lower).toBeLessThanOrEqual(.001000001);if(certainty==='possible')expect(issue.countRange![1]-issue.countRange![0]).toBeLessThanOrEqual(.002);}}
 });
 it('agrees with an independent power-basis/golden-section oracle for eased and linear curves, loops and extrema',async()=>{
  let seed=12345;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  for(let i=0;i<24;i++){const p=fixture(),a={x:random()*30,y:random()*30},b={x:random()*30,y:random()*30},c={x:random()*30,y:random()*30},d=i%3?a:{x:random()*30,y:random()*30},stationary={x:random()*30,y:random()*30};p.sets[0].positions={a,b:stationary};p.sets[1].positions={a:d,b:stationary};p.moves[0].transition=i%2?'ease':'linear';p.moves[0].counts=1;p.analysisRules!.defaults={minimumSpacing:5,maximumStride:.1};p.moves[0].paths.a.segments=[{id:'curve',kind:'cubic',startCount:0,endCount:1,control1:b,control2:c}];
   const point=(t:number)=>{const u=i%2?t*t*(3-2*t):t;return independentCubic(a,b,c,d,u);};const distance=(t:number)=>{const v=point(t);return Math.hypot(v.x-stationary.x,v.y-stationary.y);};const min=extremum(distance);
   const velocity=(t:number)=>{const u=i%2?t*t*(3-2*t):t,du=i%2?6*t*(1-t):1;return Math.hypot(3*((b.x-a.x)*(1-u)**2+2*(c.x-b.x)*(1-u)*u+(d.x-c.x)*u*u)*du,3*((b.y-a.y)*(1-u)**2+2*(c.y-b.y)*(1-u)*u+(d.y-c.y)*u*u)*du);};const max=extremum(velocity,true),issues=(await checked(p)).issues,collision=issues.find(i=>i.type==='collision'),stride=issues.find(i=>i.type==='stride')!;
   expect(stride.measurement!.lower).toBeLessThanOrEqual(max+1e-7);expect(stride.measurement!.upper).toBeGreaterThanOrEqual(max-1e-7);expect(stride.measurement!.upper-stride.measurement!.lower).toBeLessThanOrEqual(.001000001);
   if(min<5)expect(collision).toBeDefined();if(collision){expect(collision.measurement!.lower).toBeLessThanOrEqual(min+1e-7);expect(collision.measurement!.upper).toBeGreaterThanOrEqual(min-1e-7);}
  }
 });
 it('invalidates only edited detailed tracks, including control/timing/ID edits, then reloads the same findings',async()=>{
  const p=fixture(),engine=new TransitionAnalyzer();await checked(p,engine);expect((await checked(p,engine)).stats.mode).toBe('cached');const q=structuredClone(p),s=q.moves[0].paths.a.segments[0];if(s.kind==='cubic')s.control1.y=31;expect((await checked(q,engine)).stats).toMatchObject({mode:'incremental',changedPerformers:1});s.endCount=7;expect((await checked(q,engine)).stats.changedPerformers).toBe(1);s.id='new';expect((await checked(q,engine)).stats.changedPerformers).toBe(1);expect(analyzeTransition(parseProject(serializeProject(q)),1)).toEqual(analyzeTransition(q,1));
 });
 it('yields within detailed numerical work, rejects cancellation and leaves the previous committed cache intact',async()=>{
  const p=fixture(),engine=new TransitionAnalyzer();await checked(p,engine);const q=structuredClone(p);q.moves[0].transition='ease';for(let i=2;i<500;i++){const id=`p${i}`;q.performers.push({...q.performers[0],id,label:id});q.sets[0].positions[id]={...q.sets[0].positions.a};q.sets[1].positions[id]={...q.sets[1].positions.a};q.moves[0].paths[id]=structuredClone(q.moves[0].paths.a);}let canceled=false,yields=0;expect(await engine.analyze(transitionInput(q,1,0)!,()=>canceled,async()=>{yields++;canceled=true;})).toBeNull();expect(yields).toBeGreaterThan(0);expect((await checked(p,engine)).stats.mode).toBe('cached');
 });
 it('keeps unresolved numerical bounds visible and refuses overflow instead of publishing false clearance',async()=>{
  const p=fixture();p.moves[0].paths.a.segments=[{id:'fast',kind:'line',startCount:0,endCount:1e-8}];const result=await checked(p);const stride=result.issues.find(i=>i.type==='stride')!;expect(stride.measurement!.converged).toBe(false);expect(stride.certainty).toBe('confirmed');expect(stride.measurement!.lower).toBeLessThan(2e9);expect(stride.measurement!.upper).toBeGreaterThan(2e9);
  const near=fixture();near.sets[0].positions.a={x:0,y:10};near.sets[1].positions.a={x:1,y:10};near.moves[0].paths.a.segments=[{id:'finite-velocity',kind:'line',startCount:0,endCount:(2**50+1)*Number.MIN_VALUE}];await expect(new TransitionAnalyzer().analyze(transitionInput(near,1,0)!,undefined,noWait)).rejects.toThrow(/has not been checked/);
  p.moves[0].paths.a.segments[0].endCount=1e-323;await expect(new TransitionAnalyzer().analyze(transitionInput(p,1,0)!,undefined,noWait)).rejects.toThrow(/has not been checked/);
 });

 it('applies portable section and explicitly declared direction thresholds to detailed bounds',async()=>{
  const p=fixture();p.sections.push({id:'wide',name:'Wide section',color:'#abcdef'});p.performers[1].sectionId='wide';p.sets[0].positions.b=p.sets[1].positions.b={x:20,y:26.5};p.analysisRules!.sections=[{sectionId:'wide',minimumSpacing:2}];p.moves[0].counts=16;p.moves[0].paths.a.segments[0].endCount=16;p.analysisRules!.defaults.maximumStride=2;p.analysisRules!.directions={forward:{maximumStride:5}};p.moves[0].marchingDirections={a:'forward'};
  const issues=(await checked(p)).issues;expect(issues.filter(i=>i.type==='stride')).toEqual([]);expect(issues.find(i=>i.type==='collision')).toMatchObject({certainty:'confirmed',severity:'warning'});expect(issues[0].message).toContain('Minimum 2 yd');expect(issues[0].message).toContain('forward declared');
 });

 it('checks every pair in a 500-performer, 128-picture show with 32 coincident cubic intervals per track',async()=>{
  const p=createPerformanceFixture('maximum');for(const set of p.sets.slice(0,2))set.positions=Object.fromEntries(p.performers.map(person=>[person.id,{x:20,y:20}]));p.moves[0].counts=32;p.moves[0].paths=Object.fromEntries(p.performers.map(person=>[person.id,{segments:Array.from({length:32},(_,i)=>({id:`c${i}`,kind:'cubic' as const,startCount:i,endCount:i+1,...(i<31?{to:{x:20,y:20}}:{}),control1:{x:25,y:30},control2:{x:15,y:30}}))}]));
  const result=(await new TransitionAnalyzer().analyze(transitionInput(p,1,0)!,undefined,noWait))!;expect(result.stats.exactPairs).toBe(124750);expect(result.issues.filter(i=>i.type==='collision')).toHaveLength(124750);expect(result.issues.every(i=>i.certainty==='confirmed'&&Number.isFinite(i.measurement!.upper))).toBe(true);
 },15000);

 it('derives detailed work from actual tracks even when the input hint is absent or false',async()=>{
  const p=fixture(),input=transitionInput(p,1,0)!;delete input.detailedPaths;const engine=new TransitionAnalyzer();expect((await engine.analyze(input,undefined,noWait))!.issues).toEqual(analyzeTransition(p,1));input.detailedPaths=false;expect((await engine.analyze(input,undefined,noWait))!.stats.mode).toBe('cached');
 });

 it('does not invent stride from a large field origin in stationary or tiny near-stationary travels',async()=>{
  const p=fixture(),origin={x:99.123456789,y:33.333333333333};p.moves[0].transition='ease';p.sets[0].positions.a={...origin};p.sets[1].positions.a={...origin};p.moves[0].paths.a.segments=[{id:'tiny',kind:'cubic',startCount:0,endCount:1e-14,control1:{...origin},control2:{...origin}}];expect((await checked(p)).issues).toEqual([]);
  const s=p.moves[0].paths.a.segments[0];if(s.kind!=='cubic')throw Error('fixture');s.endCount=1e-12;s.control1.x+=2e-13;s.control2.x+=8e-13;p.sets[1].positions.a.x+=1e-12;p.analysisRules!.defaults.maximumStride=.1;
  const peak=extremum(t=>{const u=t*t*(3-2*t);return 3*((s.control1.x-origin.x)*(1-u)**2+2*(s.control2.x-s.control1.x)*(1-u)*u+(p.sets[1].positions.a.x-s.control2.x)*u*u)*6*t*(1-t)/1e-12;},true);
  const issue=(await checked(p)).issues.find(i=>i.type==='stride')!;expect(issue.measurement!.lower).toBeLessThanOrEqual(peak+1e-8);expect(issue.measurement!.upper).toBeGreaterThanOrEqual(peak-1e-8);expect(issue.measurement!.upper-issue.measurement!.lower).toBeLessThanOrEqual(.001000001);
 });

 it('uses representable times for tiny intervals and never claims a witness at an unrepresentable show count',async()=>{
  const p=fixture(),end=1000+3*2**-43;p.moves[0].counts=1024;p.moves[0].paths.a.segments[0].startCount=1000;p.moves[0].paths.a.segments[0].endCount=end;
  const issues=(await checked(p)).issues,collision=issues.find(i=>i.type==='collision')!;expect(collision.certainty).toBe('possible');const positions=sampleProject(p,collision.atCount!).positions;expect(Math.hypot(positions.a.x-positions.b.x,positions.a.y-positions.b.y)).toBeGreaterThan(1);
  const q=fixture();q.moves[0].paths.a.segments[0].startCount=.11;q.moves[0].paths.a.segments[0].endCount=.11+1e-14;const input=transitionInput(q,1,0)!;input.startCount=100000;
  await expect(new TransitionAnalyzer().analyze(input,undefined,noWait)).rejects.toThrow(/flagged show count/);
 });

});
