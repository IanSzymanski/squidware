import { readFile } from 'node:fs/promises';
import Ajv from 'ajv';
import { formatTools } from './format-contract.mjs';
const tools=await formatTools();
if(!process.argv[2]) throw new Error('Usage: pnpm format:validate <project.squid>');
const content=await readFile(process.argv[2],'utf8');
// Check bytes, JSON and version before selecting the matching structural schema.
const project=tools.parseProject(content); const input=JSON.parse(content.replace(/^\uFEFF/,''));
const schema=JSON.parse(await readFile(new URL(`../format/squid-v${input.schemaVersion}.schema.json`,import.meta.url),'utf8'));
const validate=new Ajv({strict:false,allErrors:true}).compile(schema);
if(!validate(input)) throw new Error(JSON.stringify(validate.errors));
console.log(`Valid v${input.schemaVersion} project → canonical v2: ${project.performers.length} performers, ${project.sets.length} pictures, ${project.moves.length} moves; ${Buffer.byteLength(content)} UTF-8 bytes.`);
