import { countToSeconds } from '../domain';
import { SURFACE_NAMES } from '../surfaces';
import { DEFAULT_SNAPPING, fieldSnapStatus } from '../snapping';
import { nudgeLabel } from '../editIncrements';
import { HelpButton, useShowHints } from '../editor/ControlHelp';
import type { EditorController } from '../editor/useEditorController';
import type { ShellLayout } from './useShellLayout';

/** One quiet line: what to do next on the left, the facts of the production on the right. */
function hint(c: EditorController, layout: ShellLayout): string {
  if (layout.mode === 'plan') return 'Tab moves across cells · Enter moves down · paste a spreadsheet range to fill many sets at once';
  if (c.pathOperations || c.routeEditor || c.movementEditor) return 'Adjust the preview on the field, then Apply or Cancel in the side panel';
  if (c.formationPreview) return 'Drag the handles on the field or type exact values · Enter applies · Esc cancels';
  if (c.transformPreview || c.spacingPreview || c.coordinatePreview || c.selectionPreview) return 'Review the preview on the field · Enter applies · Esc cancels';
  if (c.playing) return 'Space pauses · positions are a preview while the show plays';
  if (c.view === '3d') return 'Drag to orbit · right-drag to pan · scroll to zoom';
  if (c.readOnly) return 'Between sets: positions are a preview · go to a set to edit';
  if (c.tool === 'lasso') return 'Draw around performers to select them · Shift adds to the selection';
  if (c.tool === 'pan') return 'Drag to pan · scroll to zoom · V returns to Select';
  if (!c.project.performers.length) return 'Open Cast to add performers, then shape your first set';
  if (!c.selectedIds.length) return 'Click a dot, drag a box or pick a section, then choose a shape';
  return `Drag to move · Alt+arrows nudge ${nudgeLabel(c.preferences.value, c.project)} · choose a shape to arrange the selection`;
}

export function StatusBar({ controller: c, layout }: { controller: EditorController; layout: ShellLayout }) {
  const showHints = useShowHints();
  const { project } = c;
  const seconds = Math.round(countToSeconds(project, c.duration));
  return <footer className="statusbar">
    <span className="statusbar-hint">{showHints && <span data-hint="">{hint(c, layout)}</span>}</span>
    <span className="statusbar-facts">
      <span>{project.sets.length} {project.sets.length === 1 ? 'set' : 'sets'} · {c.duration} counts · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>
      <i />
      <span>{project.performers.length} performers</span>
      <i />
      <span className="statusbar-field">{SURFACE_NAMES[project.field.preset]}</span>
      <i />
      <span className="statusbar-snap" role="status">{fieldSnapStatus(project.snapping ?? DEFAULT_SNAPPING, c.snap, c.coordinatePreview ? 'coordinates' : c.spacingPreview ? 'spacing' : undefined, project.field)}</span>
      <i />
      <HelpButton title="Recovery copies" description="Squidware keeps automatic local recovery copies. Review them here." className="recovery-indicator" onClick={() => { c.setDialog('recovery'); void c.recovery.refresh(); }}>{c.recovery.status}</HelpButton>
    </span>
  </footer>;
}
