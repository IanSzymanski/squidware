// Exercise the production renderer, actual preload and main-process file handlers.
// Native dialogs are controlled by the runner; all files/recovery use an isolated profile.
import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createQa, root } from './testing/launcher.mjs';

const require = createRequire(import.meta.url);
const qa = await createQa('editor', { timeoutMs: 240000 });
const { output } = qa;
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
const bundle = path.join(output, 'boundary-fixture.cjs');
await esbuild.build({
  stdin: { contents: `
    import { createDemoProject, PROJECT_LIMITS } from './src/domain';
    import { projectV2AsLegacy } from './src/projectV2';
    export { coordinateDescription } from './src/domain';
    const project = createDemoProject();
    project.title = 'Editor boundary QA';
    project.sections = Array.from({ length: PROJECT_LIMITS.sections }, (_, i) => ({ id: i < 4 ? project.sections[i].id : 'section-' + i, name: 'Section ' + i, color: '#abcdef' }));
    project.moves[0].counts = PROJECT_LIMITS.counts.max;
    project.moves[0].tempo = PROJECT_LIMITS.tempo.max;
    project.sets[1].notes = 'N'.repeat(PROJECT_LIMITS.text.notes);
    export const fixture = JSON.stringify(projectV2AsLegacy(project));
    const selection = createDemoProject();
    selection.title = 'Selection Inspector QA';
    selection.sections = selection.sections.slice(0, 2);
    selection.performers = selection.performers.slice(0, 4).map((p, i) => ({ ...p, sectionId: selection.sections[i < 2 ? 0 : 1].id }));
    selection.sets = selection.sets.slice(0, 2).map(set => ({ ...set, positions: Object.fromEntries(selection.performers.map((p, i) => [p.id, [{x:30,y:20},{x:36,y:20},{x:44,y:30},{x:50,y:35}][i]])) }));
    selection.moves = selection.moves.slice(0, 1);
    export const selectionFixture = JSON.stringify(selection);
  `, resolveDir: root, loader: 'ts' },
  outfile: bundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
});
await fs.writeFile(path.join(output, 'boundary.squid'), require(bundle).fixture);
await fs.writeFile(path.join(output, 'selection.squid'), require(bundle).selectionFixture);
await qa.run('editor-qa-runner.cjs', 'editor-qa-manifest', {});
