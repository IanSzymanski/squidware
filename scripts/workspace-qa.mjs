import { createQa } from './testing/launcher.mjs';
const baseline = process.argv.includes('--baseline');
const qa = await createQa(baseline ? 'workspace-baseline' : 'workspace', { timeoutMs: 180000 });
await qa.run('workspace-qa-runner.cjs', 'workspace-manifest', { baseline }, baseline ? [null] : ['write', 'read']);
