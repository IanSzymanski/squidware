import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { checkNotices } from './generate-notices.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

export default async function beforePack() {
  await checkNotices();
  const electron = JSON.parse(await readFile(join(root, 'node_modules/electron/package.json'), 'utf8'));
  const runtimeVersion = (await readFile(join(root, 'node_modules/electron/dist/version'), 'utf8')).trim().replace(/^v/, '');
  if (runtimeVersion !== electron.version) {
    throw new Error('Installed Electron binary does not match its package version. Reinstall the Electron runtime.');
  }
  // extraResources must have an installed runtime notice to copy on every OS.
  const chromium = await readFile(join(root, 'node_modules/electron/dist/LICENSES.chromium.html'));
  if (chromium.length === 0) throw new Error('Electron Chromium notices are empty. Reinstall the Electron runtime.');
}

export async function afterPack(context) {
  const resources = context.packager.getResourcesDir(context.appOutDir);
  const files = [
    ['LICENSE', 'LICENSE.txt'],
    ['THIRD_PARTY_NOTICES.txt', 'THIRD_PARTY_NOTICES.txt'],
    ['node_modules/electron/dist/LICENSES.chromium.html', 'LICENSES.chromium.html'],
  ];
  for (const [source, destination] of files) {
    const original = await readFile(join(root, source));
    const packaged = await readFile(join(resources, 'legal', destination));
    if (!original.equals(packaged)) throw new Error(`Packaged legal/${destination} does not match its source.`);
  }
  console.log('Verified packaged Squidware, dependency, and Chromium notices.');
}
