/** One invalid or uncommitted field must stay dirty when another field commits. */
export function createDraftTracker() {
  const pending = new Set<string>();
  return {
    update(isPending: boolean, fieldId = 'legacy') {
      if (isPending) pending.add(fieldId); else pending.delete(fieldId);
      return pending.size > 0;
    },
    clear() { pending.clear(); },
  };
}
