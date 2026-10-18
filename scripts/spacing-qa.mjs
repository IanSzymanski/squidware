import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createQa, root } from './testing/launcher.mjs';
const require = createRequire(import.meta.url);
const qa = await createQa('spacing', { timeoutMs: 180000 });
const bundle = path.join(qa.output, 'fixture.cjs');
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
await esbuild.build({ stdin: { contents: `
  import { createDemoProject, serializeProject } from './src/domain';
  const project = createDemoProject(); project.title='Spacing and alignment';
  project.performers=project.performers.slice(0,8);
  project.sets=project.sets.map(set=>({...set,positions:Object.fromEntries(project.performers.map(p=>[p.id,set.positions[p.id]]))}));
  project.performers.forEach((p,i)=>project.sets[0].positions[p.id]=i<6?{x:[35,38,51,35,42,51][i],y:i<3?20:27}:{x:i===6?20:80,y:40});
  export const content=serializeProject(project);
`, resolveDir:root, loader:'ts' }, bundle:true, outfile:bundle, platform:'node', format:'cjs', logLevel:'silent' });
const fixture = path.join(qa.output,'spacing.squid'); await fs.writeFile(fixture,require(bundle).content);
await qa.run('spacing-qa-runner.cjs','spacing-manifest',{fixture});
