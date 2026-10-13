import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
export function versionedPackage(content, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version || '')) throw new Error('Release version must be numeric major.minor.patch.');
  return JSON.stringify({ ...JSON.parse(content), version }, null, 2) + '\n';
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await writeFile('package.json', versionedPackage(await readFile('package.json', 'utf8'), process.argv[2] || process.env.RELEASE_VERSION));
