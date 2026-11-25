import { type ReactNode, useMemo } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, Minus, MoreHorizontal, Pause, Plus, RotateCcw, RotateCw, Scissors, Sparkles, Trash2, Users, X } from 'lucide-react';
import { isCustomSurface, surfaceUnits, unitInYards, yardsInUnit } from '../surfaces';
import { nudgeLabel } from '../editIncrements';
import { DEFAULT_SNAPPING, gridInterval, snapDescription } from '../snapping';
import { coordinateDescription, performerMoveOutput, PROJECT_LIMITS, setCountLimits, setTiming } from '../domain';
import type { Preferences } from '../preferences';
import { NumberField } from '../components/NumberField';
import { Tooltip } from '../components/Tooltip';
import { CommitInput } from '../editor/EditorControls';
import { HelpButton } from '../editor/ControlHelp';
import { FacingControls } from '../editor/FacingControls';
import { FormationPanel } from '../editor/FormationPanel';
import { TransformPanel } from '../editor/TransformPanel';
import { SpacingPanel } from '../editor/SpacingPanel';
import { CoordinatePanel } from '../editor/CoordinatePanel';
import { PathOperationsPanel } from '../editor/PathOperationsPanel';
import { SharedRoutesPanel } from '../editor/SharedRoutesPanel';
import { MovementSchedulePanel } from '../editor/MovementSchedulePanel';
import { TransitionCheck } from '../editor/TransitionCheck';
import { SET_REORDER_POLICY } from '../editor/setList';
import { commandRegistry } from '../editor/commands';
import { commandUnavailable } from '../editor/paletteCommands';
import type { EditorController } from '../editor/useEditorController';
import { Menu, type MenuEntry } from '../ui/Menu';
import '../editor/tools.css';

type SectionPreference = Extract<keyof Preferences, `inspector${string}Open`>;

function Section({ title, preference, controller, children, className = '', aside }: {
  title: string; preference: SectionPreference; controller: EditorController; children: ReactNode; className?: string; aside?: ReactNode;
}) {
  return <details className={`inspector-section ${className}`} data-inspector-section={preference}
    open={controller.preferences.value[preference]}
    onToggle={event => {
      const open = event.currentTarget.open;
      if (open !== controller.preferences.value[preference]) controller.preferences.update({ [preference]: open });
    }}>
    <summary aria-label={`${title} section`}><h3>{title}</h3>{aside && <span className="inspector-section-aside">{aside}</span>}</summary>
    <div className="inspector-section-content">{children}</div>
  </details>;
}

