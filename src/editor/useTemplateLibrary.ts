import { useCallback, useEffect, useRef, useState } from 'react';
import { parseTemplateLibrary, serializeTemplateLibrary, validateTemplateLibrary } from '../templates/library';
import type { Template, TemplateLibrary } from '../templates/library';
import { browserTemplateStorage, emptyTemplateLibrary } from '../templates/storage';
import type { TemplateStorage } from '../templates/storage';

export function useTemplateLibrary() {
  const adapter = useRef<TemplateStorage | null>(null);
  if (!adapter.current) adapter.current = window.squidware
    ? { read: () => window.squidware!.readTemplateLibrary(), save: content => window.squidware!.saveTemplateLibrary(content) }
    : browserTemplateStorage(() => window.localStorage);
  const [library, setLibrary] = useState<TemplateLibrary>(emptyTemplateLibrary);
  const [status, setStatus] = useState<'loading' | 'saved' | 'saving' | 'unavailable'>('loading');
  const [error, setError] = useState('');
  const current = useRef(library), ready = useRef(false), busy = useRef(false);
  useEffect(() => {
    let alive = true;
    void adapter.current!.read().then(result => {
      if (!alive) return;
      const next = parseTemplateLibrary(result.content);
      current.current = next; setLibrary(next); ready.current = !result.readOnly;
      setStatus(result.readOnly ? 'unavailable' : 'saved'); setError(result.warning ?? '');
    }).catch(reason => { if (alive) { setStatus('unavailable'); setError((reason as Error).message); } });
    return () => { alive = false; };
  }, []);
  const write = useCallback(async (change: (value: TemplateLibrary) => TemplateLibrary): Promise<boolean> => {
    if (!ready.current || busy.current) return false;
    busy.current = true; setStatus('saving'); setError('');
    try {
      const next = validateTemplateLibrary(change(current.current));
      await adapter.current!.save(serializeTemplateLibrary(next));
      current.current = next; setLibrary(next); setStatus('saved'); return true;
    } catch (reason) { setError((reason as Error).message); setStatus('saved'); return false; }
    finally { busy.current = false; }
  }, []);
  return { library, status, error,
    add: (entry: Template) => write(value => ({ ...value, entries: [...value.entries, entry] })),
    importEntries: (imported: TemplateLibrary) => write(value => ({ ...value, entries: [...value.entries, ...imported.entries] })),
    rename: (index: number, name: string) => write(value => ({ ...value, entries: value.entries.map((entry, i) => i === index ? { ...entry, name } : entry) })),
    remove: (index: number) => write(value => ({ ...value, entries: value.entries.filter((_, i) => i !== index) })),
  };
}
