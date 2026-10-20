import { createQa } from './testing/launcher.mjs';
const qa = await createQa('themes', { timeoutMs: 360000 });
await qa.run('themes-qa-runner.cjs', 'themes-manifest', {}, ['write', 'restart']);
