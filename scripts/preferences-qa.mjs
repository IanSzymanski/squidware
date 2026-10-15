// Actual production desktop, three launches, isolated preferences and project files.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createQa, root } from './testing/launcher.mjs';
const qa = await createQa('preferences', { timeoutMs: 90000 });
const { output, profile } = qa;
await fs.writeFile(path.join(profile, 'preferences.json'), '{"version":0,"zoom":1.1}');
const fixtureFile = path.join(output, 'original.squid');
const fixture = JSON.parse(await fs.readFile(path.join(root, 'src/fixtures/schema-v2.squid'), 'utf8'));
await fs.writeFile(fixtureFile, JSON.stringify(fixture));
const other = structuredClone(fixture); other.title = 'Another production with its own rules'; other.field.preset = 'high-school'; other.audioOffsetSeconds = 4; other.moves[0].tempo = 144;
const otherFile = path.join(output, 'other.squid'); await fs.writeFile(otherFile, JSON.stringify(other));
await qa.run('preferences-qa-runner.cjs', 'preferences-manifest', { fixtureFile, otherFile }, ["write","restart","reset-restart","quit-restart"]);
