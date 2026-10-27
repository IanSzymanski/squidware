import { createRequire } from 'node:module';
import path from 'node:path';
import { createQa, root } from './testing/launcher.mjs';
const qa = await createQa('analysis', { timeoutMs: 240000 }), require = createRequire(import.meta.url);
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
const bundle = path.join(qa.output, 'fixtures.cjs');
await esbuild.build({ stdin: { contents: `import {createBlankProject} from './src/domain';
export {analyzeTransition} from './src/domain'; export {createPerformanceFixture} from './src/performanceFixtures';
export function fixture() {
 const p=createBlankProject();p.performers=Array.from({length:16},(_,i)=>({id:'p'+i,label:'P'+i,name:'',sectionId:p.sections[0].id}));
 p.sets=Array.from({length:4},(_,i)=>({id:'s'+i,name:'Picture '+i,notes:'',positions:Object.fromEntries(p.performers.map((person,j)=>[person.id,{x:10+i*12,y:10+j*.2}]))}));
 p.moves=Array.from({length:3},(_,i)=>({id:'m'+i,fromSetId:'s'+i,toSetId:'s'+(i+1),counts:8,tempo:120+i*20,transition:i===1?'ease':'linear',paths:{}}));return p;
}`, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'silent' });
await qa.run('analysis-qa-runner.cjs', 'analysis-manifest', { bundle });
