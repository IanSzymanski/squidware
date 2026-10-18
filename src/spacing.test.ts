import { describe, expect, it } from 'vitest';
import { defaultSpacing, previewSpacing, spacingAxis, spacingHandleValue, spacingUnit, type SpacingOptions } from './spacing';
import type { Point, Project } from './types';

const field: Project['field'] = { width: 100, height: 160 / 3, preset: 'college' };
const points = { a: { x: 10, y: 20 }, b: { x: 13, y: 22 }, c: { x: 30, y: 24 }, untouched: { x: 50, y: 10 } };
const ids = ['c', 'a', 'b'];
const preview = (options: Partial<SpacingOptions>, positions: Record<string, Point> = points, selected = ids) => previewSpacing(positions, selected, { ...defaultSpacing(), angle: 0, ...options }, field);
const close = (actual: Point, expected: Point) => { expect(actual.x).toBeCloseTo(expected.x, 8); expect(actual.y).toBeCloseTo(expected.y, 8); };

describe('exact selected-group spacing', () => {
  it.each([['start', 10], ['center', 20], ['end', 30]] as const)('aligns X to %s without changing Y, input or unselected dots', (anchor, x) => {
    const before = structuredClone(points); const result = preview({ operation: 'align', anchor });
    expect(result.error).toBeNull();
    for (const id of ids) close(result.positions[id], { x, y: points[id as keyof typeof points].y });
    expect(result.positions.untouched).toBe(points.untouched); expect(points).toEqual(before);
    expect(result.groups[0].start.x).toBe(x); expect(result.groups[0].end.x).toBe(x);
  });
  it('aligns a rank on physical Y and distributes an uneven group without changing perpendicular coordinates', () => {
    const aligned = preview({ angle: 90 });
    for (const id of ids) close(aligned.positions[id], { x: points[id as keyof typeof points].x, y: 22 });
    const result = preview({ operation: 'distribute' });
    expect(result.error).toBeNull(); expect(result.positions.b).toEqual({ x: 20, y: 22 });
    expect(result.positions.a).toEqual(points.a); expect(result.positions.c).toEqual(points.c); expect(result.groups[0].interval).toBe(10);
  });
  it.each([['start', [10, 14, 18]], ['center', [16, 20, 24]], ['end', [22, 26, 30]]] as const)('sets a 4-yard interval around %s', (anchor, xs) => {
    const result = preview({ operation: 'interval', interval: 4, unit: 'yards', anchor });
    expect(result.error).toBeNull(); ['a', 'b', 'c'].forEach((id, i) => expect(result.positions[id].x).toBe(xs[i]));
    expect(result.groups[0].interval).toBe(4); expect(result.groups[0].ids).toEqual(['a', 'b', 'c']);
  });
  it.each([6, 8, 12] as const)('uses %i-to-5 marching steps independently of grid subdivision', steps => {
    const project = { snapping: { steps, subdivision: 4, target: 'markings', group: 'individual' } } as const;
    const options = { ...defaultSpacing(), operation: 'interval', angle: 0, interval: 3 } as const;
    const result = previewSpacing(points, ids, options, field, project);
    expect(result.error).toBeNull(); expect(result.positions.b.x - result.positions.a.x).toBeCloseTo(15 / steps, 10);
    expect(spacingUnit(options, project)).toBe(5 / steps);
  });
  it('spaces block rows separately and leaves singleton lanes alone', () => {
    const block = { a: {x: 30,y: 10}, b: {x: 31,y: 10.04}, c: {x: 40,y: 10.08}, d: {x: 30,y: 15}, e: {x: 38,y: 15}, f: {x: 50,y: 25} };
    const result = preview({ operation: 'interval', lanes: true, interval: 2, unit: 'yards', anchor: 'start' }, block, Object.keys(block));
    expect(result.error).toBeNull(); expect(result.groups.map(g => g.ids)).toEqual([['a','b','c'], ['d','e'], ['f']]);
    expect(result.positions.b).toEqual({x:32,y:10.04}); expect(result.positions.c).toEqual({x:34,y:10.08});
    expect(result.positions.e).toEqual({x:32,y:15}); expect(result.positions.f).toEqual(block.f);
    const files = preview({ operation: 'interval', angle: 90, lanes: true, interval: 3, unit: 'yards', anchor: 'start' }, {a:{x:30,y:10}, b:{x:30,y:14}, c:{x:40,y:10}, d:{x:40,y:20}}, ['a','b','c','d']);
    expect(files.positions.b).toEqual({x:30,y:13}); expect(files.positions.d).toEqual({x:40,y:13});
  });
  it('uses a first-dot tolerance, not a chained lane, with deterministic singletons', () => {
    const irregular = {a:{x:20,y:10}, b:{x:30,y:10.09}, c:{x:40,y:10.18}};
    const result = preview({operation:'distribute',lanes:true,laneTolerance:.1}, irregular, ['c','b','a']);
    expect(result.groups.map(g => g.ids)).toEqual([['a','b'],['c']]); expect(result.changed).toBe(false);
  });
  it('handles rotated rows and aligns onto a rotated line using its normal axis', () => {
    const u = spacingAxis(30); const v = {x:-u.y,y:u.x};
    const point = (a:number,b:number) => ({x:50+u.x*a+v.x*b,y:25+u.y*a+v.y*b});
    const rotated = {a:point(-10,0),b:point(-8,0),c:point(10,0),d:point(-10,5),e:point(10,5)};
    const result = preview({operation:'interval',angle:30,interval:4,unit:'yards',lanes:true}, rotated, ['e','c','b','d','a']);
    expect(result.error).toBeNull(); expect(result.groups).toHaveLength(2);
    close(result.positions.a,point(-4,0)); close(result.positions.b,point(0,0)); close(result.positions.c,point(4,0));
    close(result.positions.d,point(-2,5)); close(result.positions.e,point(2,5));
    const aligned = preview({angle:120}, {a:point(-10,-2),b:point(0,1),c:point(10,4)});
    close(aligned.positions.a, point(-10,1)); close(aligned.positions.b,point(0,1)); close(aligned.positions.c,point(10,1));
  });
  it('resolves tied and coincident positions by perpendicular coordinate then stable ID independently of selection order', () => {
    const tied = {z:{x:20,y:22},b:{x:20,y:20},a:{x:20,y:20}};
    const a = preview({operation:'interval',unit:'yards',interval:2},tied,['z','b','a']);
    const b = preview({operation:'interval',unit:'yards',interval:2},tied,['a','z','b','a']);
    expect(a.updates).toEqual(b.updates); expect(a.groups[0].ids).toEqual(['a','b','z']);
    expect(a.positions.a.x).toBe(18); expect(a.positions.b.x).toBe(20); expect(a.positions.z.x).toBe(22);
  });
  it('rejects every boundary direction without clamping, and accepts exact edges', () => {
    for (const angle of [0,90,180,270,45]) {
      const result = preview({operation:'interval',angle,interval:150,unit:'yards'});
      expect(result.error).toContain('field boundary'); expect(result.changed).toBe(true);
      expect(Object.values(result.updates).some(p=>p.x<0||p.y<0||p.x>field.width||p.y>field.height)).toBe(true);
    }
    const edges = preview({operation:'interval',interval:50,unit:'yards'}, {a:{x:0,y:20},b:{x:40,y:20},c:{x:100,y:20}});
    expect(edges.error).toBeNull(); expect(edges.positions.b.x).toBe(50);
  });
  it('does not create changes for an already spaced selection or a zero-span distribution', () => {
    expect(preview({operation:'distribute'},{a:{x:0,y:20},b:{x:50,y:20},c:{x:100,y:20}}).changed).toBe(false);
    expect(preview({operation:'distribute'},{a:{x:20,y:10},b:{x:20,y:20},c:{x:20,y:30}}).changed).toBe(false);
  });
  it('validates missing selection, nonfinite coordinates and malformed options without partial updates', () => {
    for (const selected of [[],['a'],['a','missing']]) expect(preview({},points,selected).error).toBeTruthy();
    for (const patch of [{angle:NaN},{angle:4000},{interval:0},{interval:Infinity},{interval:-1},{unit:'pixels'},{operation:'resize'},{anchor:'roster'},{lanes:1},{laneTolerance:-1},{laneTolerance:NaN}] as Partial<SpacingOptions>[]) {
      const result=preview(patch); expect(result.error).toBeTruthy(); expect(result.updates).toEqual({});
    }
    expect(preview({}, {...points, a:{x:NaN,y:20}}).error).toContain('finite');
  });
  it.each(['start','center','end'] as const)('handle editing agrees with numeric interval around %s', anchor => {
    const options = {...defaultSpacing(),operation:'interval',angle:0,unit:'yards',interval:4,anchor} as const;
    const result = previewSpacing(points,ids,options,field); const group=result.groups[0];
    const from=anchor==='end'?group.start:group.end; const dx=anchor==='center'?2:anchor==='end'?-4:4;
    const next=spacingHandleValue(options,group,from,{x:from.x+dx,y:from.y},{});
    expect(next.interval).toBe(6);
    expect(previewSpacing(points,ids,next,field).updates).toEqual(preview({operation:'interval',unit:'yards',interval:6,anchor}).updates);
  });
  it('keeps a dense 500-performer block in 20 stable lanes at exact intervals', () => {
    const block=Object.fromEntries(Array.from({length:500},(_,i)=>[String(i).padStart(3,'0'),{x:20+(i%25)*.75,y:10+Math.floor(i/25)*1.5}]));
    const result=preview({operation:'interval',lanes:true,interval:1,unit:'yards'},block,Object.keys(block).reverse());
    expect(result.error).toBeNull(); expect(result.groups).toHaveLength(20);
    for(const group of result.groups) for(let i=1;i<group.ids.length;i++) expect(result.positions[group.ids[i]].x-result.positions[group.ids[i-1]].x).toBeCloseTo(1,9);
  });
});
