import { createRequire } from 'node:module';
import path from 'node:path';
import { createQa, root } from './testing/launcher.mjs';
const qa = await createQa('rehearsal', { timeoutMs: 210000 }), require = createRequire(import.meta.url);
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
const bundle = path.join(qa.output, 'fixtures.cjs');
await esbuild.build({ stdin: { contents: `import {createBlankProject, uid} from './src/domain'; export {parseProject,serializeProject} from './src/domain';
export function fixture() { const p=createBlankProject(); p.sections.push({id:'other',name:'Other section',color:'#aabbcc'}); p.performers=[{id:'a',label:'A1',name:'',sectionId:p.sections[0].id},{id:'b',label:'B1',name:'',sectionId:'other'}]; p.sets=Array.from({length:3},(_,i)=>({id:'s'+i,name:'Picture '+(i+1),notes:'',positions:{a:{x:10+i*10,y:15},b:{x:30+i*10,y:20}}})); p.moves=[0,1].map(i=>({id:'m'+i,fromSetId:'s'+i,toSetId:'s'+(i+1),counts:8,tempo:120,transition:'linear',paths:{}})); return p; }`, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'silent' });
await qa.run('rehearsal-qa-runner.cjs', 'rehearsal-manifest', { bundle });
