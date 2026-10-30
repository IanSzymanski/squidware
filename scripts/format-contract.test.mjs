import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv from 'ajv';
import { formatTools, smallExample, generateContract } from './format-contract.mjs';
const tools = await formatTools();
const ajv = new Ajv({strict:false,allErrors:true});
const schemas = new Map(await Promise.all([1,2,3,4].map(async version=>[version,ajv.compile(JSON.parse(await readFile(new URL(`../format/squid-v${version}.schema.json`,import.meta.url),'utf8')))])));
const check = input => schemas.get(input.schemaVersion)(input);
test('optional selection groups preserve IDs and reject malformed structure or stale membership', () => {
  const project = smallExample();
  assert.ok(check(project));
  assert.deepEqual(tools.parseProject(tools.serializeProject(project)).selectionGroups, project.selectionGroups);
  for (const selectionGroups of [null, [{ id: 'g', name: ' ', performerIds: [] }], [{ id: 'g', name: 'G', performerIds: ['a', 'a'] }], [{ id: 'g', name: 'G\n', performerIds: [] }], Array(tools.PROJECT_LIMITS.selectionGroups + 1).fill(project.selectionGroups[0])]) {
    const bad = { ...project, selectionGroups }; assert.equal(check(bad), false); assert.throws(() => tools.parseProject(JSON.stringify(bad)), /selectionGroups/);
  }
  const stale = { ...project, selectionGroups: [{ id: 'g', name: 'G', performerIds: ['missing'] }] };
  assert.ok(check(stale), 'roster references are a semantic constraint'); assert.throws(() => tools.parseProject(JSON.stringify(stale)), /existing performer/);
});
test('optional rehearsal references preserve repairable targets and reject malformed structures in both validators', () => {
  const passage = { id: 'rehearsal', name: 'Arrival', notes: 'Keep interval.', start: { kind: 'move', moveId: 'move-a', fromSetId: 'opening', toSetId: 'arrival', count: 2.5 }, end: { kind: 'set', setId: 'finish' }, focus: { kind: 'performers', performerIds: ['a'] } };
  const project = { ...smallExample(), rehearsal: [passage] };
  assert.ok(check(project));
  assert.deepEqual(tools.parseProject(tools.serializeProject(project)).rehearsal, project.rehearsal);
  for (const rehearsal of [null, Array(tools.PROJECT_LIMITS.rehearsalPassages + 1).fill(passage), [{ ...passage, name: ' ' }], [{ ...passage, focus: { kind: 'performers', performerIds: [] } }], [{ ...passage, focus: { kind: 'performers', performerIds: ['a', 'a'] } }], [{ ...passage, start: { ...passage.start, count: -1 } }], [{ ...passage, start: { kind: 'other' } }]]) {
    const invalid = { ...project, rehearsal }; assert.equal(check(invalid), false); assert.throws(() => tools.parseProject(JSON.stringify(invalid)), /rehearsal/);
  }
  const repairable = { ...project, rehearsal: [{ ...passage, start: { kind: 'set', setId: 'deleted' }, focus: { kind: 'section', sectionId: 'deleted' } }] };
  assert.ok(check(repairable)); assert.deepEqual(tools.parseProject(tools.serializeProject(repairable)).rehearsal, repairable.rehearsal);
});
test('portable analysis rules and declared directions pass both validators with bounded numeric units', () => {
  const p = smallExample(); p.analysisRules = { defaults: { minimumSpacing: 1, maximumStride: 1.25 }, directions: { backward: { maximumStride: .75 } }, sections: [{ sectionId: 'brass', minimumSpacing: 2, directions: { sideways: { minimumSpacing: 3 } } }] }; p.moves[0].marchingDirections = { a: 'backward' };
  assert.ok(check(p)); const reopened = tools.parseProject(tools.serializeProject(p)); assert.deepEqual(reopened.analysisRules, p.analysisRules); assert.deepEqual(reopened.moves[0].marchingDirections, p.moves[0].marchingDirections);
  for (const analysisRules of [null, { defaults: { minimumSpacing: 0, maximumStride: 1 } }, { defaults: { minimumSpacing: 1, maximumStride: 6 } }, { ...p.analysisRules, directions: { north: {} } }, { ...p.analysisRules, sections: Array(tools.PROJECT_LIMITS.sections + 1).fill(p.analysisRules.sections[0]) }]) {
    const bad = { ...p, analysisRules }; assert.equal(check(bad), false); assert.throws(() => tools.parseProject(JSON.stringify(bad)), /analysisRules/);
  }
  for (const marchingDirections of [null, { a: 'north' }]) { const bad = structuredClone(p); bad.moves[0].marchingDirections = marchingDirections; assert.equal(check(bad), false); assert.throws(() => tools.parseProject(JSON.stringify(bad)), /marchingDirections/); }
  const stale = { ...p, analysisRules: { ...p.analysisRules, sections: [{ sectionId: 'deleted' }] } }; assert.ok(check(stale)); assert.throws(() => tools.parseProject(JSON.stringify(stale)), /existing section/);
});
test('schemas and checked-in examples regenerate exactly from current limits and engine',()=>generateContract(true));
test('all examples pass independent JSON Schema and canonical codec, including the maximum production',async()=>{
  for(const name of ['basic-v1','basic-v2','maximum-v2','score-v2','tempo-v3','aligned-v4']) {
    const content = await readFile(new URL(`../format/examples/${name}.squid`,import.meta.url),'utf8'); const raw=JSON.parse(content);
    assert.ok(check(raw),JSON.stringify(schemas.get(raw.schemaVersion).errors));
    const project=tools.parseProject(content); assert.deepEqual(tools.parseProject(tools.serializeProject(project)),project);
    if(name==='maximum-v2') {assert.equal(project.performers.length,500);assert.equal(project.sets.length,128);assert.ok(Buffer.byteLength(content)<tools.PROJECT_LIMITS.projectBytes);}
  }
});
test('published sampling example and migration agree at zero, fractions, boundaries and end',()=>{
  const project=smallExample(); const legacy=tools.parseProject(JSON.stringify(tools.projectV2AsLegacy(project)));
  assert.deepEqual(tools.sampleProject(project,8).positions.a,{x:20,y:15});
  assert.deepEqual(tools.sampleProject(project,20).positions.a,{x:40,y:25});
  assert.equal(tools.countToSeconds(project,24),16);
  for(const count of [0,.25,8,15.99,16,16.01,20,24,100]) {assert.deepEqual(tools.sampleProject(project,count),tools.sampleProject(legacy,count));assert.ok(Math.abs(tools.secondsToCount(project,tools.countToSeconds(project,count))-Math.min(24,count))<1e-8);}
});
test('optional show snapping rules pass independent schema and canonical/native codecs without moving dots',()=>{
  const project=smallExample(); project.snapping={steps:6,subdivision:4,target:'markings',group:'individual'};
  assert.ok(check(project)); const reopened=tools.parseProject(tools.serializeProject(project));
  assert.deepEqual(reopened.snapping,project.snapping); assert.deepEqual(reopened.sets,project.sets);
  for(const invalid of [null,{}, {...project.snapping,steps:5}, {...project.snapping,subdivision:3}, {...project.snapping,target:'both'}, {...project.snapping,group:'unknown'}]) {
    const bad={...project,snapping:invalid}; assert.equal(check(bad),false); assert.throws(()=>tools.parseProject(JSON.stringify(bad)),/snapping/);
  }
});
test('structural defects fail schema and parser; semantic defects require the canonical validation pass',()=>{
  for(const edit of [p=>p.field.width=99,p=>p.performers[0].id='__proto__',p=>p.moves[0].counts=0,p=>p.moves[0].paths.a.segments[0].kind='curve',p=>p.sets[0].counts=0,p=>p.sets[0].positions.a.x=-1]) {
    const project=smallExample();edit(project);assert.equal(check(project),false);assert.throws(()=>tools.parseProject(JSON.stringify(project)));
  }
  for(const edit of [p=>p.performers[0].sectionId='missing',p=>p.sets[0].positions.extra={x:1,y:1},p=>p.moves[0].toSetId='missing',p=>p.moves[0].paths.a.segments[0].endCount=8]) {
    const project=smallExample();edit(project);assert.ok(check(project));assert.throws(()=>tools.parseProject(JSON.stringify(project)));
  }
});
test('unknown metadata is discarded, unsupported versions and geometry are never silently downgraded',()=>{
  const project=smallExample(); project.comment={anything:true}; project.sets[0].description='Informational';
  assert.ok(check(project));assert.equal(tools.parseProject(JSON.stringify(project)).comment,undefined);
  project.schemaVersion=5;assert.throws(()=>tools.parseProject(JSON.stringify(project)),/Update Squidware/);
});

