import { createRequire } from 'node:module';
import path from 'node:path';
import { createQa, root } from './testing/launcher.mjs';
const qa = await createQa('analysis-rules', { timeoutMs: 210000 }), require = createRequire(import.meta.url);
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
const bundle = path.join(qa.output, 'fixtures.cjs');
await esbuild.build({ stdin: { contents: `import {createBlankProject} from './src/domain'; export {analyzeTransition,parseProject} from './src/domain';
export function fixture() { const p=createBlankProject(); p.sections=[{id:'brass',name:'Brass',color:'#aabbcc'},{id:'winds',name:'Winds',color:'#ccbbff'}]; p.performers=[{id:'a',label:'A1',name:'',sectionId:'brass'},{id:'b',label:'B1',name:'',sectionId:'winds'}];p.sets=[0,1,2].map(i=>({id:'s'+i,name:'Picture '+(i+1),notes:'',positions:{a:{x:10+i*8,y:10},b:{x:10+i*8,y:11.5}}}));p.moves=[0,1].map(i=>({id:'m'+i,fromSetId:'s'+i,toSetId:'s'+(i+1),counts:8,tempo:120,transition:'linear',paths:{}}));return p;}`, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'silent' });
await qa.run('analysis-rules-qa-runner.cjs', 'analysis-rules-manifest', { bundle });
