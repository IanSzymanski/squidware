import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, ChevronUp, Copy, Minus, MoreHorizontal, Pause, Plus, RotateCcw, RotateCw, Scissors, Sparkles, Trash2 } from 'lucide-react';
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
import { SectionSelectionButton } from '../editor/SelectionTools';
import { TransformPanel } from '../editor/TransformPanel';
import { SpacingPanel } from '../editor/SpacingPanel';
import { CoordinatePanel } from '../editor/CoordinatePanel';
import { PathOperationsPanel } from '../editor/PathOperationsPanel';
import { SharedRoutesPanel } from '../editor/SharedRoutesPanel';
import { MovementSchedulePanel } from '../editor/MovementSchedulePanel';
import { TransitionCheck } from '../editor/TransitionCheck';
import { useTransitionAnalysis } from '../editor/useTransitionAnalysis';
import { SET_REORDER_POLICY } from '../editor/setList';
import { commandRegistry } from '../editor/commands';
import { commandUnavailable } from '../editor/paletteCommands';
import type { EditorController } from '../editor/useEditorController';
import { Menu, type MenuEntry } from '../ui/Menu';
import { nudgeText } from './units';
import { useScrollCue } from './useScrollCue';
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

/** The move check's result beside its heading. It subscribes on its own, so a worker reply redraws the badge and not the Inspector's fields. */
function MoveCheckBadge({ controller }: { controller: EditorController }) {
  const check = useTransitionAnalysis(controller.project, controller.index, controller.projectEpoch);
  return check.status === 'pending' ? <span className="badge">…</span> : check.status === 'error' ? <span className="badge warning">!</span> : check.issues.length ? <span className="badge warning">{check.issues.length}</span> : <span className="badge ok"><Check size={11} /></span>;
}

