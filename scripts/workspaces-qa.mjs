import { createQa } from './testing/launcher.mjs';
const qa = await createQa('workspaces', { timeoutMs: 240000 });
await qa.run('workspaces-qa-runner.cjs', 'workspaces-manifest', {}, ['write','read']);
