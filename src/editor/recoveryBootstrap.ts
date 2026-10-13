import type { RecoveryBridge } from '../types';
import { AUTOSAVE_KEY } from './store';
type LegacyStorage = Pick<Storage, 'getItem' | 'removeItem'>;

export async function bootstrapRecovery(bridge: RecoveryBridge, getLegacyStorage: () => LegacyStorage) {
  const result = await bridge.beginRecovery();
  const warnings = [...result.warnings];
  let legacy: string | null = null;
  try { legacy = getLegacyStorage().getItem(AUTOSAVE_KEY); }
  catch { warnings.push('Legacy browser storage could not be read. New desktop copies remain available.'); }
  if (legacy) {
    try {
      const migration = await bridge.migrateRecovery(result.session, legacy);
      if (migration.warning) warnings.push(migration.warning);
      if (migration.status === 'migrated') {
        // Do not delete a competing source written while migration was in flight.
        try { const storage = getLegacyStorage(); if (storage.getItem(AUTOSAVE_KEY) === legacy) storage.removeItem(AUTOSAVE_KEY); }
        catch { warnings.push('Migration succeeded; the old browser copy was also kept.'); }
      }
    } catch (failure) {
      warnings.push(`Legacy browser recovery was kept unchanged. ${(failure as Error).message}`);
    }
  }
  // A migration failure must not hide existing native copies or disable new recovery.
  const refreshed = await bridge.listRecoveries(result.session);
  return { session: result.session, versions: refreshed.versions, warnings: [...new Set([...warnings, ...refreshed.warnings])] };
}