test('optional score maps share schema/native validation, preserving pickup and meter anchors',()=>{
 const p=smallExample();p.score={firstMeasure:1,pickupCounts:0,changes:[{count:16,meter:{numerator:3,denominator:4,grouping:[3]}}],marks:[{count:16,label:'A'}]};
 assert.ok(check(p));assert.deepEqual(tools.parseProject(tools.serializeProject(p)).score,p.score);
 for(const score of [null,{...p.score,pickupCounts:32},{...p.score,changes:[{count:.5,meter:p.score.changes[0].meter}]},{...p.score,marks:[{count:0,label:'\u0000'}]}]){assert.equal(check({...p,score}),false);assert.throws(()=>tools.parseProject(JSON.stringify({...p,score})));}
 for(const score of [{...p.score,pickupCounts:4},{...p.score,changes:[{count:3,meter:p.score.changes[0].meter}]},{...p.score,marks:[{count:25,label:'Outside'}]}]){assert.ok(check({...p,score}));assert.throws(()=>tools.parseProject(JSON.stringify({...p,score})),/Score map/);}
});

test('v3 tempo maps retain timing; structural and semantic invalid events cannot enter a production',()=>{
  const p={...smallExample(),schemaVersion:3,tempoMap:{version:1,regions:[{startCount:0,endCount:16,startTempo:120,endTempo:180}],holds:[{count:8,seconds:2}]}};
  assert.ok(check(p));const canonical=tools.parseProject(JSON.stringify(p));assert.equal(canonical.schemaVersion,2);assert.equal(JSON.parse(tools.serializeProject(canonical)).schemaVersion,3);assert.deepEqual(canonical.tempoMap,p.tempoMap);
  for(const tempoMap of [null,{...p.tempoMap,version:2},{...p.tempoMap,holds:[{count:8,seconds:0}]},{...p.tempoMap,regions:[{...p.tempoMap.regions[0],endTempo:401}]},{...p.tempoMap,holds:Array(257).fill({count:8,seconds:1})}]){const bad={...p,tempoMap};assert.equal(check(bad),false);assert.throws(()=>tools.parseProject(JSON.stringify(bad)));}
  for(const tempoMap of [{...p.tempoMap,regions:[p.tempoMap.regions[0],{startCount:8,endCount:24,startTempo:100,endTempo:100}]},{...p.tempoMap,holds:[{count:8,seconds:1},{count:8,seconds:2}]},{...p.tempoMap,holds:[{count:24,seconds:1}]}]){const bad={...p,tempoMap};assert.ok(check(bad));assert.throws(()=>tools.parseProject(JSON.stringify(bad)));}
  assert.throws(()=>tools.parseProject(JSON.stringify({...p,schemaVersion:2})),/requires schema version 3/);
});


