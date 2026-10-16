import { describe, expect, it } from 'vitest';
import { affinePoint, defaultTransform, fieldPivot, previewExactTransform, transformHandleValue } from './transforms';
import type { ExactTransform } from './transforms';
import { createDemoProject } from './domain';

const field = createDemoProject().field;
const points = { a: { x: 30, y: 20 }, b: { x: 36, y: 20 }, other: { x: 72, y: 40 } };
const options = (change: Partial<ExactTransform> = {}): ExactTransform => ({ ...defaultTransform(), ...change });
describe('exact selection transforms', () => {
  it('rotates clockwise about the centroid and preserves selection identity and unrelated points', () => {
    const preview = previewExactTransform(points, ['a','b'], options({ angle: 90 }), field);
    expect(preview.error).toBeNull(); expect(preview.pivot).toEqual({x:33,y:20});
    expect(preview.positions).toEqual({a:{x:33,y:17},b:{x:33,y:23},other:points.other});
    expect(points.a).toEqual({x:30,y:20}); expect(Object.keys(preview.updates)).toEqual(['a','b']);
  });
  it('supports performer, custom and field-reference pivots, including a single selected dot', () => {
    expect(previewExactTransform(points,['a','b'],options({angle:90,pivot:{kind:'performer',id:'a'}}),field).updates).toEqual({a:{x:30,y:20},b:{x:30,y:26}});
    expect(previewExactTransform(points,['a'],options({scale:2,pivot:{kind:'custom',point:{x:20,y:10}}}),field).updates.a).toEqual({x:40,y:30});
    expect(previewExactTransform(points,['a'],options({angle:180,pivot:{kind:'field',reference:'center'}}),field).updates.a.x).toBeCloseTo(70);
    expect(fieldPivot(field,'back-hash')).toEqual({x:50,y:20});
    expect(fieldPivot({...field,preset:'high-school'},'front-hash').y).toBeCloseTo(320/9);
    for (const reference of ['center','back-hash','front-hash','back-left','back-right','front-left','front-right'] as const) expect(Object.values(fieldPivot(field,reference)).every(Number.isFinite)).toBe(true);
  });
  it('reverses rotation and scale around a non-origin pivot within floating-point tolerance', () => {
    const pivot = {x:31,y:19};
    const forward = previewExactTransform(points,['a','b'],options({angle:37,scale:1.7,pivot:{kind:'custom',point:pivot}}),field);
    const inverse = previewExactTransform(forward.positions,['a','b'],options({angle:-37,scale:1/1.7,pivot:{kind:'custom',point:pivot}}),field);
    for (const id of ['a','b'] as const) { expect(inverse.updates[id].x).toBeCloseTo(points[id].x,10); expect(inverse.updates[id].y).toBeCloseTo(points[id].y,10); }
  });
  it('mirrors around field axes and a double mirror restores both sides, hashes and sidelines', () => {
    const fixture = {left:{x:0,y:0},right:{x:100,y:field.height},hash:{x:40,y:20},mid:{x:50,y:field.height/2}};
    for (const operation of ['across-50','front-back'] as const) {
      const once = previewExactTransform(fixture,Object.keys(fixture),options({operation}),field);
      for (const id of Object.keys(fixture) as (keyof typeof fixture)[]) {
        expect(once.updates[id].x).toBeCloseTo(operation==='across-50'?100-fixture[id].x:fixture[id].x,10);
        expect(once.updates[id].y).toBeCloseTo(operation==='front-back'?field.height-fixture[id].y:fixture[id].y,10);
      }
      const twice = previewExactTransform(once.positions,Object.keys(fixture),options({operation}),field);
      for (const id of Object.keys(fixture) as (keyof typeof fixture)[]) { expect(twice.updates[id].x).toBeCloseTo(fixture[id].x,10); expect(twice.updates[id].y).toBeCloseTo(fixture[id].y,10); }
    }
  });
  it('keeps out-of-field previews exact and rejects malformed pivots, scales and selections', () => {
    const outside = previewExactTransform(points,['a','b'],options({scale:100}),field);
    expect(outside.error).toContain('boundary'); expect(outside.updates.a.x).toBe(-267);
    for (const change of [{scale:0},{scale:Infinity},{scale:-1},{angle:NaN},{pivot:{kind:'performer',id:'missing'}},{pivot:{kind:'custom',point:{x:-1,y:3}}},{pivot:{kind:'field',reference:'missing'}}]) {
      expect(previewExactTransform(points,['a'],options(change as Partial<ExactTransform>),field).error).toBeTruthy();
    }
    expect(previewExactTransform(points,[],options(),field).error).toBeTruthy();
    expect(previewExactTransform(points,['missing'],options(),field).error).toBeTruthy();
    expect(previewExactTransform(points,['a','a'],options(),field).changed).toBe(false);
  });
  it('maps rotated/scaled and pivot handle gestures to the same typed geometry', () => {
    const pivot = {x:33,y:20}; const start = {x:36,y:20};
    const rotated = transformHandleValue(options(),'rotate',pivot,start,{x:33,y:23},field);
    expect(rotated.angle).toBe(90); expect(previewExactTransform(points,['a','b'],rotated,field).updates.b).toEqual({x:33,y:23});
    const scaled = transformHandleValue(options(),'scale',pivot,start,{x:39,y:20},field);
    expect(scaled.scale).toBe(2); expect(previewExactTransform(points,['a','b'],scaled,field).updates.b).toEqual({x:39,y:20});
    expect(transformHandleValue(options(),'pivot',pivot,start,{x:12,y:13},field).pivot).toEqual({kind:'custom',point:{x:12,y:13}});
    expect(affinePoint(points.a,pivot,90,1)).toEqual({x:33,y:17});
  });
});
