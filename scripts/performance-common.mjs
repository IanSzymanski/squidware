import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function option(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find(argument => argument.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}
export function integerOption(name, fallback, minimum = 1) {
  const value = Number(option(name, fallback));
  if (!Number.isInteger(value) || value < minimum || value > 10000) throw new Error(`--${name} must be an integer from ${minimum} to 10000.`);
  return value;
}
export function summarize(samples) {
  if (!samples.length) return { samples: 0, medianMs: null, p95Ms: null, minMs: null, maxMs: null };
  const ordered = [...samples].sort((a, b) => a - b);
  const midpoint = Math.floor(ordered.length / 2);
  return { samples: ordered.length, medianMs: ordered.length % 2 ? ordered[midpoint] : (ordered[midpoint - 1] + ordered[midpoint]) / 2,
    p95Ms: ordered[Math.ceil(ordered.length * 0.95) - 1], minMs: ordered[0], maxMs: ordered.at(-1) };
}
export function hardware() {
  return { os: os.type(), release: os.release(), architecture: os.arch(), cpuModel: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length, totalMemoryBytes: os.totalmem(), node: process.versions.node,
    representativeSchoolLaptop: false, note: 'Host measurements only; school-laptop qualification requires a separate run.' };
}
export async function fingerprint(directory) {
  const hash = createHash('sha256');
  async function walk(current) {
    for (const item of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const filename = path.join(current, item.name);
      if (item.isDirectory()) await walk(filename);
      else { hash.update(path.relative(directory, filename).split(path.sep).join('/')); hash.update(await readFile(filename)); }
    }
  }
  await walk(directory);
  return hash.digest('hex');
}
