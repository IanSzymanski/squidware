// Actual production desktop, three launches, isolated preferences and project files.
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createQa, root } from './testing/launcher.mjs';
const qa = await createQa('preferences', { timeoutMs: 90000 });
const { output, profile } = qa;
const require = createRequire(import.meta.url);
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
const coordinateBundle = path.join(output, 'coordinates.cjs');
await esbuild.build({ stdin: { contents: "export {coordinateDescription,performerMoveOutput,sampleProject} from './src/domain';", resolveDir: root }, outfile: coordinateBundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
await fs.writeFile(path.join(profile, 'preferences.json'), '{"version":0,"zoom":1.1}');
const fixtureFile = path.join(output, 'original.squid');
const fixture = JSON.parse(await fs.readFile(path.join(root, 'src/fixtures/schema-v2.squid'), 'utf8'));
fixture.sets[0].positions[fixture.performers[0].id] = { x: .21875, y: 160 / 9 + .21875 };
await fs.writeFile(fixtureFile, JSON.stringify(fixture));
const other = structuredClone(fixture); other.title = 'Another production with its own rules'; other.field.preset = 'high-school'; other.audioOffsetSeconds = 4; other.moves[0].tempo = 144; other.snapping = { steps: 12, subdivision: 4, target: 'markings', group: 'anchor' };
const otherFile = path.join(output, 'other.squid'); await fs.writeFile(otherFile, JSON.stringify(other));
await qa.run('preferences-qa-runner.cjs', 'preferences-manifest', { fixtureFile, otherFile, coordinateBundle }, ["write","restart","reset-restart","quit-restart"]);
