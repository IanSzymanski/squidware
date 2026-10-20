import { createQa } from './testing/launcher.mjs';
const qa = await createQa('commands', { timeoutMs: 200000 });
await qa.run('commands-qa-runner.cjs', 'commands-manifest', {}, ['write', 'read']);