test('v4 alignment survives independent schema and canonical validation with monotonic timing',()=>{
 const p={...smallExample(),schemaVersion:4,audioAnchors:[{count:8,seconds:5},{count:24,seconds:18}]};
 assert.ok(check(p));const canonical=tools.parseProject(JSON.stringify(p));assert.deepEqual(canonical.audioAnchors,p.audioAnchors);
 assert.equal(JSON.parse(tools.serializeProject(canonical)).schemaVersion,4);
 assert.equal(tools.countToSeconds(canonical,8),5);assert.equal(tools.countToSeconds(canonical,24),18);
 for(const audioAnchors of [null,[],[{count:0,seconds:1}],[{count:8,seconds:0}],Array(257).fill({count:8,seconds:5})]){assert.equal(check({...p,audioAnchors}),false);assert.throws(()=>tools.parseProject(JSON.stringify({...p,audioAnchors})));}
 for(const audioAnchors of [[{count:8,seconds:5},{count:8,seconds:6}],[{count:8,seconds:5},{count:24,seconds:4}],[{count:25,seconds:10}],[{count:8,seconds:.000001}]]){assert.ok(check({...p,audioAnchors}));assert.throws(()=>tools.parseProject(JSON.stringify({...p,audioAnchors})));}
 for(const schemaVersion of [1,2,3])assert.throws(()=>tools.parseProject(JSON.stringify({...p,schemaVersion})),/requires schema version 4/);
});
