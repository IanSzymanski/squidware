import { describe,expect,it } from 'vitest';
import { formatDrillCoordinate,parseDrillCoordinate,parseDrillMove,previewCoordinateEntry,type CoordinateEntryOptions,type DrillContext } from './drillEntry';
import type { Point,Project } from './types';

const field:Project['field']={width:100,height:160/3,preset:'college'};
const context:DrillContext={side:null,defaultUnit:'steps',stepsPerFive:8};
const near=(actual:Point,expected:Point)=>{expect(actual.x).toBeCloseTo(expected.x,8);expect(actual.y).toBeCloseTo(expected.y,8);};
const parse=(text:string,patch:Partial<DrillContext>={},f=field)=>parseDrillCoordinate(text,f,{...context,...patch});
const move=(text:string,patch:Partial<DrillContext>={})=>parseDrillMove(text,{...context,...patch});
const options=(patch:Partial<CoordinateEntryOptions>={}):CoordinateEntryOptions=>({mode:'relative',text:'3 steps forward',side:null,defaultUnit:'steps',...patch});

describe('strict drill coordinate parsing',()=>{
  it.each([[1,37.5],[2,62.5]] as const)('resolves Side %i outside the 40 and behind front hash', (side,x)=>{
    near(parse(`Side ${side}: 4 outside the 40; 6 behind front hash`),{x,y:field.height-20-3.75});
    near(parse('4 steps outside the 40-yard line, 6 steps behind the front hash',{side}),{x,y:field.height-20-3.75});
  });
  it('supports goal lines, neutral midfield, both sides and all explicit vertical references',()=>{
    near(parse('Side 1: on the goal line; on back sideline'),{x:0,y:0});
    near(parse('Side 2: on the 0-yard line; on front sideline'),{x:100,y:field.height});
    near(parse('On the 50-yard line; on back hash'),{x:50,y:20});
    near(parse('Side 2: on the 40 yard line; on front hash'),{x:60,y:field.height-20});
    near(parse('Side 1: 2 inside the 40; 2 in front of back hash'),{x:41.25,y:21.25});
  });
  it.each([6,8,12] as const)('uses the explicit %i-to-5 step basis with quarter/half steps',stepsPerFive=>{
    near(parse('Side 1: 0.5 steps inside the 40; .25 steps in front of back hash',{stepsPerFive}),{x:40+2.5/stepsPerFive,y:20+1.25/stepsPerFive});
  });
  it('resolves school hashes through the same reference geometry as formatting',()=>{
    const school={...field,preset:'high-school'} as const;
    near(parse('Side 1: on the 35; 1 step behind front hash',{},school),{x:35,y:field.height-160/9-.625});
    near(parse('Side 2: on the 35; on the back hash',{},school),{x:65,y:160/9});
  });
  it('treats explicit units as authoritative and requires an explicit convention for bare numbers',()=>{
    near(parse('4 outside the 40; 6 behind front hash',{side:1,defaultUnit:'yards'}),{x:36,y:field.height-26});
    near(parse('Side 2: 4 steps outside the 40; 1.25 yards behind front hash',{defaultUnit:null}),{x:62.5,y:field.height-21.25});
    expect(()=>parse('Side 1: 4 outside the 40; 6 behind front hash',{defaultUnit:null})).toThrow(/Units are missing/);
    near(parse('Side 1: on the 40; on back hash',{defaultUnit:null}),{x:40,y:20});
  });
  it('rejects ambiguous side/hash/axis, contradictory side and crossing midfield instead of guessing',()=>{
    for(const text of ['4 outside the 40; 6 behind front hash','on the goal line; on back hash'])expect(()=>parse(text)).toThrow(/Choose Side/);
    expect(()=>parse('Side 1: on the 40; on back hash',{side:2})).toThrow(/conflicts/);
    expect(()=>parse('Side 1: 1 inside the 50; on back hash')).toThrow(/contradict/);
    for(const text of ['Side 1: on the 40','Side 1: on the 40; on hash','Side 1: on the 40; 4 behind hash','on the 50;','on the 50; on front hash; ignored'])expect(()=>parse(text)).toThrow();
  });
  it('rejects malformed, negative, nonfinite, overly long and trailing input',()=>{
    for(const text of ['Side 1: -3 steps inside the 40; on back hash','Side 1: Infinity inside the 40; on back hash','Side 1: 1e2 inside the 40; on back hash','Side 1: on the 90; on back hash','Side 1: on the 40; on front hash please','Side 3: on the 40; on front hash',' '.repeat(241),''])expect(()=>parse(text)).toThrow();
    expect(()=>parse('Side 1: 1000001 steps inside the 0; on back hash')).toThrow(/finite distance/);
  });
  it('normalizes case and whitespace without evaluating arbitrary text',()=>{
    near(parse('  SIDE 2: ON THE 40-YARD LINE; \n ON BACK HASH  '),{x:60,y:20});
    expect(()=>parse('Side 1: on the 40; on back hash; process.exit()')).toThrow();
  });
});

