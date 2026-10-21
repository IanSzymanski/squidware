import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const script = fileURLToPath(new URL('./release-publish.mjs', import.meta.url));
const plan = JSON.parse(await readFile(new URL('../release-plan.json', import.meta.url), 'utf8'));
const source = 'a'.repeat(40);
const mock = `
import fs from 'node:fs';
import crypto from 'node:crypto';
const plan = JSON.parse(fs.readFileSync('release-plan.json', 'utf8'));
const mode = process.env.QA_MODE, calls = []; let inventories = 0;
const source = 'a'.repeat(40), tree = 'b'.repeat(40), commit = 'c'.repeat(40);
const record = { id: 1, draft: true, tag_name: 'v0.5.0', upload_url: 'https://uploads.github.com/repos/' + plan.repository + '/releases/1/assets{?name,label}' };
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url), route = u.pathname.replace('/repos/' + plan.repository + '/', ''), method = options.method || 'GET';
  const body = typeof options.body === 'string' ? JSON.parse(options.body) : null;
  calls.push({ route, method, body }); fs.writeFileSync('calls.json', JSON.stringify(calls));
  if (u.hostname === 'uploads.github.com') {
    const name = u.searchParams.get('name');
    return response({ name: mode === 'normalized' && name.endsWith('.exe') ? 'Squidware.0.5.0.exe' : name, state: 'uploaded', digest: 'sha256:' + crypto.createHash('sha256').update(options.body).digest('hex') });
  }
  if (route === 'issues') {
    if (!u.searchParams.has('milestone')) inventories++;
    const issues = plan.releases.flatMap((r, i) => r.issues.map(number => ({ number, title: 'Issue ' + number, state: i === 0 ? 'closed' : 'open', state_reason: i === 0 ? 'completed' : null })));
    if (mode === 'incomplete' || mode === 'reopened' && inventories > 1) issues.find(i => i.number === 5).state_reason = 'not_planned';
    return response(u.searchParams.has('milestone') ? issues.filter(i => plan.releases[0].issues.includes(i.number)) : issues);
  }
  if (route === 'releases' && method === 'GET') return response([]);
  if (route.startsWith('actions/')) return response({ workflow_runs: [{ head_sha: source, status: 'completed', conclusion: mode === 'ci-failed' ? 'failure' : 'success' }] });
  if (route === 'git/ref/heads/main') return response({ object: { sha: source } });
  if (route.startsWith('releases/tags/')) return mode === 'resume' || mode === 'space-resume' ? response(record) : response({ message: 'Not found' }, 404);
  if (route === 'contents/package.json') return response({ content: Buffer.from('{"name":"squidware","version":"0.1.0"}').toString('base64') });
  if (route === 'git/commits/' + source) return response({ sha: source, tree: { sha: 'd'.repeat(40) }, parents: [] });
  if (route === 'git/commits/' + commit) return response({ sha: commit, tree: { sha: tree }, parents: [{ sha: source }] });
  if (route === 'git/trees') return response({ sha: tree });
  if (route.startsWith('git/ref/tags/')) return mode === 'resume' || mode === 'space-resume' ? response({ object: { sha: commit, type: 'commit' } }) : response({ message: 'Not found' }, 404);
  if (route === 'git/commits' || route === 'git/refs') return response({ sha: commit });
  if (route === 'releases' && method === 'POST') return response(record);
  if (route === 'releases/1/assets') return response(mode === 'resume' || mode === 'space-resume' ? [{ name: mode === 'space-resume' ? 'Squidware.0.5.0.exe' : 'Squidware-0.5.0.exe', state: 'uploaded', uploader: { login: 'github-actions[bot]' }, digest: 'sha256:' + 'e'.repeat(64) }] : []);
  if (route === 'releases/1' && method === 'PATCH') return response({ ...record, draft: false, html_url: 'https://github.com/' + plan.repository + '/releases/tag/v0.5.0' });
  if (route === 'milestones/1') return response({ state: 'closed' });
  throw new Error('Unexpected API route: ' + method + ' ' + route);
};
`;
async function run(mode) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'squidware-release-'));
  await mkdir(path.join(directory, 'release'));
  await writeFile(path.join(directory, 'release-plan.json'), JSON.stringify(plan));
  await writeFile(path.join(directory, 'mock.mjs'), mock);
  for (const extension of ['exe','dmg','AppImage']) if (mode !== 'missing-package' || extension !== 'AppImage') await writeFile(path.join(directory, `release/Squidware${extension === 'exe' && ['space', 'space-resume'].includes(mode) ? ' ' : '-'}0.5.0.${extension}`), 'verified package');
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(path.join(directory, 'mock.mjs')).href, script, '0.5.0', source, '1'], { cwd: directory, env: { ...process.env, GH_TOKEN: 'test-placeholder', GITHUB_REPOSITORY: plan.repository, QA_MODE: mode }, encoding: 'utf8', windowsHide: true });
  const calls = JSON.parse(await readFile(path.join(directory, 'calls.json'), 'utf8').catch(() => { throw new Error(result.stderr || 'Publisher exited before API requests.'); }));
  const checksums = await readFile(path.join(directory, 'release/SHA256SUMS.txt'), 'utf8').catch(() => '');
  assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(directory).startsWith('squidware-release-'));
  await rm(directory, { recursive: true, force: true });
  return { ...result, calls, checksums };
}
test('incomplete scope, failed CI and missing native packages cannot create tags or releases', async () => {
  for (const mode of ['incomplete','ci-failed','missing-package']) { const result = await run(mode); assert.notEqual(result.status, 0); assert.equal(result.calls.some(call => call.method !== 'GET'), false); }
});
test('verified packages publish only after all assets and a final fulfillment read', async () => {
  const result = await run('success'); assert.equal(result.status, 0, result.stderr);
  const publish = result.calls.findIndex(call => call.route === 'releases/1' && call.body?.draft === false);
  const uploads = result.calls.map((call, i) => call.route.includes('/assets') && call.method === 'POST' ? i : -1).filter(i => i >= 0);
  assert.equal(uploads.length, 4); assert.ok(publish > Math.max(...uploads)); assert.match(result.checksums, /\.exe/); assert.match(result.checksums, /\.dmg/); assert.match(result.checksums, /\.AppImage/);
});
test('reopened scope during upload leaves the release as a draft', async () => {
  const result = await run('reopened'); assert.notEqual(result.status, 0); assert.equal(result.calls.some(call => call.route === 'releases/1' && call.body?.draft === false), false);
});
test('an interrupted draft can reuse verified assets of its unchanged tag without overwriting them', async () => {
  const result = await run('resume'); assert.equal(result.status, 0, result.stderr); assert.ok(result.checksums.includes('e'.repeat(64) + '  Squidware-0.5.0.exe')); assert.equal(result.calls.filter(call => call.route.endsWith('/assets') && call.method === 'POST').length, 3); assert.equal(result.calls.some(call => call.route === 'git/refs' && call.method === 'POST'), false);
});
test('checksums use the returned download name when GitHub normalizes a filename', async () => {
  const result = await run('normalized'); assert.equal(result.status, 0, result.stderr);
  assert.match(result.checksums, /  Squidware\.0\.5\.0\.exe\n/);
  assert.doesNotMatch(result.checksums, /  Squidware-0\.5\.0\.exe/);
});
test('space-containing Windows packages use their portable download name', async () => {
  const result = await run('space'); assert.equal(result.status, 0, result.stderr);
  assert.match(result.checksums, /  Squidware\.0\.5\.0\.exe\n/);
  assert.doesNotMatch(result.checksums, /  Squidware 0\.5\.0\.exe/);
});
test('resuming a Windows package with spaces reuses its normalized asset and digest', async () => {
  const result = await run('space-resume'); assert.equal(result.status, 0, result.stderr);
  assert.ok(result.checksums.includes('e'.repeat(64) + '  Squidware.0.5.0.exe'));
  assert.equal(result.calls.filter(call => call.route.endsWith('/assets') && call.method === 'POST').length, 3);
});
