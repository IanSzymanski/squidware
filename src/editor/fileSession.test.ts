import { describe, expect, it, vi } from 'vitest';
import { createBlankProject, createDemoProject } from '../domain';
import type { Project } from '../types';
import { createEditorStore } from './store';
import { assertCanReplace, assertUnchangedSince, fileStatusText, hasUnsavedWork, isFileDirty, markFileOpened, saveProjectRevision } from './fileSession';

function opened() {
  const store = createEditorStore(createDemoProject());
  markFileOpened(store, false);
  return store;
}
function pendingSave() {
  let resolve!: (value: boolean) => void;
  const writer = vi.fn(() => new Promise<boolean>(done => { resolve = done; }));
  return { writer, finish: (value = true) => resolve(value) };
}

describe('explicit project file state', () => {
  it('starts new and recovered productions unsaved until an explicit save succeeds', async () => {
    const store = createEditorStore(createDemoProject());
    expect(isFileDirty(store.getState())).toBe(true);
    expect(fileStatusText(store.getState())).toBe('Unsaved changes');
    await saveProjectRevision(store, async () => true);
    expect(hasUnsavedWork(store.getState())).toBe(false);
    // The same project ID and geometry can also be loaded from a recovery copy.
    store.dispatch('project.load', { project: store.getState().project.present });
    expect(store.getState().fileSession.savedRevision).toBeNull();
    expect(isFileDirty(store.getState())).toBe(true);
    expect(store.getState().fileSession.needsSaveAs).toBe(true);
  });

  it('marks opened files clean, while imports may still require a new destination', () => {
    const store = createEditorStore(createBlankProject());
    markFileOpened(store, true);
    expect(hasUnsavedWork(store.getState())).toBe(false);
    expect(store.getState().fileSession.needsSaveAs).toBe(true);
    expect(fileStatusText(store.getState())).toBe('Project file saved');
  });

  it('reports a pending draft on a saved file and blocks saving that draft', async () => {
    const store = opened(); const writer = vi.fn(async (_project: Project, _saveAs: boolean) => true);
    store.setValue('ui', 'pendingDraft', true);
    expect(isFileDirty(store.getState())).toBe(false);
    expect(hasUnsavedWork(store.getState())).toBe(true);
    expect(fileStatusText(store.getState())).toBe('Unsaved changes · Draft pending');
    await expect(saveProjectRevision(store, writer)).rejects.toThrow(/pending edit/);
    expect(writer).not.toHaveBeenCalled();
    expect(() => assertCanReplace(store.getState())).toThrow(/pending edit/);
    store.setValue('ui', 'pendingDraft', false);
    expect(hasUnsavedWork(store.getState())).toBe(false);
  });

  it('keeps saved revisions and Save As requirements through cancellation and failure', async () => {
    const store = opened(); const saved = store.getState().fileSession.savedRevision;
    store.dispatch('project.update', { title: 'Unwritten edit' });
    expect(await saveProjectRevision(store, async () => false, true)).toBe('canceled');
    expect(store.getState().fileSession.savedRevision).toBe(saved);
    expect(fileStatusText(store.getState())).toBe('Unsaved changes · Save canceled');
    await expect(saveProjectRevision(store, async () => { throw new Error('Disk full'); })).rejects.toThrow('Disk full');
    expect(store.getState().fileSession.savedRevision).toBe(saved);
    expect(fileStatusText(store.getState())).toBe('Unsaved changes · Save failed');
    expect(store.getState().fileSession.fileOperation).toBeNull();
    store.dispatch('history.undo');
    expect(fileStatusText(store.getState())).toBe('Project file saved');
    const fresh = createEditorStore(createBlankProject());
    await saveProjectRevision(fresh, async () => false);
    expect(fresh.getState().fileSession.needsSaveAs).toBe(true);
    expect(fresh.getState().fileSession.savedRevision).toBeNull();
  });

  it('saves the captured revision while newer edits stay unsaved, including undo and redo', async () => {
    const store = opened(); store.dispatch('project.update', { title: 'Captured' });
    const before = store.getState(); const pending = pendingSave();
    const saving = saveProjectRevision(store, pending.writer);
    expect(fileStatusText(store.getState())).toBe('Unsaved changes · Saving…');
    store.dispatch('project.update', { title: 'Later edit' });
    pending.finish(); expect(await saving).toBe('saved');
    expect(pending.writer).toHaveBeenCalledWith(before.project.present, false);
    expect(store.getState().fileSession.savedRevision).toBe(before.project.revision);
    expect(isFileDirty(store.getState())).toBe(true);
    store.dispatch('history.undo'); expect(isFileDirty(store.getState())).toBe(false);
    store.dispatch('history.redo'); expect(isFileDirty(store.getState())).toBe(true);
  });

  it('does not clear a draft typed while a save is in flight', async () => {
    const store = opened(); const pending = pendingSave();
    const saving = saveProjectRevision(store, pending.writer);
    store.setValue('ui', 'pendingDraft', true);
    pending.finish(); await saving;
    expect(isFileDirty(store.getState())).toBe(false);
    expect(hasUnsavedWork(store.getState())).toBe(true);
    expect(fileStatusText(store.getState())).toContain('Draft pending');
  });

  it('refuses overlapping operations and cannot apply an old save to a newly loaded epoch', async () => {
    const store = opened(); const pending = pendingSave();
    const before = store.getState(); const saving = saveProjectRevision(store, pending.writer, true);
    const second = vi.fn(async () => true);
    expect(await saveProjectRevision(store, second)).toBe('busy');
    expect(second).not.toHaveBeenCalled();
    expect(() => assertCanReplace(store.getState())).toThrow(/file operation/);
    store.dispatch('project.load', { project: before.project.present });
    pending.finish(); expect(await saving).toBe('stale');
    expect(store.getState().fileSession.savedRevision).toBeNull();
    expect(store.getState().fileSession.needsSaveAs).toBe(true);
    expect(store.getState().fileSession.saveStatus).toBe('Save a project file');
    expect(store.getState().fileSession.fileOperation).toBeNull();
  });

  it('passes Save As explicitly and forces a destination for unsaved new projects', async () => {
    const store = opened(); const writer = vi.fn(async (_project: Project, _saveAs: boolean) => true);
    await saveProjectRevision(store, writer, true);
    expect(writer.mock.calls[0][1]).toBe(true);
    const fresh = createEditorStore(createDemoProject());
    await saveProjectRevision(fresh, writer);
    expect(writer.mock.calls[1][1]).toBe(true);
  });

  it('checks file-open completion for intervening edits, reloads, drafts and transactions', () => {
    const store = opened(); const before = store.getState();
    assertUnchangedSince(before, store.getState());
    store.dispatch('project.update', { title: 'Edited during open' });
    expect(() => assertUnchangedSince(before, store.getState())).toThrow(/changed/);
    store.dispatch('history.undo');
    store.setValue('ui', 'pendingDraft', true);
    expect(() => assertUnchangedSince(before, store.getState())).toThrow(/changed/);
    store.setValue('ui', 'pendingDraft', false);
    store.beginTransaction('Uncommitted edit');
    expect(() => assertUnchangedSince(before, store.getState())).toThrow(/changed/);
    store.cancelTransaction();
    store.dispatch('project.load', { project: before.project.present });
    expect(() => assertUnchangedSince(before, store.getState())).toThrow(/changed/);
  });

  it('keeps pending dialog drafts visible through close, new, export and help commands', () => {
    const store = opened();
    store.dispatch('dialog.open', { dialog: 'settings' });
    store.setValue('ui', 'pendingDraft', true);
    expect(store.dispatch('dialog.open', { dialog: null })).toBe(false);
    for (const command of ['file.new', 'file.export', 'help.open', 'history.open'] as const) {
      expect(store.dispatch(command)).toBe(false);
      expect(store.getState().ui.dialog).toBe('settings');
      expect(store.getState().ui.pendingDraft).toBe(true);
    }
    store.setValue('ui', 'pendingDraft', false);
    expect(store.dispatch('file.new')).toBe(true);
    expect(store.getState().ui.dialog).toBe('new');
  });

  it('does not trap an invalid Inspector draft behind a newly opened modal', () => {
    const store = opened();
    store.setValue('ui', 'pendingDraft', true);
    expect(store.dispatch('dialog.open', { dialog: 'settings' })).toBe(false);
    expect(store.dispatch('dialog.open', { dialog: 'new' })).toBe(false);
    expect(store.dispatch('help.open')).toBe(false);
    expect(store.getState().ui.dialog).toBeNull();
    store.setValue('ui', 'pendingDraft', false);
    expect(store.dispatch('dialog.open', { dialog: 'settings' })).toBe(true);
  });

  it('detects dirty/draft/undo changes without serializing projects or responding to recovery-only UI updates', () => {
    const store = opened(); const listener = vi.fn();
    store.subscribeSelector(hasUnsavedWork, listener);
    const stringify = vi.spyOn(JSON, 'stringify');
    try {
      store.setValue('ui', 'toast', 'Recovery copy saved');
      store.setValue('playback', 'count', 2);
      expect(listener).not.toHaveBeenCalled();
      store.dispatch('project.update', { title: 'Changed' });
      expect(isFileDirty(store.getState())).toBe(true);
      store.setValue('ui', 'toast', 'Recovery copy saved');
      expect(isFileDirty(store.getState())).toBe(true);
      store.dispatch('history.undo');
      expect(hasUnsavedWork(store.getState())).toBe(false);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(stringify).not.toHaveBeenCalled();
    } finally { stringify.mockRestore(); }
  });
});
