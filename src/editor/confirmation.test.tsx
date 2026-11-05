import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { createBlankProject, createDemoProject } from '../domain';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { createEditorStore } from './store';
import { createConfirmation, isModalOpen } from './confirmation';
import { EditorProvider } from './react';

const request = { title: 'Replace this production?', message: 'Your unsaved changes will be discarded.', confirmLabel: 'Discard changes' };

describe('in-app confirmation', () => {
  it('publishes one pending request and resolves it from the dialog answer', async () => {
    const store = createEditorStore(createDemoProject()); const confirmation = createConfirmation(store);
    const accepted = confirmation.confirm(request);
    expect(store.getState().ui.confirmation).toEqual(request);
    expect(isModalOpen(store.getState())).toBe(true);
    confirmation.settle(true);
    await expect(accepted).resolves.toBe(true);
    expect(store.getState().ui.confirmation).toBeNull();
    expect(isModalOpen(store.getState())).toBe(false);
    const canceled = confirmation.confirm(request);
    confirmation.settle(false);
    await expect(canceled).resolves.toBe(false);
    confirmation.settle(true);
    expect(store.getState().ui.confirmation).toBeNull();
  });

  it('cancels a superseded request and a request cleared by a production load', async () => {
    const store = createEditorStore(createDemoProject()); const confirmation = createConfirmation(store);
    const disconnect = confirmation.connect();
    const first = confirmation.confirm(request);
    const second = confirmation.confirm({ ...request, title: 'Open another project?' });
    await expect(first).resolves.toBe(false);
    expect(store.getState().ui.confirmation?.title).toBe('Open another project?');
    store.dispatch('project.load', { project: createBlankProject() });
    expect(store.getState().ui.confirmation).toBeNull();
    await expect(second).resolves.toBe(false);
    disconnect();
  });

  it('treats a pending confirmation like an open dialog for the palette and selection tools', () => {
    const store = createEditorStore(createDemoProject()); const confirmation = createConfirmation(store);
    store.setValue('ui', 'paletteOpen', true); store.setValue('ui', 'selectionToolsOpen', true);
    void confirmation.confirm(request);
    expect(store.getState().ui).toMatchObject({ paletteOpen: false, selectionToolsOpen: false, dialog: null });
    store.setValue('ui', 'paletteOpen', true);
    expect(store.getState().ui.paletteOpen).toBe(false);
    confirmation.settle(false);
  });

  it('renders a themed Modal whose safe Cancel choice takes initial focus', () => {
    const store = createEditorStore(createDemoProject());
    const render = (element: ReactElement) => renderToStaticMarkup(<EditorProvider store={store}>{element}</EditorProvider>);
    const markup = render(<ConfirmDialog {...request} onCancel={() => {}} onConfirm={() => {}} />);
    expect(markup).toContain('class="modal  confirm-dialog"');
    expect(markup).toContain('<h2>Replace this production?</h2>');
    expect(markup).toContain('<p class="modal-intro">Your unsaved changes will be discarded.</p>');
    expect(markup).toMatch(/<button class="button subtle confirm-dialog__cancel" data-autofocus="true">Cancel<\/button><button class="button danger confirm-dialog__confirm">Discard changes<\/button>/);
    expect(render(<ConfirmDialog {...request} tone="primary" cancelLabel="Keep editing" onCancel={() => {}} onConfirm={() => {}} />)).toMatch(/>Keep editing<\/button><button class="button primary confirm-dialog__confirm">/);
  });
});