describe('formatter/parser precision round trips',()=>{
  it.each([6,8,12] as const)('round trips %i-to-5 on both field presets within the selected precision',stepsPerFive=>{
    for(const preset of ['college','high-school'] as const)for(const coordinatePrecision of ['whole','half','quarter','decimal'] as const)for(const coordinateDecimals of [0,1,2] as const){
      const f={...field,preset};const increment=coordinatePrecision==='whole'?1:coordinatePrecision==='half'?.5:coordinatePrecision==='quarter'?.25:10**-coordinateDecimals;
      const tolerance=increment*5/stepsPerFive/2+1e-8;
      for(const x of [0,.01,2.5,38.78125,40,47.5,49.99,50,50.01,60,99.99,100])for(const y of [0,.01,10,160/9,20,field.height/2,field.height-20,field.height-.01,field.height]){
        const phrase=formatDrillCoordinate({x,y},f,stepsPerFive,{coordinatePrecision,coordinateDecimals});
        const result=parseDrillCoordinate(phrase,f,{...context,stepsPerFive,defaultUnit:null});
        expect(Math.abs(result.x-x),phrase).toBeLessThanOrEqual(tolerance);expect(Math.abs(result.y-y),phrase).toBeLessThanOrEqual(tolerance);
      }
    }
  });
});

describe('relative drill moves',()=>{
  it.each([['3 steps forward',{x:0,y:1.875}],['3 steps back',{x:0,y:-1.875}],['2 yards right',{x:2,y:0}],['2 yd left',{x:-2,y:0}],['1.5 steps toward the side 2',{x:.9375,y:0}],['3 steps toward back sideline',{x:0,y:-1.875}]] as const)('parses %s along physical field axes',(text,expected)=>near(move(text),expected));
  it('accepts two distinct axes and mixed explicit units, regardless of clause order',()=>{
    near(move('3 steps forward, 2 yards left'),{x:-2,y:1.875});
    near(move('2 yards left and 3 steps forward'),{x:-2,y:1.875});
    near(move('3 forward; 2 right',{defaultUnit:'yards'}),{x:2,y:3});
    near(move('3 steps forward',{stepsPerFive:6,defaultUnit:null}),{x:0,y:2.5});
    near(move('3 steps forward',{stepsPerFive:12}),{x:0,y:1.25});
  });
  it('rejects repeated axes, missing units, incomplete phrases and unsupported facing language',()=>{
    for(const text of ['3 steps forward, 2 steps back','2 yards left, 1 yard right','3 steps','forward 3 steps','-3 steps forward','3 steps northeast','3 steps in my facing direction','3 steps forward, 2 steps left, 1 yard back','3 steps forward garbage'])expect(()=>move(text)).toThrow();
    expect(()=>move('3 forward',{defaultUnit:null})).toThrow(/Units are missing/);
  });
});

