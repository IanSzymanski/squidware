import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const execute = promisify(execFile);
const digest = value => createHash('sha256').update(value).digest('hex');
export const stampName = 'build-provenance.json';

export async function sourceIdentity(root) {
  const git = async args => (await execute('git', ['-C', root, ...args], { maxBuffer: 16 * 1024 * 1024, windowsHide: true })).stdout;
  const [revision, tree, status, listed] = await Promise.all([
    git(['rev-parse', 'HEAD']), git(['rev-parse', 'HEAD^{tree}']),
    git(['status', '--porcelain=v1', '-z']), git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']),
  ]);
  const hash = createHash('sha256');
  for (const file of [...new Set(listed.split('\0').filter(Boolean))].sort()) {
    hash.update(file + '\0');
    try { hash.update(digest(await fs.readFile(path.join(root, file)))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; hash.update('\0deleted\0'); }
    hash.update('\0');
  }
  return { revision: revision.trim(), tree: tree.trim(), dirty: !!status, contentHash: hash.digest('hex'),
    lockfileHash: digest(await fs.readFile(path.join(root, 'pnpm-lock.yaml'))) };
}

export function runtimeIdentity() {
  return { node: process.versions.node, platform: process.platform, arch: process.arch, os: os.release(),
    githubRun: process.env.GITHUB_RUN_ID ?? null, githubAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    githubRef: process.env.GITHUB_REF ?? null, runnerImage: process.env.ImageOS ?? null, runnerImageVersion: process.env.ImageVersion ?? null };
}

async function outputHash(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await fs.readdir(path.join(root, directory), { withFileTypes: true })) {
      const file = path.posix.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (file !== 'dist/' + stampName) files.push(file);
    }
  }
  await visit('dist');
  files.push('electron/project-codec.cjs', 'electron/preferences-codec.cjs');
  const hash = createHash('sha256');
  for (const file of files.sort()) { hash.update(file + '\0'); hash.update(digest(await fs.readFile(path.join(root, file)))); hash.update('\0'); }
  return hash.digest('hex');
}

export async function writeBuildStamp(root, before) {
  const after = await sourceIdentity(root);
  if (after.contentHash !== before.contentHash) throw new Error('Source changed during the build. Rebuild before testing.');
  const stamp = { schema: 1, builtAt: new Date().toISOString(), source: after, runtime: runtimeIdentity(), outputHash: await outputHash(root) };
  await fs.writeFile(path.join(root, 'dist', stampName), JSON.stringify(stamp, null, 2) + '\n');
  return stamp;
}

export async function verifyBuild(root, source = null) {
  let stamp;
  try { stamp = JSON.parse(await fs.readFile(path.join(root, 'dist', stampName), 'utf8')); }
  catch { throw new Error('No valid build provenance. Run pnpm build before desktop tests.'); }
  source ??= await sourceIdentity(root);
  if (stamp.schema !== 1 || stamp.source?.contentHash !== source.contentHash || stamp.source?.lockfileHash !== source.lockfileHash) {
    throw new Error('Built renderer is stale for this source. Run pnpm build before desktop tests.');
  }
  if (stamp.outputHash !== await outputHash(root)) throw new Error('Built output changed after the build. Run pnpm build before desktop tests.');
  return stamp;
}
