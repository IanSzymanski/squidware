import type { Project } from '../types';

export const HISTORY_LIMITS = { entries: 80, estimatedBytes: 16 * 1024 * 1024 } as const;
export interface HistoryPatch {
  path: (string | number)[];
  before: unknown;
  after: unknown;
  beforeExists: boolean;
  afterExists: boolean;
}
export interface HistoryEntry {
  name: string;
  patches: HistoryPatch[];
  beforeRevision: number;
  afterRevision: number;
  estimatedBytes: number;
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Walk only changed immutable branches. Equal leaf values are explicit no-ops.
 * Array membership/order changes retain reversible array/entity references;
 * ordinary coordinate and metadata edits retain only the changed leaves.
 */
export function projectPatches(before: Project, after: Project): HistoryPatch[] {
  const patches: HistoryPatch[] = [];
  function visit(a: unknown, b: unknown, path: (string | number)[], aExists = true, bExists = true) {
    if (aExists === bExists && Object.is(a, b)) return;
    if (aExists && bExists && Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
      a.forEach((value, index) => visit(value, b[index], [...path, index]));
      return;
    }
    if (aExists && bExists && record(a) && record(b)
      && Object.keys(a).length === Object.keys(b).length
      && !(path.length && typeof a.id === 'string' && typeof b.id === 'string' && a.id !== b.id)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        visit(a[key], b[key], [...path, key], Object.hasOwn(a, key), Object.hasOwn(b, key));
      }
      return;
    }
    patches.push({ path, before: a, after: b, beforeExists: aExists, afterExists: bExists });
  }
  visit(before, after, []);
  return patches;
}

/** Patches come from validated canonical projects, never from files or user paths. */
export function applyProjectPatches(project: Project, patches: HistoryPatch[], direction: 'undo' | 'redo'): Project {
  interface Node { children: Map<string | number, Node>; replacement?: { value: unknown; exists: boolean } }
  const root: Node = { children: new Map() };
  for (const patch of patches) {
    let node = root;
    for (const key of patch.path) {
      if (!node.children.has(key)) node.children.set(key, { children: new Map() });
      node = node.children.get(key)!;
    }
    node.replacement = { value: direction === 'undo' ? patch.before : patch.after,
      exists: direction === 'undo' ? patch.beforeExists : patch.afterExists };
  }
  function apply(value: unknown, node: Node): unknown {
    if (node.replacement) return node.replacement.value;
    if (!node.children.size) return value;
    const copy = (Array.isArray(value) ? [...value] : { ...value as Record<string, unknown> }) as Record<string | number, unknown>;
    for (const [key, child] of node.children) {
      if (child.replacement && !child.replacement.exists) delete copy[key];
      else copy[key] = apply(copy[key], child);
    }
    return copy;
  }
  // A changed ancestor is copied once even when a formation changes hundreds of coordinates.
  return apply(project, root) as Project;
}

/** Conservative payload estimate, not a promise about JavaScript heap usage. */
export function estimatePatchBytes(patches: HistoryPatch[]): number {
  const visited = new Set<object>();
  function bytes(value: unknown): number {
    if (typeof value === 'string') return 24 + value.length * 2;
    if (!value || typeof value !== 'object') return 16;
    if (visited.has(value)) return 0;
    visited.add(value);
    return 48 + Object.entries(value).reduce((sum, [key, child]) => sum + key.length * 2 + 16 + bytes(child), 0);
  }
  return patches.reduce((sum, patch) => sum + 96 + bytes(patch.path) + bytes(patch.before) + bytes(patch.after), 0);
}

export function retainHistory(past: HistoryEntry[]): { past: HistoryEntry[]; estimatedBytes: number; dropped: number } {
  const kept = [...past];
  let estimatedBytes = kept.reduce((sum, entry) => sum + entry.estimatedBytes, 0);
  let dropped = 0;
  // Always retain the latest action, even when one large structural edit exceeds the estimate.
  while (kept.length > 1 && (kept.length > HISTORY_LIMITS.entries || estimatedBytes > HISTORY_LIMITS.estimatedBytes)) {
    estimatedBytes -= kept.shift()!.estimatedBytes;
    dropped += 1;
  }
  return { past: kept, estimatedBytes, dropped };
}
