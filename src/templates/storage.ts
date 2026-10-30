import { parseTemplateLibrary, serializeTemplateLibrary } from './library';
import type { TemplateLibrary } from './library';

export const TEMPLATE_STORAGE_KEY = 'squidware.templates.v1';
export const emptyTemplateLibrary = (): TemplateLibrary => ({ format: 'squidware-template-library', version: 1, entries: [] });
export interface TemplateLibraryRead { content: string; warning?: string; readOnly?: boolean }
export interface TemplateLibraryBridge {
  readTemplateLibrary: () => Promise<TemplateLibraryRead>;
  saveTemplateLibrary: (content: string) => Promise<void>;
  openTemplateLibrary: () => Promise<string | null>;
  exportTemplateLibrary: (content: string) => Promise<string | null>;
}
export interface TemplateStorage {
  read: () => Promise<TemplateLibraryRead>;
  save: (content: string) => Promise<void>;
}

/** Browser persistence is separate from recovery, preferences and production JSON. */
export function browserTemplateStorage(storage: () => Pick<Storage, 'getItem' | 'setItem'>): TemplateStorage {
  let expected: string | null = null, initialized = false, readOnly = false;
  return {
    async read() {
      try {
        expected = storage().getItem(TEMPLATE_STORAGE_KEY);
        const content = serializeTemplateLibrary(expected === null ? emptyTemplateLibrary() : parseTemplateLibrary(expected));
        initialized = true;
        return { content };
      } catch (error) {
        readOnly = true;
        return { content: serializeTemplateLibrary(emptyTemplateLibrary()), readOnly: true,
          warning: `${(error as Error).message} Your stored library is untouched. Restore a supported library in storage or update Squidware, then reload.` };
      }
    },
    async save(content) {
      const canonical = serializeTemplateLibrary(parseTemplateLibrary(content));
      if (!initialized || readOnly) throw new Error('The personal library is unavailable. Reload after restoring access; existing data is untouched.');
      const target = storage();
      if (target.getItem(TEMPLATE_STORAGE_KEY) !== expected) throw new Error('Your library changed in another window. Reload before saving to avoid replacing those changes.');
      target.setItem(TEMPLATE_STORAGE_KEY, canonical);
      expected = canonical;
    },
  };
}
