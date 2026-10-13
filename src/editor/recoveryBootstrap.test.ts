import { describe, expect, it, vi } from 'vitest';
import type { RecoveryBridge, RecoveryVersion } from '../types';
import { bootstrapRecovery } from './recoveryBootstrap';
const version: RecoveryVersion = { id: 'copy', title: 'Existing production', createdAt: 1, revision: 1, source: 'automatic', projectId: 'show', performers: 2, sets: 3, bytes: 20 };
function setup() {
  const bridge: RecoveryBridge = {
    beginRecovery: vi.fn(async () => ({ session: 'lease', versions: [version], warnings: [] })),
    listRecoveries: vi.fn(async () => ({ versions: [version], warnings: [] })),
    migrateRecovery: vi.fn(async () => ({ status: 'migrated' as const })),
    writeRecovery: vi.fn(), readRecovery: vi.fn(),
  };
  const storage = { getItem: vi.fn(() => 'original'), removeItem: vi.fn() };
  return { bridge, storage };
}
describe('recovery bootstrap preserves sources independently of desktop availability', () => {
  it('removes the legacy key only after durable migration and reads the native versions', async () => {
    const { bridge, storage } = setup();
    const result = await bootstrapRecovery(bridge, () => storage);
    expect(bridge.migrateRecovery).toHaveBeenCalledWith('lease', 'original');
    expect(storage.removeItem).toHaveBeenCalledOnce(); expect(result.versions).toEqual([version]);
  });
  it('keeps a competing legacy value written while migration was in flight', async () => {
    const { bridge, storage } = setup(); storage.getItem.mockReturnValueOnce('original').mockReturnValue('newer');
    await bootstrapRecovery(bridge, () => storage); expect(storage.removeItem).not.toHaveBeenCalled();
  });
  it('keeps an unreadable original and still offers existing native copies', async () => {
    const { bridge, storage } = setup(); bridge.migrateRecovery = async () => ({ status: 'unreadable', warning: 'Use a compatible version.' });
    const result = await bootstrapRecovery(bridge, () => storage);
    expect(storage.removeItem).not.toHaveBeenCalled(); expect(result.versions).toEqual([version]); expect(result.warnings).toContain('Use a compatible version.');
  });
  it('a migration failure cannot hide native copies or erase an oversized source', async () => {
    const { bridge, storage } = setup(); bridge.migrateRecovery = async () => { throw new Error('Legacy source exceeds the migration limit.'); };
    const result = await bootstrapRecovery(bridge, () => storage);
    expect(result.versions).toEqual([version]); expect(result.session).toBe('lease'); expect(storage.removeItem).not.toHaveBeenCalled();
    expect(result.warnings.join(' ')).toContain('Legacy browser recovery was kept unchanged');
  });
  it('inaccessible browser storage does not prevent native recovery', async () => {
    const { bridge } = setup();
    const result = await bootstrapRecovery(bridge, () => { throw new Error('Storage denied'); });
    expect(result.versions).toEqual([version]); expect(bridge.migrateRecovery).not.toHaveBeenCalled(); expect(result.warnings.length).toBe(1);
  });
  it('failed legacy key removal preserves the source and explains successful migration', async () => {
    const { bridge, storage } = setup(); storage.removeItem.mockImplementation(() => { throw new Error('Read only'); });
    const result = await bootstrapRecovery(bridge, () => storage);
    expect(result.warnings.join(' ')).toContain('Migration succeeded'); expect(result.versions).toEqual([version]);
  });
});
