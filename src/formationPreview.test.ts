import { describe, expect, it } from 'vitest';
import { formationHandleValue, formationPoint, previewFormation } from './formationPreview';
import type { FormationKind, FormationOptions } from './types';

const field = { width: 100, height: 160/3, preset: 'college' as const };
const options: FormationOptions = { center: { x: 50, y: 25 }, width: 20, height: 10, rotation: 0, columns: 2 };
const positions = { a: { x: 20,y:20 }, b: { x: 30,y:30 }, c: { x: 40,y:20 }, other: { x: 70,y:40 } };

describe('exact formation destinations', () => {
  it.each<FormationKind>(['line','arc','circle','block','curve'])('previews %s without altering original or unrelated positions', kind => {
    const before = structuredClone(positions);
    const result = previewFormation(positions,['a','b','c'],kind,options,field);
    expect(result.error).toBeNull(); expect(result.changed).toBe(true);
    expect(result.positions.other).toBe(positions.other); expect(positions).toEqual(before);
    expect(Object.keys(result.updates)).toEqual(['a','b','c']);
  });
  it('uses exact numeric destinations in roster order and reports boundary errors without shrinking', () => {
    expect(previewFormation(positions,['a','b','c'],'line',options,field).updates).toEqual({a:{x:40,y:25},b:{x:50,y:25},c:{x:60,y:25}});
    const result = previewFormation(positions,['a','b'],'line',{...options,center:{x:2,y:20}},field);
    expect(result.error).toMatch(/boundary/); expect(result.updates.a).toEqual({x:-8,y:20}); expect(result.updates.b).toEqual({x:12,y:20});
    expect(previewFormation(positions,['a','b'],'line',{...options,center:{x:10,y:20}},field).error).toBeNull();
  });
  it('rejects empty, duplicate, unknown and non-finite parameters and supports 500 exact destinations', () => {
    for (const ids of [[],['a','a'],['missing']]) expect(previewFormation(positions,ids,'line',options,field).error).toBeTruthy();
    for (const patch of [{width:NaN},{height:Infinity},{rotation:Infinity},{columns:2.5},{center:{x:50,y:60}}]) expect(previewFormation(positions,['a'],'arc',{...options,...patch},field).error).toBeTruthy();
    const ids = Array.from({length:500},(_,i)=>`p${i}`);
    const original = Object.fromEntries(ids.map(id=>[id,{x:50,y:25}]));
    const result = previewFormation(original,ids,'block',{...options,width:90,height:45,columns:25},field);
    expect(result.error).toBeNull(); expect(Object.keys(result.updates)).toHaveLength(500);
    expect(result.updates.p0).toEqual({x:5,y:2.5}); expect(result.updates.p499).toEqual({x:95,y:47.5});
  });
});

describe('formation handle parameters', () => {
  it('keeps the opposite line endpoint fixed while moving and rotating the other', () => {
    const next = formationHandleValue('line',options,'end',{x:60,y:25},{x:40,y:45},field);
    expect(next.width).toBe(20); expect(next.rotation).toBe(90); expect(next.center).toEqual({x:40,y:35});
    const result = previewFormation(positions,['a','b'],'line',next,field);
    expect(result.updates.a.x).toBeCloseTo(40); expect(result.updates.a.y).toBeCloseTo(25);
    expect(result.updates.b.x).toBeCloseTo(40); expect(result.updates.b.y).toBeCloseTo(45);
  });
  it('moves arc bulge while holding the baseline endpoints fixed, including rotated arcs', () => {
    for (const rotation of [0,45,180]) {
      const original = {...options,rotation};
      const next = formationHandleValue('arc',original,'bulge',formationPoint(original,0,5),formationPoint(original,0,15),field);
      expect(next.height).toBe(20);
      const baseline = formationPoint(next,-10,-10); const before = formationPoint(original,-10,-5);
      expect(baseline.x).toBeCloseTo(before.x,5); expect(baseline.y).toBeCloseTo(before.y,5);
    }
  });
  it('changes width/depth in local axes and derives rotation and bounded center from the pointer', () => {
    const rotated = {...options,rotation:90};
    expect(formationHandleValue('block',rotated,'width',{x:50,y:35},{x:50,y:40},field).width).toBe(30);
    expect(formationHandleValue('block',rotated,'depth',{x:45,y:25},{x:40,y:25},field).height).toBe(20);
    expect(formationHandleValue('circle',options,'rotate',{x:60,y:25},{x:50,y:35},field).rotation).toBe(90);
    expect(formationHandleValue('curve',options,'center',options.center,{x:-10,y:100},field).center).toEqual({x:0,y:53.333333});
  });
});