describe('exact coordinate entry previews',()=>{
  const points={a:{x:30.12,y:20.03},b:{x:35.31,y:23.27},c:{x:70,y:10}};
  it('moves only selected IDs by an exact common delta without snapping or mutating input',()=>{
    const before=structuredClone(points);const project={field,snapping:{steps:6,subdivision:4,target:'markings',group:'individual'}} as const;
    const result=previewCoordinateEntry(points,['b','a','a'],options({text:'3 steps forward, 2 steps right'}),project);
    expect(result.error).toBeNull();near(result.positions.a,{x:30.12+10/6,y:22.53});near(result.positions.b,{x:35.31+10/6,y:25.77});
    near({x:result.positions.b.x-result.positions.a.x,y:result.positions.b.y-result.positions.a.y},{x:points.b.x-points.a.x,y:points.b.y-points.a.y});
    expect(result.positions.c).toBe(points.c);expect(points).toEqual(before);
  });
  it('places a singleton with field syntax and rejects absolute group placement',()=>{
    const result=previewCoordinateEntry(points,['a'],options({mode:'absolute',text:'Side 2: 4 outside the 40; on back hash'}),{field});
    expect(result.error).toBeNull();near(result.positions.a,{x:62.5,y:20});expect(result.positions.b).toBe(points.b);
    expect(previewCoordinateEntry(points,['a','b'],options({mode:'absolute',text:'on the 50; on back hash'}),{field}).error).toMatch(/requires one/);
  });
  it('rejects the whole boundary-crossing preview without shortening the delta or clamping any performer',()=>{
    for(const text of ['100 yards forward','100 yards back','100 yards left','100 yards right']){
      const result=previewCoordinateEntry(points,['a','b'],options({text}),{field});expect(result.error).toContain('field boundary');
      expect(result.parsed?.mode).toBe('relative');expect(result.changed).toBe(true);
      near({x:result.positions.b.x-result.positions.a.x,y:result.positions.b.y-result.positions.a.y},{x:points.b.x-points.a.x,y:points.b.y-points.a.y});
    }
    const off=previewCoordinateEntry(points,['a'],options({mode:'absolute',text:'Side 2: 2 yards outside the goal line; 1 yard in front of front sideline'}),{field});
    expect(off.error).toContain('field boundary');near(off.positions.a,{x:102,y:field.height+1});
  });
  it('accepts exact edges, recognizes no-ops, and never keeps an earlier valid result after invalid input',()=>{
    const edge=previewCoordinateEntry(points,['a'],options({mode:'absolute',text:'Side 1: on the goal line; on back sideline'}),{field});expect(edge.error).toBeNull();near(edge.positions.a,{x:0,y:0});
    expect(previewCoordinateEntry(points,['a'],options({text:'0 steps forward'}),{field}).changed).toBe(false);
    const bad=previewCoordinateEntry(points,['a'],options({text:'3 steps'}),{field});expect(bad.error).toBeTruthy();expect(bad.updates).toEqual({});expect(bad.positions).toBe(points);
    for(const ids of [[],['missing']])expect(previewCoordinateEntry(points,ids,options(),{field}).error).toBeTruthy();
  });
  it('translates 500 irregular performers while preserving every pair offset',()=>{
    const dense=Object.fromEntries(Array.from({length:500},(_,i)=>[String(i),{x:10+(i%25)*2.3,y:8+Math.floor(i/25)*1.7}]));
    const result=previewCoordinateEntry(dense,Object.keys(dense),options({text:'0.25 steps forward, 0.5 steps right'}),{field});
    expect(result.error).toBeNull();expect(Object.keys(result.updates)).toHaveLength(500);
    for(const id of Object.keys(dense))near({x:result.positions[id].x-dense[id].x,y:result.positions[id].y-dense[id].y},{x:.3125,y:.15625});
  });
});
