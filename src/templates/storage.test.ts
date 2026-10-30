import { describe, expect, it } from 'vitest';
import { browserTemplateStorage, emptyTemplateLibrary, TEMPLATE_STORAGE_KEY } from './storage';
import { serializeTemplateLibrary } from './library';

const empty = serializeTemplateLibrary(emptyTemplateLibrary());
function fixture(initial?: string) {
  const values = new Map(initial === undefined ? [] : [[TEMPLATE_STORAGE_KEY, initial]]);
  let fail = false;
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { if (fail) throw new Error('Quota exceeded'); values.set(key, value); } };
  return { values, storage, adapter: browserTemplateStorage(() => storage), fail: (value: boolean) => { fail = value; } };
}
describe('browser template library storage', () => {
  it('starts empty without writing, persists independently and reloads canonical content', async () => {
    const h = fixture(); expect(await h.adapter.read()).toEqual({ content: empty }); expect(h.values.size).toBe(0);
    await h.adapter.save(empty);
    expect([...h.values.keys()]).toEqual([TEMPLATE_STORAGE_KEY]);
    expect(await browserTemplateStorage(() => h.storage).read()).toEqual({ content: empty });
  });
  it.each(['{broken', '{"format":"squidware-template-library","version":2,"entries":[]}', 'x'.repeat(1024 * 1024 + 1)])('preserves unreadable stored data', async original => {
    const h = fixture(original); const result = await h.adapter.read();
    expect(result.readOnly).toBe(true); expect(result.warning).toContain('untouched');
    await expect(h.adapter.save(empty)).rejects.toThrow(/unavailable/);
    expect(h.values.get(TEMPLATE_STORAGE_KEY)).toBe(original);
  });
  it('reports inaccessible storage and never falsely marks it saved', async () => {
    const adapter = browserTemplateStorage(() => { throw new Error('Storage denied'); });
    expect((await adapter.read()).warning).toContain('Storage denied');
    await expect(adapter.save(empty)).rejects.toThrow(/unavailable/);
  });
  it('rejects invalid writes and retries after quota errors without forgetting the durable value', async () => {
    const h = fixture(empty); await h.adapter.read();
    await expect(h.adapter.save('{}')).rejects.toThrow(); expect(h.values.get(TEMPLATE_STORAGE_KEY)).toBe(empty);
    h.fail(true); await expect(h.adapter.save(empty)).rejects.toThrow(/Quota/);
    h.fail(false); await expect(h.adapter.save(empty)).resolves.toBeUndefined();
  });
  it('protects changes made by another tab or process', async () => {
    const h = fixture(); await h.adapter.read(); h.values.set(TEMPLATE_STORAGE_KEY, empty);
    await expect(h.adapter.save(empty)).rejects.toThrow(/another window/);
    expect(h.values.get(TEMPLATE_STORAGE_KEY)).toBe(empty);
  });
});
