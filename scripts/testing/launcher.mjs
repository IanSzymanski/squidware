import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireProcess } from './process.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);

export function outputDirectory(argv, fallback) {
  const options = argv.filter(arg => arg.startsWith('--output='));
  const positional = argv.filter(arg => !arg.startsWith('--'));
  if (options.length + positional.length > 1) throw new Error('Supply one output directory, with --output= or a positional path.');
  const output = options[0]?.slice('--output='.length) ?? positional[0] ?? fallback;
  if (!output) throw new Error('Output directory cannot be empty.');
  return path.resolve(output);
}

export async function createQa(name, { defaultOutput = path.join(root, '.qa', name), timeoutMs = 240000 } = {}) {
  const output = outputDirectory(process.argv.slice(2), defaultOutput);
  await fs.mkdir(output, { recursive: true });
  const profile = await fs.mkdtemp(path.join(output, 'profile-'));
  const manifest = path.join(output, 'manifest.json');
  // A failed new attempt cannot expose an earlier success report as its result.
  for (const filename of ['results.json', 'report.json']) await fs.rm(path.join(output, filename), { force: true });
  const status = (state, extra = {}) => fs.writeFile(path.join(output, 'run.json'), JSON.stringify({ suite: name, state, ...extra }, null, 2));
  await status('preparing');
  return { root, output, profile, manifest,
    async run(runner, flag, data, phases = [null]) {
      await fs.writeFile(manifest, JSON.stringify({ root, output, profile, ...data }));
      const results = [];
      try {
        for (const phase of phases) {
          await status('running', { phase, results });
          results.push(await requireProcess(require('electron'), [path.join(root, 'scripts', runner), `--${flag}=${manifest}`, ...(phase ? [`--phase=${phase}`] : [])],
            { cwd: root, timeoutMs, logFile: path.join(output, `${phase ?? 'desktop'}.log`) }));
        }
        await status('passed', { results });
      } catch (error) { await status('failed', { results, error: error.message }); throw error; }
    },
  };
}
