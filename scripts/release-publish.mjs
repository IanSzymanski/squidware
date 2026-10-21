import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { github, loadPlan, requireReady } from './release-github.mjs';
import { versionedPackage } from './release-version.mjs';

const [version, source, milestoneText] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version || '') || !/^[a-f0-9]{40}$/.test(source || '') || !/^\d+$/.test(milestoneText || '')) throw new Error('Invalid release publication inputs.');
const plan = await loadPlan(), release = plan.releases.find(item => item.version === version);
if (!release) throw new Error('Release version is not planned.');
const tag = `v${version}`, milestone = Number(milestoneText);
const issues = await requireReady(plan, release, milestone);
const runs = await github(`actions/workflows/ci.yml/runs?event=push&branch=main&head_sha=${source}&per_page=10`);
const latest = runs.workflow_runs.find(run => run.head_sha === source);
if (latest?.status !== 'completed' || latest.conclusion !== 'success') throw new Error('Source commit CI is not successful.');
const head = (await github('git/ref/heads/main')).object.sha;
if (head !== source && !['ahead', 'identical'].includes((await github(`compare/${source}...${head}`)).status)) throw new Error('Release source is no longer in main history.');
let existing;
try { existing = await github(`releases/tags/${tag}`); } catch (error) { if (error.status !== 404) throw error; }
if (existing && !existing.draft) { console.log(`${tag} is already published; nothing overwritten.`); process.exit(0); }
const files = (await readdir('release')).filter(name => /\.(exe|dmg|AppImage)$/.test(name));
for (const extension of ['.exe', '.dmg', '.AppImage']) if (!files.some(name => name.endsWith(extension))) throw new Error(`Missing package ${extension}.`);
if (files.some(name => !name.includes(version))) throw new Error('Package filenames do not match the release version.');
const checksums = await Promise.all(files.sort().map(async name => `${createHash('sha256').update(await readFile(`release/${name}`)).digest('hex')}  ${name}`));
await writeFile('release/SHA256SUMS.txt', checksums.join('\n') + '\n');
const sourcePackage = await github(`contents/package.json?ref=${source}`);
const content = versionedPackage(Buffer.from(sourcePackage.content, 'base64').toString('utf8'), version);
const commit = await github(`git/commits/${source}`);
const tree = await github('git/trees', 'POST', { base_tree: commit.tree.sha, tree: [{ path: 'package.json', mode: '100644', type: 'blob', content }] });
let reference;
try { reference = await github(`git/ref/tags/${tag}`); } catch (error) { if (error.status !== 404) throw error; }
let releaseSha;
if (reference) {
  if (reference.object.type !== 'commit') throw new Error('Existing tag must be inspected manually; it will not be moved.');
  const tagged = await github(`git/commits/${reference.object.sha}`);
  if (tagged.tree.sha !== tree.sha || tagged.parents[0]?.sha !== source) throw new Error('Existing tag differs from these verified packages; it will not be moved.');
  releaseSha = tagged.sha;
} else {
  const versionCommit = await github('git/commits', 'POST', { message: `Release ${tag}`, tree: tree.sha, parents: [source] });
  releaseSha = versionCommit.sha;
  await github('git/refs', 'POST', { ref: `refs/tags/${tag}`, sha: releaseSha });
}
const byId = new Map(issues.map(issue => [issue.number, issue]));
const notes = `# Squidware ${tag} — ${release.name}\n\n${release.description}\n\n## Fulfilled issues\n\n` + release.issues.map(id => `- [#${id}](https://github.com/${plan.repository}/issues/${id}) — ${byId.get(id).title}`).join('\n') + `\n\n## Verification and downloads\n\nWindows portable executable, macOS disk image and Linux AppImage were built and verified from source commit ${source}. The release tag records that exact source with package version ${version}. SHA256SUMS.txt contains package hashes. Unit tests, desktop file/security checks, build/license checks and sandboxed desktop smoke/editor checks passed before publication. ${Number(version.split('.')[0]) === 0 ? 'This pre-1.0 release uses the currently configured unsigned packaging; signed distribution is tracked by #72 for v1.0.' : ''}\n`;
const record = existing || await github('releases', 'POST', { tag_name: tag, target_commitish: releaseSha, name: `Squidware ${tag} — ${release.name}`, body: notes, draft: true, prerelease: Number(version.split('.')[0]) === 0 });
const uploaded = new Map((await github(`releases/${record.id}/assets`)).map(asset => [asset.name, asset]));
const verifiedAssets = new Map();
async function upload(name, reuseVerifiedBuild = false) {
  const data = await readFile(`release/${name}`), digest = 'sha256:' + createHash('sha256').update(data).digest('hex');
  const uploadName = name.replaceAll(' ', '.');
  const previous = uploaded.get(name) || uploaded.get(uploadName);
  if (previous) {
    const asset = previous;
    if (asset.digest !== digest && !(reuseVerifiedBuild && asset.state === 'uploaded' && asset.uploader?.login === 'github-actions[bot]' && /^sha256:[a-f0-9]{64}$/.test(asset.digest))) throw new Error(`Draft asset ${name} differs from the verified package; it will not be overwritten.`);
    return asset;
  }
  const url = record.upload_url.replace(/\{.*$/, '') + `?name=${encodeURIComponent(uploadName)}`;
  if (!url.startsWith(`https://uploads.github.com/repos/${plan.repository}/`)) throw new Error('Unexpected upload destination.');
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, 'Content-Type': name.endsWith('.txt') ? 'text/plain' : 'application/octet-stream' }, body: data });
  if (!response.ok) throw new Error(`Upload ${name} failed (${response.status}); draft remains unpublished.`);
  const asset = await response.json();
  if (asset.digest !== digest || asset.state !== 'uploaded' || typeof asset.name !== 'string' || !asset.name || /[\\/\r\n]/.test(asset.name)) throw new Error(`Uploaded asset ${name} identity or checksum does not match.`);
  return asset;
}
// A partial run may have uploaded an earlier verified build of the same immutable tag.
// Native packages need not reproduce byte-for-byte; use their actual server digests.
for (const name of files) {
  const asset = await upload(name, true);
  if (verifiedAssets.has(asset.name)) throw new Error(`Duplicate published asset name ${asset.name}.`);
  verifiedAssets.set(asset.name, asset.digest);
}
await writeFile('release/SHA256SUMS.txt', [...verifiedAssets.keys()].sort().map(name => `${verifiedAssets.get(name).slice(7)}  ${name}`).join('\n') + '\n');
await upload('SHA256SUMS.txt');
await requireReady(plan, release, milestone);
const result = await github(`releases/${record.id}`, 'PATCH', { draft: false, body: notes });
if (result.draft || result.tag_name !== tag) throw new Error('Release publication read-back failed.');
await github(`milestones/${milestone}`, 'PATCH', { state: 'closed' });
console.log(`Published ${result.html_url}`);
