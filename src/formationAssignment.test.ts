import { describe, expect, it } from 'vitest';
import { formationAssignmentOrder, formationCenter } from './formationAssignment';
import { generateFormation } from './domain';
import { previewFormation } from './formationPreview';
import type { FormationKind, FormationOptions, Point } from './types';

const field = { width: 100, height: 160/3, preset: 'college' as const };
const options: FormationOptions = { center: {x:50,y:25}, width:24, height:12, rotation:0, columns:2, assignment:'position' };
const ids = ['a','b','c','d'];
const positions = { a:{x:65,y:20}, b:{x:55,y:20}, c:{x:45,y:20}, d:{x:35,y:20} };

describe('identity-preserving formation assignment', () => {
  it.each<FormationKind>(['line','arc','block','circle','curve'])('%s is invariant under roster and selection shuffles, including tied positions', kind => {
    for (const source of [positions, Object.fromEntries(ids.map(id=>[id,{x:50,y:25}]))]) {
      const expected = previewFormation(source,ids,kind,options,field);
      for (const order of [['d','c','b','a'],['b','d','a','c']]) expect(previewFormation(source,order,kind,options,field)).toEqual(expected);
    }
  });
  it.each<FormationKind>(['line','arc','curve'])('%s retains left-to-right position order with explicit roster fallback', kind => {
    const result=previewFormation(positions,ids,kind,options,field);
    expect(formationAssignmentOrder(positions,ids,kind,options)).toEqual(['d','c','b','a']);
    expect(result.updates.d.x).toBeLessThan(result.updates.c.x); expect(result.updates.c.x).toBeLessThan(result.updates.b.x); expect(result.updates.b.x).toBeLessThan(result.updates.a.x);
    const roster=previewFormation(positions,ids,kind,{...options,assignment:'roster'},field);
    expect(roster.updates.a.x).toBeLessThan(roster.updates.d.x);
    expect(previewFormation(positions,ids,kind,{...options,assignment:undefined},field)).toEqual(roster);
  });
  it('uses rotated local axes for scattered blocks, with complete and partial rows', () => {
    const source = { a:{x:40,y:10}, b:{x:20,y:11}, c:{x:30,y:9}, d:{x:20,y:30}, e:{x:40,y:29} };
    const names=Object.keys(source); const block={...options,columns:3};
    const expected=['b','c','a','d','e'];
    expect(formationAssignmentOrder(source,names,'block',block)).toEqual(expected);
    const rotate = (p:Point) => ({x:60-p.y,y:p.x});
    expect(formationAssignmentOrder(Object.fromEntries(names.map(id=>[id,rotate(source[id as keyof typeof source])])),names.reverse(),'block',{...block,rotation:90})).toEqual(expected);
  });
  it.each([0,45,90,180])('preserves circle winding and seam ties at %s degrees', rotation => {
    const names=['top','right','bottom','left']; const shape={...options,rotation};
    const source=Object.fromEntries(generateFormation('circle',4,shape).map((point,i)=>[names[i],point]));
    expect(formationAssignmentOrder(source,[...names].reverse(),'circle',shape)).toEqual(names);
  });
  it('breaks equal-axis positions by depth, then stable ID, independent of roster order', () => {
    const source={z:{x:20,y:20},a:{x:20,y:20},m:{x:20,y:21},b:{x:30,y:20}};
    expect(formationAssignmentOrder(source,['z','m','b','a'],'line',options)).toEqual(['a','z','m','b']);
    expect(formationCenter(source,['z','m','b','a'])).toEqual(formationCenter(source,['a','b','m','z']));
  });
  it('compares crossings and travel for reversed groups without claiming global optimization', () => {
    const positional=previewFormation(positions,ids,'line',options,field);
    const roster=previewFormation(positions,ids,'line',{...options,assignment:'roster'},field);
    // All source points share one baseline and all destinations another. A
    // reversed endpoint order is exactly one proper crossing for each pair.
    const crossings=(updates:Record<string,Point>)=>ids.flatMap((a,i)=>ids.slice(i+1).map(b=>(positions[a as keyof typeof positions].x-positions[b as keyof typeof positions].x)*(updates[a].x-updates[b].x)<0?1:0)).reduce<number>((sum,n)=>sum+n,0);
    expect(crossings(positional.updates)).toBe(0); expect(crossings(roster.updates)).toBe(6);
    expect(positional.travel!.total).toBeCloseTo(2*Math.sqrt(34)+2*Math.sqrt(26));
    expect(positional.travel!.maximum).toBeCloseTo(Math.sqrt(34));
    expect(positional.travel!.total).toBeLessThan(roster.travel!.total);
  });
  it('rejects invalid plans, modes and source points, and supports 500 deterministic assignments', () => {
    for(const plan of [[],['a','b','c','c'],['a','b','c','missing']]) expect(previewFormation(positions,ids,'line',options,field,plan).error).toMatch(/assignment/);
    expect(previewFormation(positions,ids,'line',{...options,assignment:'invalid' as 'position'},field).error).toMatch(/assignment/);
    expect(previewFormation({...positions,a:{x:NaN,y:20}},ids,'line',options,field).error).toMatch(/finite/);
    const names=Array.from({length:500},(_,i)=>'p'+String(i).padStart(3,'0'));
    const source=Object.fromEntries(names.map(id=>[id,{x:50,y:25}]));
    const result=previewFormation(source,[...names].reverse(),'block',{...options,columns:25},field);
    expect(result.error).toBeNull(); expect(Object.keys(result.updates)).toEqual(names); expect(Object.keys(result.updates)).toHaveLength(500);
    expect(source[names[0]]).toEqual({x:50,y:25});
  });
});
