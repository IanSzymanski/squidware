// Selection arrays are immutable editor values. Weak keys release old selections with history/session state.
const memberships = new WeakMap<readonly string[], ReadonlySet<string>>();
export function selectionMembership(ids: readonly string[]): ReadonlySet<string> {
  let membership = memberships.get(ids);
  if (!membership) { membership = new Set(ids); memberships.set(ids, membership); }
  return membership;
}

