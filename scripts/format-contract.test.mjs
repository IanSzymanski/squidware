import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv from 'ajv';
import { formatTools, smallExample, generateContract } from './format-contract.mjs';
const tools = await formatTools();
const ajv = new Ajv({strict:false,allErrors:true});
const schemas = new Map(await Promise.all([1,2].map(async version=>[version,ajv.compile(JSON.parse(await readFile(new URL(`../format/squid-v${version}.schema.json`,import.meta.url),'utf8')))])));
const check = input => schemas.get(input.schemaVersion)(input);
test('schemas and checked-in examples regenerate exactly from current limits and engine',()=>generateContract(true));
test('all examples pass independent JSON Schema and canonical codec, including the maximum production',async()=>{
  for(const name of ['basic-v1','basic-v2','maximum-v2']) {
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
  project.schemaVersion=3;assert.throws(()=>tools.parseProject(JSON.stringify(project)),/Update Squidware/);
});
