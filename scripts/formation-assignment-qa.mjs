import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createQa, root } from './testing/launcher.mjs';
const require = createRequire(import.meta.url);
const qa = await createQa('formation-assignment', { timeoutMs: 150000 });
const bundle = path.join(qa.output, 'fixture.cjs');
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
await esbuild.build({ stdin: { contents: `
  import { createDemoProject, serializeProject } from './src/domain';
  const project = createDemoProject(); project.title='Formation assignment';
  project.performers=project.performers.filter((_,i)=>i<4||[24,32,48,56].includes(i));
  project.sets=project.sets.map(set=>({...set,positions:Object.fromEntries(project.performers.map(p=>[p.id,set.positions[p.id]]))}));
  project.performers.slice(4).forEach((p,i)=>project.sets[0].positions[p.id]={x:20+i*20,y:40});
  project.performers.slice(0,4).forEach((p,i)=>project.sets[0].positions[p.id]={x:65-i*10,y:20});
  export const content=serializeProject(project);
`, resolveDir:root, loader:'ts' }, bundle:true, outfile:bundle, platform:'node', format:'cjs', logLevel:'silent' });
const fixture = path.join(qa.output,'assignment.squid'); await fs.writeFile(fixture,require(bundle).content);
await qa.run('formation-assignment-qa-runner.cjs','assignment-manifest',{fixture});
