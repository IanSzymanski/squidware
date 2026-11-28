import { DEFAULT_SNAPPING, fieldSnapStatus } from '../snapping';
import { nudgeText } from './units';
import { HelpButton, useShowHints } from '../editor/ControlHelp';
import type { EditorController } from '../editor/useEditorController';
import type { ShellLayout } from './useShellLayout';

/** What to do next, for the state the editor is in. */
function hint(c: EditorController): string {
  // A docked editor says what to do in the tool strip; the field's margin stays clear for its own guides.
  if (c.pathOperations || c.routeEditor || c.movementEditor) return '';
  if (c.formationPreview) return 'Drag the handles on the field or type exact values · Enter applies · Esc cancels';
  if (c.transformPreview || c.spacingPreview || c.coordinatePreview || c.selectionPreview) return 'Review the preview on the field · Enter applies · Esc cancels';
  if (c.playing) return 'Space pauses · positions are a preview while the show plays';
  if (c.view === '3d') return 'Drag to orbit · right-drag to pan · scroll to zoom';
  if (c.readOnly) return 'Between sets: positions are a preview · go to a set to edit';
  if (c.tool === 'lasso') return 'Draw around performers to select them · Shift adds to the selection';
  if (c.tool === 'pan') return 'Drag to pan · scroll to zoom · V returns to Select';
  if (!c.project.performers.length) return 'Open Cast to add performers, then shape your first set';
  if (!c.selectedIds.length) return 'Click a dot or drag a box to select';
  if (c.selectedIds.length === 1) return `Drag to move · Alt+arrows nudge ${nudgeText(c.preferences.value, c.project)}`;
  return `Drag to move · handles scale and rotate · Alt+arrows nudge ${nudgeText(c.preferences.value, c.project)}`;
}

/** One quiet line on the field's margin that says what to do next. Hidden with the Show hints preference. */
export function FieldHint({ controller }: { controller: EditorController; layout?: ShellLayout }) {
  const showHints = useShowHints();
  const text = showHints ? hint(controller) : '';
  return text ? <p className="canvas-hint" data-hint="">{text}</p> : null;
}

/** The grid the field snaps to, and the way to change it. */
export function SnapStatus({ controller: c }: { controller: EditorController }) {
  const { project } = c;
  return <HelpButton pointerPassThrough title="Grid and snapping" description="The step grid direct edits snap to. Open to change it." className="canvas-chip statusbar-snap-button" onClick={() => c.setDialog('snapping')}>
    <span className="statusbar-snap" role="status">{fieldSnapStatus(project.snapping ?? DEFAULT_SNAPPING, c.snap, c.coordinatePreview ? 'coordinates' : c.spacingPreview ? 'spacing' : undefined, project.field)}</span>
  </HelpButton>;
}
