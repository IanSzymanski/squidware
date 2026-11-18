import type { Dialog } from './state';
import type { CommandId } from './commands';

export const isMovementEditor = (dialog: Dialog) => dialog === 'path-draw' || dialog === 'movement-schedule';

export const isDockedSpatialEditor = (dialog: Dialog) => isMovementEditor(dialog) || dialog === 'routes' || dialog === 'path-operations';

/** Docked drafts leave presentation and transport available, while unrelated
 * edits cannot invalidate the reviewed selection, source move or undo stack. */
export const duringSpatialEditor = (id: CommandId, dialog: Dialog) => (
  dialog === 'path-operations' ? id === 'path.operation-apply' || id === 'path.copy-intervals'
    : id === (dialog === 'routes' ? 'routes.save' : 'schedule.save')
) || [
  'dialog.open', 'project.load', 'file.save', 'file.save-as', 'file.open',
  'set.select', 'playback.scrub', 'playback.toggle', 'field.zoom-in', 'field.zoom-out', 'field.fit',
  'display.labels', 'display.grid', 'display.snap', 'tool.select',
].includes(id);
