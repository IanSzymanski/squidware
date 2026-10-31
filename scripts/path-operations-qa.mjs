import { createRequire } from 'node:module';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createQa, root } from './testing/launcher.mjs';
const qa = await createQa('path-operations', { timeoutMs: 210000 }), require = createRequire(import.meta.url);
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
const bundle = path.join(qa.output,'fixtures.cjs');
await esbuild.build({stdin:{contents:`import {parseProject} from './src/domain';export {parseProject,sampleProject} from './src/domain';export function fixture(){return parseProject(${JSON.stringify(await readFile(path.join(root,'format/examples/scheduled-v6.squid'),'utf8'))});}`,resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:bundle,logLevel:'silent'});
await qa.run('path-operations-qa-runner.cjs','path-operations-manifest',{bundle,smallDesktop:process.argv.includes('--small-desktop')});