/** Properties of whatever the writer is working on: the selection when there is one, and always the set. */
export function Inspector({ controller }: { controller: EditorController }) {
  const { project, projectEpoch, activeSet, selectedIds, selectedPerformers, index, readOnly, setPendingDraft, updateSet, setPlaying, setDialog, reorderSet, applyFormation, selectSet, setSelectedIds } = controller;
  const unit = surfaceUnits(project.field);
  const custom = isCustomSurface(project.field);
  const toUnit = (value: number) => yardsInUnit(value, unit);
  const displayPositions = controller.coordinateResult?.positions ?? controller.spacingResult?.positions ?? controller.formationResult?.positions ?? controller.transformResult?.positions ?? activeSet.positions;
  const points = useMemo(() => selectedPerformers.map(performer => displayPositions[performer.id]), [selectedPerformers, displayPositions]);
  const bounds = useMemo(() => points.length ? {
    x: Math.min(...points.map(p => p.x)), y: Math.min(...points.map(p => p.y)),
    width: Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)),
    height: Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)),
    centerX: points.reduce((sum, point) => sum + point.x / points.length, 0),
    centerY: points.reduce((sum, point) => sum + point.y / points.length, 0),
  } : null, [points]);
  const sections = useMemo(() => {
    const counts = new Map<string, number>();
    for (const performer of selectedPerformers) counts.set(performer.sectionId, (counts.get(performer.sectionId) ?? 0) + 1);
    return project.sections.filter(section => counts.has(section.id)).map(section => ({ ...section, count: counts.get(section.id)! }));
  }, [selectedPerformers, project.sections]);
  const format = (n: number) => Number(toUnit(n).toFixed(2));

  if (controller.pathOperations) return <PathOperationsPanel editor={controller.pathOperations} />;
  if (controller.routeEditor) return <SharedRoutesPanel editor={controller.routeEditor} />;
  if (controller.movementEditor) return <MovementSchedulePanel editor={controller.movementEditor} />;

  const state = controller.store.getState();
  const previewing = !!(controller.transformPreview || controller.formationPreview || controller.spacingPreview || controller.coordinatePreview);
  const unavailable = controller.selectionPreview ? 'Apply or cancel the selection preview in Selection tools before editing positions.' : controller.coordinatePreview ? 'Apply or cancel coordinate entry before other position edits.' : controller.spacingPreview ? 'Apply or cancel the spacing preview before other position edits.' : controller.formationPreview ? 'Apply or cancel the formation preview before other position edits.' : controller.transformPreview ? 'Apply or cancel the transform preview before other position edits.' : controller.pendingDraft ? 'Finish or cancel the pending input first.' : readOnly ? 'Return to a set and pause playback to edit positions.' : 'Select performers first. Use Select all for the full ensemble.';
  const single = selectedPerformers.length === 1 ? selectedPerformers[0] : undefined;
  const timing = setTiming(project, index);
  const planning = controller.workspace === 'production', three = controller.view === '3d';
  const enabled = (id: 'set.split-open' | 'choreography.open' | 'set.duplicate' | 'set.hold' | 'set.insert-before') => commandRegistry[id].enabled(state, undefined);
  const reason = (id: 'set.split-open' | 'choreography.open' | 'set.duplicate' | 'set.hold' | 'set.insert-before') => commandUnavailable(state, { id, args: undefined }) ?? undefined;

  const commit = (kind: 'formation' | 'transform' | 'spacing' | 'coordinates', result: { error?: string | null; changed?: boolean } | null | undefined, apply: () => void, idle: string) =>
    <div className="transform-commit-actions inspector-commit" role="group" aria-label={`Commit ${kind === 'coordinates' ? 'coordinate' : kind} preview`}>
      <HelpButton command={`${kind}.cancel`} title={kind === 'coordinates' ? 'Cancel coordinate entry' : `Cancel ${kind}`} className="button subtle" onClick={() => controller.dispatch(`${kind}.cancel`)}>Cancel</HelpButton>
      <HelpButton command={`${kind}.apply`} title={`Apply ${kind}`} className={`button primary${kind === 'formation' ? ' apply-formation' : ''}`}
        disabled={controller.pendingDraft || !!result?.error || !result?.changed} disabledReason={result?.error || (controller.pendingDraft ? 'Finish or cancel incomplete inputs.' : idle)} onClick={apply}>Apply {kind}</HelpButton>
    </div>;

  const setMenu: MenuEntry[] = [
    { label: 'Duplicate set', icon: <Copy size={15} />, command: 'set.duplicate', disabled: !enabled('set.duplicate'), disabledReason: reason('set.duplicate'), onSelect: () => controller.duplicateSet() },
    { label: 'Hold positions', icon: <Pause size={15} />, command: 'set.hold', description: 'Add a set after this one with everyone staying in place.', disabled: !enabled('set.hold'), disabledReason: reason('set.hold'), onSelect: () => { controller.dispatch('set.hold'); } },
    { label: 'Insert set before', icon: <Plus size={15} />, command: 'set.insert-before', disabled: !enabled('set.insert-before'), disabledReason: reason('set.insert-before'), onSelect: () => { controller.dispatch('set.insert-before'); } },
    { type: 'separator' },
    { label: 'Split transition…', icon: <Scissors size={15} />, command: 'set.split-open', disabled: !enabled('set.split-open'), disabledReason: reason('set.split-open'), onSelect: () => { controller.dispatch('set.split-open'); } },
    { label: 'Choreography cues…', icon: <Sparkles size={15} />, command: 'choreography.open', disabled: !enabled('choreography.open'), disabledReason: 'Add a move or finish the active edit.', onSelect: () => { controller.dispatch('choreography.open'); } },
    { type: 'separator' },
    { label: 'Move earlier', icon: <ArrowUp size={15} />, description: `Move the current set one position earlier. ${SET_REORDER_POLICY}`, disabled: index === 0, disabledReason: 'This is already the first set.', onSelect: () => reorderSet(-1) },
    { label: 'Move later', icon: <ArrowDown size={15} />, description: `Move the current set one position later. ${SET_REORDER_POLICY}`, disabled: index === project.sets.length - 1, disabledReason: 'This is already the last set.', onSelect: () => reorderSet(1) },
    { type: 'separator' },
    { label: 'Delete set…', icon: <Trash2 size={15} />, danger: true, disabled: project.sets.length <= 1, disabledReason: 'Keep at least one set in the production.', onSelect: () => setDialog('remove-set') },
  ];

  return <aside className="inspector">
    <div hidden={planning} className="selection-bar" role="region" aria-label="Selection actions" tabIndex={-1}>
      <div className="selection-bar-heading">
        {selectedIds.length > 0 ? <>
          <div className="selection-summary">
            <strong className="selection-count" role="status">{selectedIds.length} selected</strong>
            <span className="selection-sections">{single ? `${single.label}${single.name ? ` · ${single.name}` : ''}` : sections.slice(0, 3).map(section => section.name).join(', ')}{!single && sections.length > 3 ? ` +${sections.length - 3}` : ''}</span>
          </div>
          <HelpButton command="selection.clear" title="Clear selection" className="icon-button" onClick={() => setSelectedIds([])}><X size={15} /></HelpButton>
        </> : <>
          <div className="selection-summary">
            <strong className="selection-count" role="status">0 selected</strong>
            <span className="selection-sections">Click a dot, drag a box, or pick a section.</span>
          </div>
          <HelpButton command="selection.all" title="Select all for editing" className="button small" disabled={!project.performers.length} disabledReason="Add performers to the cast first." onClick={() => setSelectedIds(project.performers.map(p => p.id))}><Users size={13} />Select all</HelpButton>
        </>}
      </div>
      {bounds && <div className="selection-bounds">
        <span>{previewing ? 'Preview' : `Set ${index + 1}`} · {single ? coordinateDescription(displayPositions[single.id], project.field, controller.coordinateFormat) : `Center ${format(bounds.centerX)}, ${format(bounds.centerY)} ${unit}`}</span>
        {!single && <span>Bounds {format(bounds.width)} × {format(bounds.height)} {unit}</span>}
      </div>}
      {readOnly && !controller.selectionPreview && !previewing && <HelpButton command="set.select" showShortcut={false} title="Return to this set to edit" className="return-to-set" onClick={() => selectSet(index)}>Return to set {index + 1} to edit<ArrowRight size={13} /></HelpButton>}
    </div>

    <div className="inspector-scroll">
      {controller.formationPreview && <div className="inspector-tool"><h3 className="inspector-tool-title">Formation</h3><FormationPanel controller={controller} /></div>}
      {controller.transformPreview && <div className="inspector-tool"><h3 className="inspector-tool-title">Rotate and scale</h3><TransformPanel controller={controller} /></div>}
      {controller.spacingPreview && <div className="inspector-tool"><h3 className="inspector-tool-title">Align and space</h3><SpacingPanel controller={controller} /></div>}
      {controller.coordinatePreview && <div className="inspector-tool"><h3 className="inspector-tool-title">Coordinates</h3><CoordinatePanel controller={controller} /></div>}

      {points.length > 0 && !previewing && <div hidden={planning || three}>
        <Section title={single ? 'Position' : 'Move'} preference="inspectorSelectionOpen" className="selection-section" controller={controller}>
          {single && <div key={`${projectEpoch}:${activeSet.id}:${single.id}`} className="selected-performer">
            <div className="form-row exact-position">
              <NumberField onDraftChange={setPendingDraft} label={custom ? `X · ${unit} from left` : 'X · yards from left'} description="Set this performer’s horizontal distance from the left edge." disabledReason={unavailable} value={Number(toUnit(activeSet.positions[single.id].x).toFixed(3))} min={0} max={toUnit(project.field.width)} step={toUnit(gridInterval(project.snapping ?? DEFAULT_SNAPPING))} disabled={readOnly} onChange={value => controller.dispatch('positions.place', { index, id: single.id, axis: 'x', value: unitInYards(value, unit) })} />
              <NumberField onDraftChange={setPendingDraft} label={custom ? `Y · ${unit} from back` : 'Y · yards from back'} description={custom ? 'Set this performer’s distance from the back edge.' : 'Set this performer’s distance in yards from the back sideline.'} disabledReason={unavailable} value={Number(toUnit(activeSet.positions[single.id].y).toFixed(3))} min={0} max={toUnit(project.field.height)} step={toUnit(gridInterval(project.snapping ?? DEFAULT_SNAPPING))} disabled={readOnly} onChange={value => controller.dispatch('positions.place', { index, id: single.id, axis: 'y', value: unitInYards(value, unit) })} />
            </div>
            <p className="selection-move">{performerMoveOutput(project, index, single.id, controller.coordinateFormat).description}</p>
          </div>}
          <div className="nudge-row">
            <div className="transform-buttons move-buttons" role="group" aria-label={`Move ${selectedIds.length === 1 ? 'performer' : 'group'}`}>
              {([{ label: 'left', icon: ArrowLeft, key: 'ArrowLeft' }, { label: 'back', icon: ArrowUp, key: 'ArrowUp' }, { label: 'front', icon: ArrowDown, key: 'ArrowDown' }, { label: 'right', icon: ArrowRight, key: 'ArrowRight' }] as const).map(({ label, icon: Icon, key }) =>
                <HelpButton key={label} command="selection.nudge" className={`icon-button move-selection-${label}`} title={`Move selection ${label}`} description={`Request ${nudgeLabel(controller.preferences.value, project)} toward field ${label}; arrow icons follow the displayed orientation. ${controller.snap ? snapDescription(project.snapping ?? DEFAULT_SNAPPING) : 'Snapping is off'}. Targets and field boundaries determine the accepted distance. Shift-click requests ${nudgeLabel(controller.preferences.value, project, true)}.`} disabled={readOnly || controller.pendingDraft} disabledReason={unavailable} onClick={event => controller.dispatch('selection.nudge', { key, fast: event.shiftKey, fieldRelative: true })}><Icon size={15} style={{ transform: controller.preferences.value.fieldOrientation === 'audience-top' ? 'rotate(180deg)' : undefined }} /></HelpButton>)}
            </div>
            <span className="nudge-step">{nudgeLabel(controller.preferences.value, project)} per press</span>
          </div>
          {points.length > 1 && <div className="nudge-row">
            <div className="transform-buttons" role="group" aria-label="Rotate and scale in steps">
              <HelpButton command="selection.increment" className="icon-button" title={`Rotate selection ${controller.preferences.value.rotationStep}° counterclockwise`} description={`Preview a ${controller.preferences.value.rotationStep}-degree counterclockwise rotation. Adjust its pivot, then Apply or Cancel.`} disabledReason={unavailable} disabled={readOnly || controller.pendingDraft} onClick={() => controller.dispatch('selection.increment', { operation: 'rotate', direction: -1 })}><RotateCcw size={15} /></HelpButton>
              <HelpButton className="icon-button rotate-selection-clockwise" command="selection.increment" title={`Rotate selection ${controller.preferences.value.rotationStep}° clockwise`} description={`Preview a ${controller.preferences.value.rotationStep}-degree clockwise rotation. Adjust its pivot, then Apply or Cancel.`} disabledReason={unavailable} disabled={readOnly || controller.pendingDraft} onClick={() => controller.dispatch('selection.increment', { operation: 'rotate', direction: 1 })}><RotateCw size={15} /></HelpButton>
              <HelpButton command="selection.increment" className="icon-button" title={`Compress selection by ${controller.preferences.value.scaleStep}%`} description={`Preview ${100 - controller.preferences.value.scaleStep}% scale around the chosen pivot, then Apply or Cancel.`} disabledReason={unavailable} disabled={readOnly || controller.pendingDraft} onClick={() => controller.dispatch('selection.increment', { operation: 'scale', direction: -1 })}><Minus size={15} /></HelpButton>
              <HelpButton command="selection.increment" className="icon-button" title={`Expand selection by ${controller.preferences.value.scaleStep}%`} description={`Preview ${100 + controller.preferences.value.scaleStep}% scale around the chosen pivot, then Apply or Cancel.`} disabledReason={unavailable} disabled={readOnly || controller.pendingDraft} onClick={() => controller.dispatch('selection.increment', { operation: 'scale', direction: 1 })}><Plus size={15} /></HelpButton>
            </div>
            <span className="nudge-step">{controller.preferences.value.rotationStep}° · {controller.preferences.value.scaleStep}%</span>
          </div>}
          <details className="performer-facing">
            <summary>Facing</summary>
            <FacingControls key={JSON.stringify([projectEpoch, activeSet.id, selectedIds])} controller={controller} unavailable={unavailable} />
          </details>
        </Section>
      </div>}

      {!previewing && !!activeSet.liveFormations?.length && <div hidden={planning || three} className="inspector-live"><FormationPanel controller={controller} /></div>}

      {!previewing && <Section title={`Set ${index + 1}`} preference="inspectorSetOpen" controller={controller} className="set-section">
        <div key={`${projectEpoch}-${activeSet.id}`} className="set-fields">
          <div className="set-name-row">
            <label className="form-label">Name<CommitInput label="Set name" description="Rename this set. Enter applies; Escape cancels." onDraftChange={setPendingDraft} value={activeSet.name} maxLength={PROJECT_LIMITS.text.setName} onCommit={name => updateSet({ name })} /></label>
            <Menu label="Set actions" description="Duplicate, hold, split, reorder or delete this set." className="icon-button" align="end" items={setMenu}><MoreHorizontal size={16} /></Menu>
          </div>
          <div className="form-row">
            <NumberField onDraftChange={setPendingDraft} label="Counts" description="Set the number of counts in the move into this set." disabledReason="The opening set has no incoming move and always has zero counts." value={timing.counts} min={setCountLimits(index).min} max={setCountLimits(index).max} integer disabled={index === 0} onChange={value => { setPlaying(false); updateSet({ counts: Math.round(value) }); }} />
            <NumberField onDraftChange={setPendingDraft} label={project.tempoMap ? 'Base tempo · BPM' : 'Tempo · BPM'} description="Set the base tempo for the move into this set. Tempo-map ranges override it." disabledReason="The opening set has no incoming move; select a later set to edit tempo." value={timing.tempo} min={PROJECT_LIMITS.tempo.min} max={PROJECT_LIMITS.tempo.max} step={0.1} disabled={index === 0} onChange={value => updateSet({ tempo: value })} />
          </div>
          <label className="form-label">Transition
            <Tooltip name="Transition" description="Choose linear timing or an eased start and finish. Curved paths use Bézier parameter timing, so speed varies." disabledReason={index === 0 ? 'The opening set has no incoming move. Select a later set.' : undefined}>
              <select disabled={index === 0} value={timing.transition} onChange={e => updateSet({ transition: e.target.value as 'linear' | 'ease' })}><option value="linear">Linear timing</option><option value="ease">Ease in / out</option></select>
            </Tooltip>
          </label>
          <label className="form-label">Rehearsal notes<CommitInput label="Rehearsal notes" description="Add instructions for this set. Enter applies; Shift+Enter adds a line; Escape cancels." multiline allowEmpty onDraftChange={setPendingDraft} placeholder="What should the ensemble know?" value={activeSet.notes} maxLength={PROJECT_LIMITS.text.notes} onCommit={notes => updateSet({ notes })} /></label>
        </div>
      </Section>}

      {!planning && !previewing && <Section title="Move check" preference="inspectorChecksOpen" className="transition-check" controller={controller}><TransitionCheck controller={controller} /></Section>}
    </div>

    {controller.formationPreview && commit('formation', controller.formationResult, applyFormation, 'The preview matches the original positions.')}
    {controller.transformPreview && commit('transform', controller.transformResult, () => controller.dispatch('transform.apply'), 'Change the angle, scale, pivot or mirror to preview a new position.')}
    {controller.spacingPreview && commit('spacing', controller.spacingResult, () => controller.dispatch('spacing.apply'), 'The preview matches the original positions.')}
    {controller.coordinatePreview && commit('coordinates', controller.coordinateResult, () => controller.dispatch('coordinates.apply'), 'The preview matches the original positions.')}
  </aside>;
}
