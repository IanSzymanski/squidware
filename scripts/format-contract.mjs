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
  if (version === 2) {
    definitions.picture = {...object(picture),not:{anyOf:['counts','tempo','transition'].map(key=>({required:[key]}))}};
    definitions.segment = object({id:ref('id'),kind:{const:'line'},startCount:{const:0},endCount:number(limits.counts.min,limits.counts.max,true)});
    definitions.path = object({segments:array(ref('segment'),1,1)});
    definitions.move = object({id:ref('id'),fromSetId:ref('id'),toSetId:ref('id'),counts:number(limits.counts.min,limits.counts.max,true),...timing,paths:{type:'object',maxProperties:limits.performers,propertyNames:ref('id'),additionalProperties:ref('path')}});
    properties.moves = array(ref('move'),0,limits.sets-1); properties.openingTiming = object(timing);
  } else {
    definitions.picture = object({...picture,counts:number(0,limits.counts.max,true),...timing});
    properties.sets = {...array(ref('picture'),1,limits.sets),items:[{allOf:[ref('picture'),{properties:{counts:{const:0}}}]}],additionalItems:{allOf:[ref('picture'),{properties:{counts:number(limits.counts.min,limits.counts.max,true)}}]}};
  }
  return { $schema:'http://json-schema.org/draft-07/schema#', $id:`https://raw.githubusercontent.com/IanSzymanski/squidware/main/format/squid-v${version}.schema.json`,
    title:`Squidware project format v${version}`,description:'Structural validation. Also enforce FORMAT.md semantic constraints, UTF-16 text limits and the 10 MiB UTF-8 file limit. Unknown informational properties are accepted and discarded by the canonical reader.',
    ...object(properties),definitions };
}
export function smallExample() {
  const positions = (x,y) => ({a:{x,y},b:{x:x+10,y}});
  return {schemaVersion:2,id:'example-show',title:'Three pictures, two moves',ensemble:'Example ensemble',
    field:{width:100,height:160/3,preset:'college'}, sections:[{id:'brass',name:'Brass',color:'#c3e889'}],
    performers:[{id:'a',label:'A1',name:'',sectionId:'brass'},{id:'b',label:'A2',name:'Example performer',sectionId:'brass'}],
    sets:[{id:'opening',name:'Opening',notes:'Count zero — opening picture.',positions:positions(10,10)},{id:'arrival',name:'Arrival',notes:'Arrive on count 16.\nHold the interval.',positions:positions(30,20)},{id:'finish',name:'Finish',notes:'',positions:positions(50,30)}],
    moves:[{id:'move-a',fromSetId:'opening',toSetId:'arrival',counts:16,tempo:120,transition:'linear',paths:{a:{segments:[{id:'segment-a',kind:'line',startCount:0,endCount:16}]}}},{id:'move-b',fromSetId:'arrival',toSetId:'finish',counts:8,tempo:60,transition:'ease',paths:{}}],
    openingTiming:{tempo:120,transition:'linear'},audioOffsetSeconds:-1.25};
}
export async function generateContract(check=false) {
  const tools = await formatTools(); const small = smallExample();
  const files = new Map([['format/squid-v1.schema.json',JSON.stringify(formatSchema(1,tools.PROJECT_LIMITS),null,2)+'\n'],['format/squid-v2.schema.json',JSON.stringify(formatSchema(2,tools.PROJECT_LIMITS),null,2)+'\n'],
    ['format/examples/basic-v2.squid',JSON.stringify(small,null,2)+'\n'],['format/examples/basic-v1.squid',JSON.stringify(tools.projectV2AsLegacy(small),null,2)+'\n'],['format/examples/maximum-v2.squid',tools.serializeProject(tools.createPerformanceFixture('maximum'))]]);
  for (const [relative,content] of files) { const file=path.join(root,relative); if(check) {if(await fs.readFile(file,'utf8')!==content) throw new Error(`Format contract drift: regenerate ${relative}`);} else {await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,content);} }
  console.log(`${check?'Verified':'Generated'} ${files.size} schemas and compatibility examples.`);
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await generateContract(process.argv.includes('--check'));
