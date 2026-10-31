import { describe, expect, it } from 'vitest';
import wire from '../format/examples/scheduled-v6.squid?raw';
import { parseProject, sampleProject, serializeProject, validateProject, setStartCount } from './domain';
import { copyIntervals, pasteIntervals, reversePaths } from './movementPathOperations';
import { updateSetProperties } from './editor/projectEdits';
import { createPerformanceFixture } from './performanceFixtures';
import type { PasteOptions } from './movementPathOperations';
const fixture=()=>parseProject(wire);
const copy=(p=fixture())=>copyIntervals(p,0,'a',p.moves[0].paths.a.segments.map(s=>s.id),true,'clipboard',0);
const options:PasteOptions={performerId:'a',startCount:0,duration:8,frame:'fit',seed:'test',allowTargetTiming:true};
function pointsClose(a:ReturnType<typeof sampleProject>['positions'],b:typeof a){for(const id of Object.keys(a)){expect(a[id].x).toBeCloseTo(b[id].x,8);expect(a[id].y).toBeCloseTo(b[id].y,8);}}
describe('detailed move operations',()=>{
 it('rescales every interval/hold without trimming, preserving geometry and identities across unequal counts',()=>{
  const p=fixture(),q=updateSetProperties(p,1,{counts:32});validateProject(q);
  expect(q.sets).toEqual(p.sets);expect(q.moves[0].paths.a.segments.map(s=>[s.id,s.startCount,s.endCount])).toEqual([['travel-a',4,12],['hold-a',12,16],['curve-a',16,24]]);
  for(const count of [0,.21,2,4,6,7,8,10,12,14,16])pointsClose(sampleProject(p,count).positions,sampleProject(q,count*2).positions);
  expect(parseProject(serializeProject(q))).toEqual(q);expect(updateSetProperties(q,1,{counts:16})).toEqual(p);
 });
 it('reverses the selected performers and exactly mirrors held/cubic geometry while leaving others and show timing intact',()=>{
  const p=fixture(),q=reversePaths(p,0,['a']);validateProject(q);
  expect(q.moves[0].counts).toBe(p.moves[0].counts);expect(q.tempoMap).toEqual(p.tempoMap);expect(q.moves[0].paths.b).toEqual(p.moves[0].paths.b);
  expect(q.sets[0].positions.b).toEqual(p.sets[0].positions.b);expect(q.sets[1].positions.a).toEqual(p.sets[0].positions.a);
  expect(q.moves[0].paths.a.segments.map(s=>[s.id,s.startCount,s.endCount])).toEqual([['curve-a',4,8],['hold-a',8,10],['travel-a',10,14]]);
  for(const transition of ['linear','ease'] as const){p.moves[0].transition=transition;q.moves[0].transition=transition;for(const count of [0,.25,2,4,6,8,10,12,14,16]){
   const expected=sampleProject(p,16-count).positions.a,actual=sampleProject(q,count).positions.a;expect(actual.x).toBeCloseTo(expected.x,8);expect(actual.y).toBeCloseTo(expected.y,8);
  }}
  expect(reversePaths(q,0,['a'])).toEqual(p);expect(parseProject(serializeProject(q))).toEqual(q);
 });
 it('preserves implicit legacy lines and all selected identities under double reversal',()=>{
  const p=fixture();delete p.moves[0].paths.a;delete p.moves[0].paths.b;
  const q=reversePaths(p,0,['a','b']);expect(q.moves[0].paths).toEqual({});expect(reversePaths(q,0,['a','b'])).toEqual(p);
  expect(()=>reversePaths(p,0,[])).toThrow(/explicitly/);expect(()=>reversePaths(p,0,['missing'])).toThrow(/existing/);
 });
 it('copies only contiguous selected segments and snapshots source geometry with explicit outer-hold policy',()=>{
  const p=fixture(),fragment=copyIntervals(p,0,'a',['hold-a','curve-a'],false,'clip',0);
  expect([fragment.startCount,fragment.endCount]).toEqual([6,12]);expect(fragment.from).toEqual({x:20,y:25});expect(fragment.to).toEqual({x:30,y:20});
  expect(()=>copyIntervals(p,0,'a',['travel-a','curve-a'],false,'clip',0)).toThrow(/contiguous/);
  expect(()=>copyIntervals(p,0,'a',['hold-a'],true,'clip',0)).toThrow(/every interval/);
  const original=p.moves[0].paths.a.segments[2];if(original.kind==='cubic')original.control1.y=1;const copied=fragment.intervals[1].segment;expect(copied.kind==='cubic'&&copied.control1.y).toBe(35);
 });
 it('pastes a whole snapshot into a different move and performer using translated coordinates and new IDs',()=>{
  const p=fixture(),clip=copy(p),q=pasteIntervals(p,1,clip,{...options,performerId:'b',frame:'translate'}).project;validateProject(q);
  expect(q.sets).toEqual(p.sets);expect(q.moves[0]).toEqual(p.moves[0]);expect(q.moves[1].paths.a).toBeUndefined();
  expect(q.moves[1].paths.b.segments.map(s=>s.id)).toEqual(['paste-test-0','paste-test-1','paste-test-2']);
  expect(q.moves[1].paths.b.segments.map(s=>[s.startCount,s.endCount])).toEqual([[1,3],[3,4],[4,6]]);
  const original=sampleProject(p,8).positions.a,actual=sampleProject(q,setStartCount(q,1)+4).positions.b;
  expect(actual).toEqual({x:original.x+30,y:original.y+10});expect(parseProject(serializeProject(q))).toEqual(q);
 });
 it('fits rotated/scaled selected curves to explicit destination endpoints and reviews changed easing',()=>{
  const p=fixture(),clip=copyIntervals(p,0,'a',['curve-a'],false,'clip',0);
  expect(()=>pasteIntervals(p,1,clip,{...options,allowTargetTiming:false})).toThrow(/destination easing/);
  const result=pasteIntervals(p,1,clip,options),q=result.project;validateProject(q);
  expect(result.scale).toBeCloseTo(2,8);expect(result.rotation).toBeCloseTo(53.13010235,7);
  expect(sampleProject(q,20).positions.a).toEqual({x:25,y:36.25});
  expect(sampleProject(q,16).positions.a).toEqual(p.sets[1].positions.a);expect(sampleProject(q,24).positions.a).toEqual(p.sets[2].positions.a);
 });
 it('rejects incompatible absolute frames and partial travel cuts; splitting a hold preserves surrounding geometry and IDs',()=>{
  const p=fixture(),clip=copy(p);expect(()=>pasteIntervals(p,1,clip,{...options,frame:'field'})).toThrow(/endpoints/);
  expect(()=>pasteIntervals(p,1,clip,{...options,startCount:1,duration:4})).toThrow(/cut an existing travel/);
  const held=copyIntervals(p,0,'a',['hold-a'],false,'clip',0),q=pasteIntervals(p,0,held,{...options,startCount:6.5,duration:.5,allowTargetTiming:false}).project;validateProject(q);
  expect(q.moves[0].paths.a.segments.map(s=>s.id)).toEqual(['travel-a','hold-a','paste-test-0','split-test-1','curve-a']);
  for(const count of [0,2,4,6,6.5,6.75,7,8,10,12,16])pointsClose(sampleProject(q,count).positions,sampleProject(p,count).positions);
 });
 it('rejects zero-duration/overflow windows and collapsed endpoints without mutating source',()=>{
  const p=fixture(),original=structuredClone(p),clip=copy(p);
  for(const update of [{duration:0},{startCount:-1},{duration:9},{duration:NaN}])expect(()=>pasteIntervals(p,1,clip,{...options,...update})).toThrow(/positive paste/);
  const closed=structuredClone(clip);closed.to={...closed.from};expect(()=>pasteIntervals(p,1,closed,options)).toThrow(/closed or stationary/);
  expect(p).toEqual(original);
 });
 it('supports maximum-roster rescaling/reversal and retains all authored intervals on reload',()=>{
  const p=createPerformanceFixture('maximum'),move=p.moves[0];move.counts=32;
  move.paths=Object.fromEntries(p.performers.map(person=>[person.id,{segments:Array.from({length:32},(_,i)=>i%2?{id:`h-${i}`,kind:'hold' as const,startCount:i,endCount:i+1}:{id:`t-${i}`,kind:'line' as const,startCount:i,endCount:i+1,...(i<30?{to:{x:20+i,y:20}}:{})})}]));
  const q=updateSetProperties(p,1,{counts:16}),r=reversePaths(q,0,p.performers.map(v=>v.id));expect(parseProject(serializeProject(r))).toEqual(r);
  const restored=reversePaths(r,0,p.performers.map(v=>v.id));for(const count of [0,.25,3,8,15.5,16])pointsClose(sampleProject(restored,count).positions,sampleProject(q,count).positions);
 });
});
