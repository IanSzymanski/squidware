import showcase from '../examples/tether-space-show.squid?raw';
import { createDemoProject, parseProject } from './domain';
import type { Project } from './types';

/** "Tether", the bundled demo production: 165 members, 67 sets, written to Squidwriter's Space show. */
export function createShowcaseProject(): Project {
  return parseProject(showcase);
}

/** Desktop QA runs ask for the small generated fixture their assertions were written against. */
export function createStartupProject(): Project {
  return globalThis.window?.squidware?.legacyDemo ? createDemoProject() : createShowcaseProject();
}
