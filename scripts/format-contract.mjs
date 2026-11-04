import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function formatTools() {
  const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
  const output = path.join(root, '.qa/format/contract.cjs'); await fs.mkdir(path.dirname(output), { recursive: true });
  await esbuild.build({ stdin: { contents: `export {PROJECT_LIMITS,parseProject,serializeProject,sampleProject,countToSeconds,secondsToCount} from './src/domain'; export {projectV2AsLegacy} from './src/projectV2'; export {createPerformanceFixture} from './src/performanceFixtures';`, resolveDir: root },
    outfile: output, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  delete require.cache[output]; return require(output);
}
export function formatSchema(version, limits) {
  const ref = name => ({ $ref: `#/definitions/${name}` });
  const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required });
  const number = (minimum, maximum, integer = false) => ({ type: integer ? 'integer' : 'number', minimum, maximum });
  const text = (maximum, empty = false) => ({ type: 'string', maxLength: maximum, ...(empty ? {} : { minLength: 1 }), pattern: empty ? '^[^\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f]*$' : '^(?=[\\s\\S]*\\S)[^\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f]*$' });
  const id = { type: 'string', minLength: 1, maxLength: limits.text.id, pattern: '^[A-Za-z0-9_-]+$', not: { enum: ['__proto__','constructor','prototype'] } };
  const array = (items, minItems, maxItems) => ({ type: 'array', items, minItems, maxItems });
  const timing = { tempo: number(limits.tempo.min,limits.tempo.max), transition: { enum: ['linear','ease'] } };
  const picture = { id: ref('id'), name: text(limits.text.setName), notes: text(limits.text.notes,true), positions: { type: 'object', maxProperties: limits.performers, propertyNames: ref('id'), additionalProperties: ref('point') } };
  const definitions = {
    id,
    point: object({ x: number(0,100), y: number(0,160/3) }),
    section: object({ id:ref('id'),name:text(limits.text.sectionName),color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'} }),
    performer: object({id:ref('id'),label:text(limits.text.performerLabel),name:text(limits.text.performerName,true),sectionId:ref('id')}),
  };
  const properties = {
    schemaVersion:{const:version}, id:ref('id'),title:text(limits.text.title),ensemble:text(limits.text.ensemble,true),
    field:object({width:{const:100},height:number(160/3-.001,160/3+.001),preset:{enum:['college','high-school']}}),
    sections:array(ref('section'),1,limits.sections), performers:array(ref('performer'),0,limits.performers),
    sets:array(ref('picture'),1,limits.sets),audioOffsetSeconds:number(limits.audioOffsetSeconds.min,limits.audioOffsetSeconds.max),
  };
  if (version >= 2) {
    definitions.picture = {...object(picture),not:{anyOf:['counts','tempo','transition',...(version<7?['liveFormations']:[])].map(key=>({required:[key]}))}};
    if (version >= 7) {
      definitions.liveFormation = object({ id:ref('id'), name:{...text(limits.text.groupName),pattern:'^(?=[\\s\\S]*\\S)[^\\u0000-\\u001f]*$'}, kind:{enum:['line','arc','circle','block','curve']},
        options:object({center:ref('point'),width:number(.1,200),height:number(0,200),rotation:number(-3600,3600),columns:number(1,limits.performers,true),assignment:{enum:['position','roster']}}),
        slotCount:number(1,limits.performers,true),members:array(object({performerId:ref('id'),slot:number(0,limits.performers-1,true)}),1,limits.performers) });
      if (version>=9) {
        definitions.bezierAnchor=object({id:ref('id'),point:ref('point'),incoming:ref('point'),outgoing:ref('point'),mode:{enum:['corner','smooth','symmetric']}});
        definitions.liveFormation.properties.bezier=object({anchors:array(ref('bezierAnchor'),2,33)});
      }
      if(version>=10) {
        definitions.scatterRegion=object({kind:{enum:['rectangle','ellipse','polygon']},vertices:array(ref('point'),2,32)});
        definitions.liveFormation.properties.scatter=object({version:{const:1},seed:{...text(80),pattern:'^(?=[\\s\\S]*\\S)[^\\u0000-\\u001f]*$'},region:ref('scatterRegion'),minimumSpacing:number(.1,100),distribution:{enum:['uniform','clustered']},clusterStrength:number(0,1),points:array(ref('point'),1,limits.performers),pinnedSlots:{...array(number(0,limits.performers-1,true),0,limits.performers),uniqueItems:true}});
      } else definitions.liveFormation.not={anyOf:[...(version<9?[{required:['bezier']}]:[]),{required:['scatter']}]};
      if(version>=11) {
        const pair=object({performerId:ref('id'),slot:number(0,limits.performers-1,true)});
        const role={...text(40),pattern:'^(?=[\\s\\S]*\\S)[^\\u0000-\\u001f]*$'};
        definitions.liveFormation.properties.assignmentConstraints=object({pins:array(pair,0,limits.performers),forbidden:array(pair,0,5000),sectionSlots:array(object({slot:number(0,limits.performers-1,true),sectionId:ref('id')}),0,limits.performers),roleSlots:array(object({slot:number(0,limits.performers-1,true),role}),0,limits.performers),roles:{type:'object',maxProperties:limits.performers,propertyNames:ref('id'),additionalProperties:role},unknownRoles:{enum:['reject','allow']},orderedGroups:array(object({id:ref('id'),name:text(80),performerIds:array(ref('id'),2,limits.performers),slots:array(number(0,limits.performers-1,true),2,limits.performers)}),0,64)});
      } else {
        const old=definitions.liveFormation.not;
        definitions.liveFormation.not={anyOf:[...(old?.anyOf??(old?[old]:[])),{required:['assignmentConstraints']}]};
      }
      definitions.picture.properties.liveFormations = array(ref('liveFormation'),0,limits.performers);
    }
    definitions.segment = object({id:ref('id'),kind:{const:'line'},startCount:{const:0},endCount:number(limits.counts.min,limits.counts.max,true)});
    if (version >= 5) definitions.segment = { oneOf: [definitions.segment, object({id:ref('id'),kind:{const:'cubic'},startCount:{const:0},endCount:number(limits.counts.min,limits.counts.max,true),control1:ref('point'),control2:ref('point')})] };
    if (version >= 6) {
      const interval = { id: ref('id'), startCount: number(0,limits.counts.max), endCount: { type:'number',exclusiveMinimum:0,maximum:limits.counts.max } };
      const travel = { ...interval, kind: { const:'line' }, to: ref('point') };
      const cubic = { ...interval, kind: { const:'cubic' }, to: ref('point'), control1: ref('point'), control2: ref('point') };
      definitions.segment = { oneOf: [object(travel,Object.keys(travel).filter(k=>k!=='to')),object(cubic,Object.keys(cubic).filter(k=>k!=='to')),
        { ...object({ ...interval, kind: { const:'hold' } }), not: { anyOf: ['to','control1','control2'].map(key=>({required:[key]})) } }] };
    }
    definitions.path = object({segments:array(ref('segment'),1,version>=6?limits.pathSegments:1)});
    definitions.move = object({id:ref('id'),fromSetId:ref('id'),toSetId:ref('id'),counts:number(limits.counts.min,limits.counts.max,true),...timing,paths:{type:'object',maxProperties:limits.performers,propertyNames:ref('id'),additionalProperties:ref('path')}});
    if(version>=12) {
      definitions.groupMotion=object({id:ref('id'),name:{...text(80),pattern:'^(?=[\\s\\S]*\\S)[^\\u0000-\\u001f]*$'},routeId:ref('id'),mode:{enum:['follow','countermarch','conveyor']},members:{...array(ref('id'),2,limits.performers),uniqueItems:true},delay:number(0,4096),interval:number(.01,1000),offsetDirection:{enum:[-1,1]},phase:number(-1000000,1000000),speed:number(.001,100),entryCounts:number(0,limits.counts.max),exitCounts:number(0,limits.counts.max),endpointPolicy:{enum:['reject','hold']},cues:array(object({count:number(-499*4096,limits.counts.max),direction:{enum:[-1,0,1]}}),1,32)});
      definitions.move.properties.groupMotions=array(ref('groupMotion'),0,32);
    } else definitions.move.not={required:['groupMotions']};
    definitions.path.not={required:['linearCounts']};
    definitions.selectionGroup = object({ id: ref('id'), name: { ...text(limits.text.groupName), pattern: '^(?=[\\s\\S]*\\S)[^\\u0000-\\u001f]*$' }, performerIds: { ...array(ref('id'), 0, limits.performers), uniqueItems: true } });
    const analysisThreshold = number(limits.analysisThreshold.min, limits.analysisThreshold.max);
    const thresholds = { minimumSpacing: analysisThreshold, maximumStride: analysisThreshold };
    definitions.analysisOverrides = object(thresholds, []);
    definitions.directionRules = { ...object(Object.fromEntries(['forward','backward','sideways'].map(d => [d, ref('analysisOverrides')])), []), additionalProperties: false };
    definitions.sectionAnalysisRules = object({ sectionId: ref('id'), ...thresholds, directions: ref('directionRules') }, ['sectionId']);
    definitions.projectAnalysisRules = object({ defaults: object(thresholds), directions: ref('directionRules'), sections: array(ref('sectionAnalysisRules'), 0, limits.sections) }, ['defaults']);
    properties.analysisRules = ref('projectAnalysisRules');
    properties.meter = object({ numerator: number(1,32,true), denominator: { enum: [2,4,8,16] }, grouping: array(number(1,32,true),1,32) });
    definitions.scoreMap = object({ firstMeasure: number(1,limits.scoreMeasures,true), pickupCounts: number(0,31,true),
      changes: array(object({ count: number(1,limits.counts.max*(limits.sets-1),true), meter: properties.meter }),0,limits.scoreEvents),
      marks: array(object({ count: number(0,limits.counts.max*(limits.sets-1),true), label: { ...text(limits.text.groupName), pattern: '^(?=[\\s\\S]*\\S)[^\\u0000-\\u001f]*$' } }),0,limits.scoreEvents) });
    properties.score = ref('scoreMap');
    definitions.move.properties.marchingDirections = { type: 'object', maxProperties: limits.performers, propertyNames: ref('id'), additionalProperties: { enum: ['forward','backward','sideways'] } };
    definitions.rehearsalAnchor = { oneOf: [object({ kind: { const: 'set' }, setId: ref('id') }), object({ kind: { const: 'move' }, moveId: ref('id'), fromSetId: ref('id'), toSetId: ref('id'), count: number(0, limits.counts.max) })] };
    definitions.rehearsalFocus = { oneOf: [object({ kind: { const: 'all' } }), object({ kind: { const: 'section' }, sectionId: ref('id') }), object({ kind: { const: 'performers' }, performerIds: { ...array(ref('id'), 1, limits.performers), uniqueItems: true } })] };
    definitions.rehearsalPassage = object({ id: ref('id'), name: text(limits.text.setName), notes: text(limits.text.notes, true), start: ref('rehearsalAnchor'), end: ref('rehearsalAnchor'), focus: ref('rehearsalFocus') }, ['id', 'name', 'notes', 'start', 'focus']);
    properties.rehearsal = array(ref('rehearsalPassage'), 0, limits.rehearsalPassages);
    properties.selectionGroups = array(ref('selectionGroup'), 0, limits.selectionGroups);
    properties.snapping = object({ steps: { enum: [8,6,12] }, subdivision: { enum: [1,2,4] }, target: { enum: ['grid','markings'] }, group: { enum: ['anchor','individual'] } });
    properties.moves = array(ref('move'),0,limits.sets-1); properties.openingTiming = object(timing);
  } else {
    definitions.picture = {...object({...picture,counts:number(0,limits.counts.max,true),...timing}),not:{required:['liveFormations']}};
    properties.sets = {...array(ref('picture'),1,limits.sets),items:[{allOf:[ref('picture'),{properties:{counts:{const:0}}}]}],additionalItems:{allOf:[ref('picture'),{properties:{counts:number(limits.counts.min,limits.counts.max,true)}}]}};
  }
  if (version >= 8) {
    const routeLine = {id:ref('id'),kind:{const:'line'},to:ref('point')};
    const routeCubic = {...routeLine,kind:{const:'cubic'},control1:ref('point'),control2:ref('point')};
    definitions.routeSegment = {oneOf:[{...object(routeLine),not:{anyOf:['control1','control2'].map(key=>({required:[key]}))}},object(routeCubic)]};
    definitions.sharedRoute = object({id:ref('id'),name:{...text(limits.text.groupName),pattern:'^(?=[\\s\\S]*\\S)[^\\u0000-\\u001f]*$'},closed:{type:'boolean'},start:ref('point'),segments:array(ref('routeSegment'),1,limits.pathSegments)});
    properties.sharedRoutes = array(ref('sharedRoute'),0,limits.sharedRoutes);
  }
  if (version >= 3) properties.tempoMap = object({ version: { const: 1 },
    regions: array(object({ startCount: number(0,limits.counts.max*(limits.sets-1),true), endCount: number(1,limits.counts.max*(limits.sets-1),true), startTempo: number(limits.tempo.min,limits.tempo.max), endTempo: number(limits.tempo.min,limits.tempo.max) }),0,limits.tempoEvents),
    holds: array(object({ count: number(0,limits.counts.max*(limits.sets-1)-1,true), seconds: number(.001,limits.holdSeconds) }),0,limits.tempoEvents) });
  if (version >= 4) properties.audioAnchors = array(object({ count: number(1,limits.counts.max*(limits.sets-1),true), seconds: { type:'number',exclusiveMinimum:0,maximum:86400 } }),1,limits.tempoEvents);
  return { $schema:'http://json-schema.org/draft-07/schema#', $id:`https://raw.githubusercontent.com/IanSzymanski/squidware/main/format/squid-v${version}.schema.json`,
    title:`Squidware project format v${version}`,description:'Structural validation. Also enforce FORMAT.md semantic constraints, UTF-16 text limits and the 10 MiB UTF-8 file limit. Unknown informational properties are accepted and discarded by the canonical reader.',
    ...object(properties, Object.keys(properties).filter(key => key !== 'sharedRoutes' && key !== 'snapping' && key !== 'selectionGroups' && key !== 'rehearsal' && key !== 'analysisRules' && key !== 'meter' && key !== 'score' && !(version >= 4 && key === 'tempoMap') && !(version >= 5 && key === 'audioAnchors'))),...(version < 8 ? {not:{required:['sharedRoutes']}} : {}),definitions };
}
export function smallExample() {
  const positions = (x,y) => ({a:{x,y},b:{x:x+10,y}});
  return {schemaVersion:2,id:'example-show',title:'Three pictures, two moves',ensemble:'Example ensemble',
    field:{width:100,height:160/3,preset:'college'}, sections:[{id:'brass',name:'Brass',color:'#c3e889'}],
    performers:[{id:'a',label:'A1',name:'',sectionId:'brass'},{id:'b',label:'A2',name:'Example performer',sectionId:'brass'}],
    sets:[{id:'opening',name:'Opening',notes:'Count zero — opening picture.',positions:positions(10,10)},{id:'arrival',name:'Arrival',notes:'Arrive on count 16.\nHold the interval.',positions:positions(30,20)},{id:'finish',name:'Finish',notes:'',positions:positions(50,30)}],
    moves:[{id:'move-a',fromSetId:'opening',toSetId:'arrival',counts:16,tempo:120,transition:'linear',paths:{a:{segments:[{id:'segment-a',kind:'line',startCount:0,endCount:16}]}}},{id:'move-b',fromSetId:'arrival',toSetId:'finish',counts:8,tempo:60,transition:'ease',paths:{}}],
    selectionGroups:[{id:'lead-pair',name:'Lead pair',performerIds:['a','b']},{id:'solo',name:'Solo',performerIds:['a']}],
    openingTiming:{tempo:120,transition:'linear'},audioOffsetSeconds:-1.25};
}
export function scheduledExample() {
  const p = smallExample();
  p.schemaVersion = 6;
  p.moves[0].paths = {
    a: { segments: [
      { id:'travel-a',kind:'line',startCount:2,endCount:6,to:{x:20,y:25} },
      { id:'hold-a',kind:'hold',startCount:6,endCount:8 },
      { id:'curve-a',kind:'cubic',startCount:8,endCount:12,control1:{x:20,y:35},control2:{x:30,y:35} },
    ] },
    b: { segments: [{ id:'travel-b',kind:'line',startCount:4,endCount:14 }] },
  };
  p.tempoMap = { version:1,regions:[],holds:[{count:5,seconds:1}] };
  return p;
}
export function liveExample() {
  const p=smallExample(); p.schemaVersion=7;
  p.sets[0].liveFormations=[{id:'opening-line',name:'Opening line',kind:'line',options:{center:{x:15,y:10},width:10,height:0,rotation:0,columns:2,assignment:'roster'},slotCount:2,members:[{performerId:'a',slot:0},{performerId:'b',slot:1}]}];
  return p;
}
export function routeExample() {
  return {...liveExample(),schemaVersion:8,sharedRoutes:[{id:'conveyor-outline',name:'Conveyor outline',closed:true,start:{x:20,y:15},segments:[
    {id:'outbound',kind:'cubic',control1:{x:30,y:5},control2:{x:70,y:5},to:{x:80,y:15}},
    {id:'turn',kind:'line',to:{x:80,y:35}},
    {id:'return',kind:'cubic',control1:{x:70,y:45},control2:{x:30,y:45},to:{x:20,y:35}},
    {id:'seam',kind:'line',to:{x:20,y:15}}]}]};
}
export function bezierExample() {
  const p=liveExample();p.schemaVersion=9;
  const f=p.sets[0].liveFormations[0];f.kind='curve';f.name='Editable curve';
  f.bezier={anchors:[{id:'start',point:{x:10,y:10},incoming:{x:10,y:10},outgoing:{x:12,y:18},mode:'corner'},
    {id:'end',point:{x:20,y:10},incoming:{x:18,y:2},outgoing:{x:20,y:10},mode:'corner'}]};
  return p;
}
export function scatterExample() {
  const p=liveExample();p.schemaVersion=10;const f=p.sets[0].liveFormations[0];f.kind='block';f.name='Seeded scatter';
  f.scatter={version:1,seed:'example',region:{kind:'rectangle',vertices:[{x:5,y:5},{x:25,y:20}]},minimumSpacing:2,distribution:'uniform',clusterStrength:.8,points:[{x:10,y:10},{x:20,y:10}],pinnedSlots:[0]};
  return p;
}
export function assignmentExample() {
 const p=liveExample();p.schemaVersion=11;const f=p.sets[0].liveFormations[0];
 f.assignmentConstraints={pins:[{performerId:'a',slot:0}],forbidden:[{performerId:'b',slot:0}],sectionSlots:[{slot:0,sectionId:'brass'}],roleSlots:[{slot:0,role:'Trumpet'}],roles:{a:'Trumpet'},unknownRoles:'reject',orderedGroups:[]};return p;
}
export function groupExample() {
 const p=routeExample();p.schemaVersion=12;p.moves[0].groupMotions=[{id:'group',name:'Delayed followers',routeId:p.sharedRoutes[0].id,mode:'follow',members:['a','b'],delay:1,interval:2,offsetDirection:-1,phase:10,speed:1,entryCounts:1,exitCounts:1,endpointPolicy:'hold',cues:[{count:0,direction:1},{count:8,direction:-1}]}];return p;
}
export async function generateContract(check=false) {
  const tools = await formatTools(); const small = smallExample();
  const scored = {...small, meter:{numerator:4,denominator:4,grouping:[4]},score:{firstMeasure:1,pickupCounts:2,changes:[{count:10,meter:{numerator:6,denominator:8,grouping:[3,3]}},{count:22,meter:{numerator:3,denominator:4,grouping:[3]}}],marks:[{count:0,label:'Pickup'},{count:10,label:'A'},{count:22,label:'B'}]}};
  const tempo = {...small, schemaVersion:3, tempoMap:{version:1,regions:[{startCount:0,endCount:16,startTempo:120,endTempo:180},{startCount:16,endCount:24,startTempo:180,endTempo:90}],holds:[{count:8,seconds:2}]}};
  const files = new Map([['format/squid-v12.schema.json',JSON.stringify(formatSchema(12,tools.PROJECT_LIMITS),null,2)+'\n'],['format/examples/group-v12.squid',JSON.stringify(groupExample(),null,2)+'\n'],['format/squid-v11.schema.json',JSON.stringify(formatSchema(11,tools.PROJECT_LIMITS),null,2)+'\n'],['format/examples/assignment-v11.squid',JSON.stringify(assignmentExample(),null,2)+'\n'],['format/squid-v10.schema.json',JSON.stringify(formatSchema(10,tools.PROJECT_LIMITS),null,2)+'\n'],['format/examples/scatter-v10.squid',JSON.stringify(scatterExample(),null,2)+'\n'],['format/examples/bezier-v9.squid',JSON.stringify(bezierExample(),null,2)+'\n'],['format/squid-v9.schema.json',JSON.stringify(formatSchema(9,tools.PROJECT_LIMITS),null,2)+'\n'],['format/squid-v8.schema.json',JSON.stringify(formatSchema(8,tools.PROJECT_LIMITS),null,2)+'\n'],['format/examples/routes-v8.squid',JSON.stringify(routeExample(),null,2)+'\n'],['format/squid-v7.schema.json',JSON.stringify(formatSchema(7,tools.PROJECT_LIMITS),null,2)+'\n'],['format/examples/live-v7.squid',JSON.stringify(liveExample(),null,2)+'\n'],['format/squid-v1.schema.json',JSON.stringify(formatSchema(1,tools.PROJECT_LIMITS),null,2)+'\n'],['format/squid-v2.schema.json',JSON.stringify(formatSchema(2,tools.PROJECT_LIMITS),null,2)+'\n'],['format/squid-v3.schema.json',JSON.stringify(formatSchema(3,tools.PROJECT_LIMITS),null,2)+'\n'],
    ['format/squid-v6.schema.json',JSON.stringify(formatSchema(6,tools.PROJECT_LIMITS),null,2)+'\n'],['format/examples/scheduled-v6.squid',JSON.stringify(scheduledExample(),null,2)+'\n'],['format/squid-v5.schema.json',JSON.stringify(formatSchema(5,tools.PROJECT_LIMITS),null,2)+'\n'],['format/examples/curved-v5.squid',JSON.stringify({...small,schemaVersion:5,moves:small.moves.map((m,i)=>i?m:{...m,paths:{a:{segments:[{id:'curve-a',kind:'cubic',startCount:0,endCount:m.counts,control1:{x:10,y:30},control2:{x:30,y:30}}]}}})},null,2)+'\n'],['format/squid-v4.schema.json',JSON.stringify(formatSchema(4,tools.PROJECT_LIMITS),null,2)+'\n'],['format/examples/aligned-v4.squid',JSON.stringify({...tempo,schemaVersion:4,audioAnchors:[{count:8,seconds:5},{count:24,seconds:15}]},null,2)+'\n'],['format/examples/tempo-v3.squid',JSON.stringify(tempo,null,2)+'\n'],['format/examples/score-v2.squid',JSON.stringify(scored,null,2)+'\n'],['format/examples/basic-v2.squid',JSON.stringify(small,null,2)+'\n'],['format/examples/basic-v1.squid',JSON.stringify(tools.projectV2AsLegacy(small),null,2)+'\n'],['format/examples/maximum-v2.squid',tools.serializeProject(tools.createPerformanceFixture('maximum'))]]);
  for (const [relative,content] of files) { const file=path.join(root,relative); if(check) {if(await fs.readFile(file,'utf8')!==content) throw new Error(`Format contract drift: regenerate ${relative}`);} else {await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,content);} }
  console.log(`${check?'Verified':'Generated'} ${files.size} schemas and compatibility examples.`);
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await generateContract(process.argv.includes('--check'));
