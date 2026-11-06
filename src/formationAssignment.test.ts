import { describe, expect, it } from 'vitest';
import { formationAssignmentOrder, formationCenter, shortestTravelOrder } from './formationAssignment';
import { createDemoProject, generateFormation } from './domain';
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

/** Proper crossings only: shared endpoints and collinear overlaps do not count. */
function properCrossings(from: Record<string, Point>, to: Record<string, Point>): number {
  const side = (a: Point, b: Point, c: Point) => { const v = (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x); return Math.abs(v) < 1e-9 ? 0 : Math.sign(v); };
  const names = Object.keys(to); let count = 0;
  names.forEach((a, i) => names.slice(i+1).forEach(b => {
    const [p, q, r, t] = [from[a], to[a], from[b], to[b]];
    const s1 = side(p,q,r), s2 = side(p,q,t), s3 = side(r,t,p), s4 = side(r,t,q);
    if (s1 && s2 && s3 && s4 && s1 !== s2 && s3 !== s4) count++;
  }));
  return count;
}
const mapped = (order: readonly string[], points: readonly Point[]) => Object.fromEntries(order.map((id, i) => [id, points[i]]));
const total = (from: Record<string, Point>, to: Record<string, Point>) => Object.keys(to).reduce((sum, id) => sum + Math.hypot(to[id].x-from[id].x, to[id].y-from[id].y), 0);

describe('shortest-travel formation assignment', () => {
  it('uncrosses reversed groups and the demo brass arc that positional order crosses', () => {
    const line = generateFormation('line', 4, options);
    expect(properCrossings(positions, mapped(shortestTravelOrder(positions, ids, line), line))).toBe(0);
    expect(shortestTravelOrder(positions, ids, line)).toEqual(formationAssignmentOrder(positions, ids, 'line', options));
    const project = createDemoProject(), brass = project.performers.filter(p => p.sectionId === project.sections[0].id).map(p => p.id), source = project.sets[0].positions;
    const arc = { ...options, center: formationCenter(source, brass), width: 45, height: 22, columns: 8 }, slots = generateFormation('arc', brass.length, arc);
    const positional = mapped(formationAssignmentOrder(source, brass, 'arc', arc), slots), shortest = mapped(shortestTravelOrder(source, brass, slots), slots);
    expect(brass).toHaveLength(24); expect(properCrossings(source, positional)).toBeGreaterThan(0);
    expect(properCrossings(source, shortest)).toBe(0); expect(total(source, shortest)).toBeLessThan(total(source, positional));
  });
  it('is invariant under roster and selection shuffles, including tied positions', () => {
    for (const kind of ['line','arc','circle','block','curve'] as FormationKind[]) {
      const slots = generateFormation(kind, 4, options);
      for (const source of [positions, Object.fromEntries(ids.map(id=>[id,{x:50,y:25}])), { a:{x:40,y:20}, b:{x:40,y:20}, c:{x:60,y:30}, d:{x:60,y:30} }]) {
        const expected = shortestTravelOrder(source, ids, slots);
        for (const order of [['d','c','b','a'],['b','d','a','c']]) expect(shortestTravelOrder(source, order, slots)).toEqual(expected);
      }
    }
    expect(shortestTravelOrder({ z:{x:5,y:5}, a:{x:5,y:5} }, ['z','a'], [{x:0,y:0},{x:10,y:10}])).toEqual(['a','z']);
  });
  it('matches exhaustive minimum totals for small selections', () => {
    let seed = 7; const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const permutations = (items: string[]): string[][] => items.length < 2 ? [items] : items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i+1)]).map(rest => [item, ...rest]));
    for (let n = 1; n <= 6; n++) for (let fixture = 0; fixture < 5; fixture++) {
      const names = Array.from({ length: n }, (_, i) => 'p' + i), source = Object.fromEntries(names.map(id => [id, { x: random()*100, y: random()*53 }]));
      const slots = names.map(() => ({ x: random()*100, y: random()*53 }));
      const best = Math.min(...permutations(names).map(order => total(source, mapped(order, slots))));
      const order = shortestTravelOrder(source, names, slots);
      expect(new Set(order).size).toBe(n); expect(total(source, mapped(order, slots))).toBeCloseTo(best, 9);
      expect(properCrossings(source, mapped(order, slots))).toBe(0);
    }
  });
  it('rejects incomplete plans and non-finite sources', () => {
    expect(() => shortestTravelOrder(positions, ids, [{x:0,y:0}])).toThrow(/every selected performer/);
    expect(() => shortestTravelOrder(positions, ['a','a'], [{x:0,y:0},{x:1,y:1}])).toThrow(/every selected performer/);
    expect(() => shortestTravelOrder({ a:{x:NaN,y:0}, b:{x:1,y:1} }, ['a','b'], [{x:0,y:0},{x:1,y:1}])).toThrow(/finite/);
    expect(shortestTravelOrder(positions, [], [])).toEqual([]);
  });
});