/** Properties of whatever the writer is working on: the selection when there is one, and always the set. */
export function Inspector({ controller }: { controller: EditorController }) {
  const { project, projectEpoch, activeSet, selectedIds, selectedPerformers, index, readOnly, setPendingDraft, updateSet, setPlaying, setDialog, reorderSet, setSelectedIds } = controller;
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
  const stepYards = 5 / (project.snapping ?? DEFAULT_SNAPPING).steps;
  /** A length in the production's steps on a football field, or in the surface's own unit. */
  const inSteps = (yards: number) => Number((isCustomSurface(project.field) ? toUnit(yards) : yards / stepYards).toFixed(1));
  // How the selection travels into this set: counts, the longest path and the largest step.
  const travel = useMemo(() => {
    if (index === 0 || !selectedPerformers.length) return null;
    let counts = 0, distance = 0, step: number | null = null;
    for (const performer of selectedPerformers) {
      try {
        const move = performerMoveOutput(project, index, performer.id, controller.coordinateFormat);
        counts = move.counts; distance = Math.max(distance, move.distanceYards);
        if (move.averageStepsPerFive !== null) step = step === null ? move.averageStepsPerFive : Math.min(step, move.averageStepsPerFive);
      } catch { /* A performer without a position on this set has no travel to report. */ }
    }
    return counts ? { counts, distance, step } : null;
  }, [project, index, selectedPerformers, controller.coordinateFormat]);

  const scroller = useRef<HTMLDivElement>(null);
  useScrollCue(scroller, 'y');
  // Sections are for making a selection. Once there is one they fold to a row of colors, unless the writer opens them.
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const nothingSelected = selectedIds.length === 0;
  useEffect(() => { if (nothingSelected) setSectionsOpen(false); }, [nothingSelected]);
  const compactSections = !nothingSelected && !sectionsOpen;
  const where = bounds ? coordinateDescription(selectedPerformers.length === 1 ? displayPositions[selectedPerformers[0].id] : { x: bounds.centerX, y: bounds.centerY }, project.field, controller.coordinateFormat).split('; ') : [];
  // "Side 2: 4 steps outside the 40" reads better with the side as the caption.
  const side = where.length ? /^(Side [12]): (.+)$/.exec(where[0]) : null;

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
        <div className="selection-summary">
          <strong className="selection-count" role="status">{selectedIds.length} selected</strong>
          <span className="selection-sections">{!selectedIds.length ? `${project.performers.length} ${project.performers.length === 1 ? 'performer' : 'performers'} in the cast` : single ? `${single.label}${single.name ? ` · ${single.name}` : ''}` : sections.slice(0, 3).map(section => section.name).join(', ')}{!single && sections.length > 3 ? ` +${sections.length - 3}` : ''}</span>
        </div>
        {selectedIds.length > 0
          ? <HelpButton command="selection.clear" title="Clear selection" className="button small" onClick={() => setSelectedIds([])}>Clear</HelpButton>
          : <HelpButton command="selection.all" title="Select all for editing" className="button small" disabled={!project.performers.length} disabledReason="Add performers to the cast first." onClick={() => setSelectedIds(project.performers.map(p => p.id))}>Select all</HelpButton>}
      </div>
      {!previewing && project.sections.length > 0 && <div className={`section-legend${compactSections ? ' section-legend--compact' : ''}`}>
        <div className="field-legend section-chips" role="group" aria-label="Select a section">
          {project.sections.map(section => <SectionSelectionButton section={section} controller={controller} key={section.id} />)}
        </div>
        {selectedIds.length > 0 && <HelpButton pointerPassThrough title={compactSections ? 'Show section names' : 'Hide section names'} description="With a selection, the sections fold to their colors so the selection and the set have the panel. Each color still selects its section; Shift adds." className="icon-button section-legend-toggle" aria-expanded={!compactSections} onClick={() => setSectionsOpen(!sectionsOpen)}>{compactSections ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</HelpButton>}
      </div>}
    </div>

    <div className="inspector-scroll" ref={scroller}>
      {controller.formationPreview && <div className="inspector-tool"><FormationPanel controller={controller} /></div>}
      {controller.transformPreview && <div className="inspector-tool"><TransformPanel controller={controller} /></div>}
      {controller.spacingPreview && <div className="inspector-tool"><SpacingPanel controller={controller} /></div>}
      {controller.coordinatePreview && <div className="inspector-tool"><CoordinatePanel controller={controller} /></div>}

      {!previewing && <div key={`${projectEpoch}-${activeSet.id}-timing`} className="set-timing" role="group" aria-label={`Set ${index + 1} timing`}>
        <span className="set-timing-title">Set {index + 1}</span>
        <span className="set-timing-field" data-unit="counts"><NumberField hideLabel onDraftChange={setPendingDraft} label="Counts" description="Set the number of counts in the move into this set." disabledReason="The opening set has no incoming move and always has zero counts." value={timing.counts} min={setCountLimits(index).min} max={setCountLimits(index).max} integer disabled={index === 0} onChange={value => { setPlaying(false); updateSet({ counts: Math.round(value) }); }} /></span>
        <span className="set-timing-field" data-unit="BPM"><NumberField hideLabel onDraftChange={setPendingDraft} label={project.tempoMap ? 'Base tempo · BPM' : 'Tempo · BPM'} description="Set the base tempo for the move into this set. Tempo-map ranges override it." disabledReason="The opening set has no incoming move; select a later set to edit tempo." value={timing.tempo} min={PROJECT_LIMITS.tempo.min} max={PROJECT_LIMITS.tempo.max} step={0.1} disabled={index === 0} onChange={value => updateSet({ tempo: value })} /></span>
      </div>}

      {points.length > 0 && bounds && !previewing && <div hidden={planning || three}>
        <Section title={single ? 'Position' : 'Selection'} preference="inspectorSelectionOpen" className="selection-section" controller={controller}>
          <div className="selection-bounds">
            <p className="selection-coordinate">
              {(!single || side) && <span className="selection-coordinate-label">{[!single && 'Center', side?.[1]].filter(Boolean).join(' · ')}</span>}
              {(side ? [side[2].charAt(0).toUpperCase() + side[2].slice(1), ...where.slice(1).map(line => line.charAt(0).toUpperCase() + line.slice(1))] : where).map((line, i) => <span key={i}>{line}</span>)}
            </p>
            <dl className="selection-stats">
              {!single && <div><dt>Size</dt><dd>{inSteps(bounds.width)} × {inSteps(bounds.height)}<small>{custom ? unit : 'steps'}</small></dd></div>}
              {travel && <>
                <div><dt>Move in</dt><dd>{travel.counts}<small>counts</small></dd></div>
                <div><dt>{single ? 'Travel' : 'Longest path'}</dt><dd>{inSteps(travel.distance)}<small>{custom ? unit : 'steps'}</small></dd></div>
                {travel.step !== null && <div><dt>{single ? 'Step size' : 'Biggest step'}</dt><dd>{travel.step.toFixed(1)}-to-5</dd></div>}
              </>}
              {!travel && index === 0 && <div><dt>Move in</dt><dd className="selection-stat-text">Opening set</dd></div>}
            </dl>
          </div>
          <div className="adjust-row">
            <div className="adjust-group"><span className="adjust-label">Move<small>{nudgeText(controller.preferences.value, project)}</small></span>
            <div className="transform-buttons move-buttons" role="group" aria-label={`Move ${selectedIds.length === 1 ? 'performer' : 'group'}`}>
              {([{ label: 'left', icon: ArrowLeft, key: 'ArrowLeft' }, { label: 'back', icon: ArrowUp, key: 'ArrowUp' }, { label: 'front', icon: ArrowDown, key: 'ArrowDown' }, { label: 'right', icon: ArrowRight, key: 'ArrowRight' }] as const).map(({ label, icon: Icon, key }) =>
                <HelpButton key={label} command="selection.nudge" className={`icon-button move-selection-${label}`} title={`Move selection ${label}`} description={`Request ${nudgeLabel(controller.preferences.value, project)} toward field ${label}; arrow icons follow the displayed orientation. ${controller.snap ? snapDescription(project.snapping ?? DEFAULT_SNAPPING) : 'Snapping is off'}. Targets and field boundaries determine the accepted distance. Shift-click requests ${nudgeLabel(controller.preferences.value, project, true)}.`} disabled={readOnly || controller.pendingDraft} disabledReason={unavailable} onClick={event => controller.dispatch('selection.nudge', { key, fast: event.shiftKey, fieldRelative: true })}><Icon size={14} style={{ transform: controller.preferences.value.fieldOrientation === 'audience-top' ? 'rotate(180deg)' : undefined }} /></HelpButton>)}
            </div></div>
            {points.length > 1 && <div className="adjust-pair" role="group" aria-label="Rotate and scale in steps">
              <div className="adjust-group"><span className="adjust-label">Rotate<small>{controller.preferences.value.rotationStep}°</small></span><div className="transform-buttons">
              <HelpButton command="selection.increment" className="icon-button" title={`Rotate selection ${controller.preferences.value.rotationStep}° counterclockwise`} description={`Preview a ${controller.preferences.value.rotationStep}-degree counterclockwise rotation. Adjust its pivot, then Apply or Cancel.`} disabledReason={unavailable} disabled={readOnly || controller.pendingDraft} onClick={() => controller.dispatch('selection.increment', { operation: 'rotate', direction: -1 })}><RotateCcw size={14} /></HelpButton>
              <HelpButton className="icon-button rotate-selection-clockwise" command="selection.increment" title={`Rotate selection ${controller.preferences.value.rotationStep}° clockwise`} description={`Preview a ${controller.preferences.value.rotationStep}-degree clockwise rotation. Adjust its pivot, then Apply or Cancel.`} disabledReason={unavailable} disabled={readOnly || controller.pendingDraft} onClick={() => controller.dispatch('selection.increment', { operation: 'rotate', direction: 1 })}><RotateCw size={14} /></HelpButton>
              </div></div>
              <div className="adjust-group"><span className="adjust-label">Scale<small>{controller.preferences.value.scaleStep}%</small></span><div className="transform-buttons">
              <HelpButton command="selection.increment" className="icon-button" title={`Compress selection by ${controller.preferences.value.scaleStep}%`} description={`Preview ${100 - controller.preferences.value.scaleStep}% scale around the chosen pivot, then Apply or Cancel.`} disabledReason={unavailable} disabled={readOnly || controller.pendingDraft} onClick={() => controller.dispatch('selection.increment', { operation: 'scale', direction: -1 })}><Minus size={14} /></HelpButton>
              <HelpButton command="selection.increment" className="icon-button" title={`Expand selection by ${controller.preferences.value.scaleStep}%`} description={`Preview ${100 + controller.preferences.value.scaleStep}% scale around the chosen pivot, then Apply or Cancel.`} disabledReason={unavailable} disabled={readOnly || controller.pendingDraft} onClick={() => controller.dispatch('selection.increment', { operation: 'scale', direction: 1 })}><Plus size={14} /></HelpButton>
              </div></div>
            </div>}
          </div>
          {single && <details key={`${projectEpoch}:${activeSet.id}:${single.id}`} className="selected-performer performer-facing">
            <summary>Exact position</summary>
            <div className="form-row exact-position">
              <NumberField onDraftChange={setPendingDraft} label={custom ? `X · ${unit} from left` : 'X · yards from left'} description="Set this performer’s horizontal distance from the left edge." disabledReason={unavailable} value={Number(toUnit(activeSet.positions[single.id].x).toFixed(3))} min={0} max={toUnit(project.field.width)} step={toUnit(gridInterval(project.snapping ?? DEFAULT_SNAPPING))} disabled={readOnly} onChange={value => controller.dispatch('positions.place', { index, id: single.id, axis: 'x', value: unitInYards(value, unit) })} />
              <NumberField onDraftChange={setPendingDraft} label={custom ? `Y · ${unit} from back` : 'Y · yards from back'} description={custom ? 'Set this performer’s distance from the back edge.' : 'Set this performer’s distance in yards from the back sideline.'} disabledReason={unavailable} value={Number(toUnit(activeSet.positions[single.id].y).toFixed(3))} min={0} max={toUnit(project.field.height)} step={toUnit(gridInterval(project.snapping ?? DEFAULT_SNAPPING))} disabled={readOnly} onChange={value => controller.dispatch('positions.place', { index, id: single.id, axis: 'y', value: unitInYards(value, unit) })} />
            </div>
          </details>}
          <details className="performer-facing">
            <summary>Facing</summary>
            <FacingControls key={JSON.stringify([projectEpoch, activeSet.id, selectedIds])} controller={controller} unavailable={unavailable} />
          </details>
        </Section>
      </div>}

      {!previewing && <Section title={`Set ${index + 1} details`} preference="inspectorSetOpen" controller={controller} className="set-section">
        <div key={`${projectEpoch}-${activeSet.id}`} className="set-fields">
          <div className="set-name-row">
            <label className="form-label">Name<CommitInput label="Set name" description="Rename this set. Enter applies; Escape cancels." onDraftChange={setPendingDraft} value={activeSet.name} maxLength={PROJECT_LIMITS.text.setName} onCommit={name => updateSet({ name })} /></label>
            <Menu label="Set actions" description="Duplicate, hold, split, reorder or delete this set." className="icon-button" align="end" items={setMenu}><MoreHorizontal size={16} /></Menu>
          </div>
          <label className="form-label">Transition
            <Tooltip name="Transition" description="Choose linear timing or an eased start and finish. Curved paths use Bézier parameter timing, so speed varies." disabledReason={index === 0 ? 'The opening set has no incoming move. Select a later set.' : undefined}>
              <select disabled={index === 0} value={timing.transition} onChange={e => updateSet({ transition: e.target.value as 'linear' | 'ease' })}><option value="linear">Linear timing</option><option value="ease">Ease in / out</option></select>
            </Tooltip>
          </label>
          {!!activeSet.liveFormations?.length && !planning && !three && <div className="inspector-live"><FormationPanel controller={controller} /></div>}
          <label className="form-label">Rehearsal notes<CommitInput label="Rehearsal notes" description="Add instructions for this set. Enter applies; Shift+Enter adds a line; Escape cancels." multiline allowEmpty onDraftChange={setPendingDraft} placeholder="What should the ensemble know?" value={activeSet.notes} maxLength={PROJECT_LIMITS.text.notes} onCommit={notes => updateSet({ notes })} /></label>
        </div>
      </Section>}

      {!planning && !previewing && <Section title="Move check" preference="inspectorChecksOpen" className="transition-check" controller={controller}
        aside={index === 0 ? undefined : <MoveCheckBadge controller={controller} />}><TransitionCheck controller={controller} /></Section>}
    </div>

  </aside>;
}
