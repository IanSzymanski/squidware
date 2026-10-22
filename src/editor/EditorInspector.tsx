import { nudgeLabel } from '../editIncrements';
import { DEFAULT_SNAPPING, gridInterval, snapDescription } from '../snapping';
import { type ReactNode, useMemo } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronRight, Copy, FlipHorizontal2, AlignHorizontalJustifyCenter, Move, RotateCcw, RotateCw, SlidersHorizontal, MapPin, Sparkles, Minus, Plus, Trash2, Users, X } from 'lucide-react';
import { coordinateDescription, performerMoveOutput, PROJECT_LIMITS, setCountLimits, setTiming } from '../domain';
import { NumberField } from '../components/NumberField';
import type { Preferences } from '../preferences';
import { Button, CommitInput } from './EditorControls';
import { HelpButton } from './ControlHelp';
import { Tooltip } from '../components/Tooltip';
import { FormationPanel } from './FormationPanel';
import { TransformPanel } from './TransformPanel';
import { SpacingPanel } from './SpacingPanel';
import { CoordinatePanel } from './CoordinatePanel';
import { TransitionCheck } from './TransitionCheck';
import type { EditorController } from './useEditorController';

type SectionPreference = Extract<keyof Preferences, `inspector${string}Open`>;

function InspectorSection({ title, preference, controller, children, className = '' }: {
  title: string; preference: SectionPreference; controller: EditorController; children: ReactNode; className?: string;
}) {
  return <details className={`inspector-section ${className}`} data-inspector-section={preference}
    open={controller.preferences.value[preference]}
    onToggle={event => {
      const open = event.currentTarget.open;
      if (open !== controller.preferences.value[preference]) controller.preferences.update({ [preference]: open });
    }}>
    <summary aria-label={`${title} section`}><ChevronRight size={14} aria-hidden="true" /><h3>{title}</h3></summary>
    <div className="inspector-section-content">{children}</div>
  </details>;
}

export function EditorInspector({ controller }: { controller: EditorController }) {
  const { project, projectEpoch, activeSet, selectedIds, selectedPerformers, index, readOnly,
    setPendingDraft,
    updateSet, setPlaying, duplicateSet, setDialog, reorderSet, applyFormation, selectSet, setSelectedIds,
  } = controller;
  const displayPositions = controller.coordinateResult?.positions ?? controller.spacingResult?.positions ?? controller.formationResult?.positions ?? controller.transformResult?.positions ?? activeSet.positions;
  const points = useMemo(() => selectedPerformers.map(performer => displayPositions[performer.id]), [selectedPerformers, displayPositions]);
  const bounds = useMemo(() => points.length ? {
    x: Math.min(...points.map(p => p.x)), y: Math.min(...points.map(p => p.y)),
    width: Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)),
    height: Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)),
    centerX: points.reduce((sum, point) => sum + point.x / points.length, 0),
    centerY: points.reduce((sum, point) => sum + point.y / points.length, 0),
  } : null, [points]);
  const format = (n: number) => Number(n.toFixed(2));
  const unavailable = controller.selectionPreview ? 'Apply or cancel the selection preview in Selection tools before editing positions.' : controller.coordinatePreview ? 'Apply or cancel coordinate entry before other position edits.' : controller.spacingPreview ? 'Apply or cancel the spacing preview before other position edits.' : controller.formationPreview ? 'Apply or cancel the formation preview before other position edits.' : controller.transformPreview ? 'Apply or cancel the transform preview before other position edits.' : controller.pendingDraft ? 'Finish or cancel the pending input first.' : readOnly ? 'Return to a set and pause playback to edit positions.' : 'Select performers first. Use Select all for the full ensemble.';
  const single = selectedPerformers.length === 1 ? selectedPerformers[0] : undefined;
  function reveal(preference: SectionPreference, selector: string) {
    controller.preferences.update({ [preference]: true });
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(selector);
      target?.scrollIntoView({ block: 'nearest' }); target?.focus();
    });
  }
  return <aside className="inspector">
    <div className="inspector-header"><SlidersHorizontal size={16} /><h2>Inspector</h2><span>SET {String(index + 1).padStart(2, '0')}</span></div>
    <div className="selection-bar" role="region" aria-label="Selection actions">
      <div className="selection-bar-heading"><strong className="selection-count" role="status">{selectedIds.length} selected</strong>
        {selectedIds.length > 0 ? <Button command="selection.clear" title="Clear selection" onClick={() => setSelectedIds([])}><X size={14} /></Button>
          : <HelpButton command="selection.all" title="Select all for editing" disabled={!project.performers.length} disabledReason="Add performers to the cast first." onClick={() => setSelectedIds(project.performers.map(p => p.id))}><Users size={13} />Select all</HelpButton>}
      </div>
      <div className="selection-bounds">{bounds ? <>
        <span>{controller.transformPreview || controller.formationPreview || controller.spacingPreview || controller.coordinatePreview ? 'Preview' : 'Set ' + (index + 1)} · {single ? single.label : `Center ${format(bounds.centerX)}, ${format(bounds.centerY)} yd`}</span>
        <span>{single ? `X ${format(bounds.x)} · Y ${format(bounds.y)} yd` : `Bounds ${format(bounds.width)} × ${format(bounds.height)} yd`}</span>
      </> : <span>Select dots or a section to edit.</span>}</div>
      <div className="selection-actions" role="group" aria-label="Edit selected performers">
        <HelpButton title="Move selection" description="Open position controls for the selected performers on this set." disabled={!points.length || readOnly} disabledReason={unavailable} onClick={() => reveal('inspectorSelectionOpen', '.move-selection-left')}><Move size={14} />Move</HelpButton>
        <HelpButton command="transform.preview" title="Rotate selection" description="Preview exact rotation and scaling with numeric controls, field handles and a chosen pivot." disabled={!points.length || readOnly || controller.pendingDraft} disabledReason={unavailable} onClick={() => controller.openTransform()}><RotateCw size={14} />Rotate</HelpButton>
        <HelpButton title="Shape selection" description="Choose a formation and its dimensions for the explicit selection." disabled={!points.length || readOnly} disabledReason={unavailable} onClick={() => { controller.preferences.update({ inspectorFormationOpen: true }); controller.dispatch('formation.preview', {}); }}><Sparkles size={14} />Shape</HelpButton>
        <HelpButton command="transform.preview" title="Mirror selection" description="Preview a mirror across the 50 or a front-to-back flip. Apply or Cancel before editing other positions." disabled={!points.length || readOnly || controller.pendingDraft} disabledReason={unavailable} onClick={() => controller.openTransform('across-50')}><FlipHorizontal2 size={14} />Mirror</HelpButton>
        <HelpButton command="spacing.preview" title="Align selection" description="Preview alignment, distribution or exact intervals for the selected performers." disabled={points.length < 2 || readOnly || controller.pendingDraft} disabledReason={points.length < 2 ? 'Select at least two performers to align or space.' : unavailable} onClick={() => controller.dispatch('spacing.preview')}><AlignHorizontalJustifyCenter size={14} />Align</HelpButton>
        <HelpButton command="coordinates.preview" title="Enter coordinates" disabled={!points.length || readOnly || controller.pendingDraft} disabledReason={unavailable} onClick={() => controller.dispatch('coordinates.preview', {})}><MapPin size={14} />Place</HelpButton>
      </div>
      {controller.formationPreview && <div className="transform-commit-actions" role="group" aria-label="Commit formation preview">
        <HelpButton command="formation.apply" title="Apply formation" className="button primary apply-formation" disabled={controller.pendingDraft || !!controller.formationResult?.error || !controller.formationResult?.changed} disabledReason={controller.formationResult?.error || (controller.pendingDraft ? 'Finish or cancel incomplete inputs.' : 'The preview matches the original positions.')} onClick={applyFormation}>Apply formation</HelpButton>
        <HelpButton command="formation.cancel" title="Cancel formation" className="button subtle" onClick={() => controller.dispatch('formation.cancel')}>Cancel</HelpButton>
      </div>}
      {controller.transformPreview && <div className="transform-commit-actions" role="group" aria-label="Commit transform preview">
        <HelpButton command="transform.apply" title="Apply transform" className="button primary" disabled={controller.pendingDraft || !!controller.transformResult?.error || !controller.transformResult?.changed} disabledReason={controller.transformResult?.error || (controller.pendingDraft ? 'Finish or cancel incomplete inputs.' : 'Change the angle, scale, pivot or mirror to preview a new position.')} onClick={() => controller.dispatch('transform.apply')}>Apply transform</HelpButton>
        <HelpButton command="transform.cancel" title="Cancel transform" className="button subtle" onClick={() => controller.dispatch('transform.cancel')}>Cancel</HelpButton>
      </div>}
      {controller.spacingPreview && <div className="transform-commit-actions" role="group" aria-label="Commit spacing preview">
        <HelpButton command="spacing.apply" title="Apply spacing" className="button primary" disabled={controller.pendingDraft || !!controller.spacingResult?.error || !controller.spacingResult?.changed} disabledReason={controller.spacingResult?.error || (controller.pendingDraft ? 'Finish or cancel incomplete inputs.' : 'The preview matches the original positions.')} onClick={() => controller.dispatch('spacing.apply')}>Apply spacing</HelpButton>
        <HelpButton command="spacing.cancel" title="Cancel spacing" className="button subtle" onClick={() => controller.dispatch('spacing.cancel')}>Cancel</HelpButton>
      </div>}
      {controller.coordinatePreview && <div className="transform-commit-actions" role="group" aria-label="Commit coordinate preview">
        <HelpButton command="coordinates.apply" title="Apply coordinates" className="button primary" disabled={controller.pendingDraft || !!controller.coordinateResult?.error || !controller.coordinateResult?.changed} disabledReason={controller.coordinateResult?.error || (controller.pendingDraft ? 'Finish or cancel incomplete inputs.' : 'The preview matches the original positions.')} onClick={() => controller.dispatch('coordinates.apply')}>Apply coordinates</HelpButton>
        <HelpButton command="coordinates.cancel" title="Cancel coordinate entry" className="button subtle" onClick={() => controller.dispatch('coordinates.cancel')}>Cancel</HelpButton>
      </div>}
      {readOnly && !controller.selectionPreview && !controller.transformPreview && !controller.formationPreview && !controller.spacingPreview && !controller.coordinatePreview && <HelpButton command="set.select" showShortcut={false} title="Return to this set to edit" className="return-to-set" onClick={() => selectSet(index)}>Preview · return to set {index + 1} to edit<ArrowRight size={13} /></HelpButton>}
    </div>
    <div className="inspector-scroll">
      {controller.transformPreview && <TransformPanel controller={controller} />}
      {controller.spacingPreview && <SpacingPanel controller={controller} />}
      {controller.coordinatePreview && <CoordinatePanel controller={controller} />}
      {points.length > 0 && <InspectorSection title={single ? 'Performer position' : 'Group selection'} preference="inspectorSelectionOpen" className="selection-section" controller={controller}>
        {single && <div key={`${projectEpoch}:${activeSet.id}:${single.id}`} className="selected-performer">
          <strong>{single.label}</strong><span>{single.name || project.sections.find(s => s.id === single.sectionId)?.name}</span>
          <p className="selection-coordinate">{coordinateDescription(activeSet.positions[single.id], project.field, controller.coordinateFormat)}</p>
          <p className="selection-move">{performerMoveOutput(project, index, single.id, controller.coordinateFormat).description}</p>
          <div className="form-row exact-position">
            <NumberField onDraftChange={setPendingDraft} label="X · yards from left" description="Set this performer’s horizontal distance in yards from the left edge." disabledReason={unavailable} value={Number(activeSet.positions[single.id].x.toFixed(3))} min={0} max={project.field.width} step={gridInterval(project.snapping ?? DEFAULT_SNAPPING)} disabled={readOnly} onChange={value => controller.dispatch('positions.place', { index, id: single.id, axis: 'x', value })} />
            <NumberField onDraftChange={setPendingDraft} label="Y · yards from back" description="Set this performer’s distance in yards from the back sideline." disabledReason={unavailable} value={Number(activeSet.positions[single.id].y.toFixed(3))} min={0} max={project.field.height} step={gridInterval(project.snapping ?? DEFAULT_SNAPPING)} disabled={readOnly} onChange={value => controller.dispatch('positions.place', { index, id: single.id, axis: 'y', value })} />
          </div>
        </div>}
        <p className="section-description">Move {selectedIds.length === 1 ? 'performer' : 'group'} · request {nudgeLabel(controller.preferences.value, project)}</p>
        <div className="transform-buttons move-buttons">
          {([{ label: 'left', icon: ArrowLeft, key: 'ArrowLeft' },
            { label: 'right', icon: ArrowRight, key: 'ArrowRight' },
            { label: 'back', icon: ArrowUp, key: 'ArrowUp' },
            { label: 'front', icon: ArrowDown, key: 'ArrowDown' }] as const).map(({ label, icon: Icon, key }) =>
            <Button key={label} command="selection.nudge" showShortcut={false} className={`move-selection-${label}`} title={`Move selection ${label}`} description={`Request ${nudgeLabel(controller.preferences.value, project)} toward field ${label}; arrow icons follow the displayed orientation. ${controller.snap ? snapDescription(project.snapping ?? DEFAULT_SNAPPING) : 'Snapping is off'}. Targets and field boundaries determine the accepted distance. Shift-click requests ${nudgeLabel(controller.preferences.value, project, true)}.`} disabled={readOnly || controller.pendingDraft} disabledReason={unavailable} onClick={event => controller.dispatch('selection.nudge', { key, fast: event.shiftKey, fieldRelative: true })}><Icon size={16} style={{ transform: controller.preferences.value.fieldOrientation === 'audience-top' ? 'rotate(180deg)' : undefined }} /></Button>)}
        </div>
        {points.length > 1 && <><p className="section-description">Exact transform presets · preview before Apply</p><div className="transform-buttons">
          <Button command="selection.increment" title={`Rotate selection ${controller.preferences.value.rotationStep}° counterclockwise`} description={`Preview a ${controller.preferences.value.rotationStep}-degree counterclockwise rotation. Adjust its pivot, then Apply or Cancel.`} disabledReason={unavailable} disabled={readOnly || controller.pendingDraft} onClick={() => controller.dispatch('selection.increment', { operation: 'rotate', direction: -1 })}><RotateCcw size={16} /></Button>
          <Button className="rotate-selection-clockwise" command="selection.increment" title={`Rotate selection ${controller.preferences.value.rotationStep}° clockwise`} description={`Preview a ${controller.preferences.value.rotationStep}-degree clockwise rotation. Adjust its pivot, then Apply or Cancel.`} disabledReason={unavailable} disabled={readOnly || controller.pendingDraft} onClick={() => controller.dispatch('selection.increment', { operation: 'rotate', direction: 1 })}><RotateCw size={16} /></Button>
          <Button command="selection.increment" title={`Compress selection by ${controller.preferences.value.scaleStep}%`} description={`Preview ${100-controller.preferences.value.scaleStep}% scale around the chosen pivot, then Apply or Cancel.`} disabledReason={unavailable} disabled={readOnly || controller.pendingDraft} onClick={() => controller.dispatch('selection.increment', { operation: 'scale', direction: -1 })}><Minus size={16} /></Button>
          <Button command="selection.increment" title={`Expand selection by ${controller.preferences.value.scaleStep}%`} description={`Preview ${100+controller.preferences.value.scaleStep}% scale around the chosen pivot, then Apply or Cancel.`} disabledReason={unavailable} disabled={readOnly || controller.pendingDraft} onClick={() => controller.dispatch('selection.increment', { operation: 'scale', direction: 1 })}><Plus size={16} /></Button>
        </div></>}
        <p className="microcopy">{snapDescription(project.snapping ?? DEFAULT_SNAPPING, controller.snap)}. Alt + arrows requests {nudgeLabel(controller.preferences.value, project)}. Shift + Alt or Shift-click requests {nudgeLabel(controller.preferences.value, project, true)}.</p>
      </InspectorSection>}
<InspectorSection title="Formation tools" preference="inspectorFormationOpen" className="formation-section" controller={controller}><FormationPanel controller={controller} /></InspectorSection>
<InspectorSection title="Set properties" preference="inspectorSetOpen" controller={controller}><div key={`${projectEpoch}-${activeSet.id}`}><div className="section-title"><span>Current set</span><div><Button command="set.duplicate" title="Duplicate current set" disabled={project.sets.length >= PROJECT_LIMITS.sets} disabledReason={`A production can contain at most ${PROJECT_LIMITS.sets} sets.`} onClick={duplicateSet}><Copy size={14} /></Button><Button command="set.remove" title="Delete current set" disabledReason="Keep at least one set in the production." disabled={project.sets.length <= 1} onClick={() => setDialog('remove-set')}><Trash2 size={14} /></Button></div></div><label className="form-label">Set name<CommitInput label="Set name" description="Rename this set. Enter applies; Escape cancels." onDraftChange={setPendingDraft} value={activeSet.name} maxLength={PROJECT_LIMITS.text.setName} onCommit={name => updateSet({ name })} /></label><div className="form-row"><NumberField onDraftChange={setPendingDraft} label="Counts" description="Set the number of counts in the move into this set." disabledReason="The opening set has no incoming move and always has zero counts." value={setTiming(project, index).counts} min={setCountLimits(index).min} max={setCountLimits(index).max} integer disabled={index === 0} onChange={value => { setPlaying(false); updateSet({ counts: Math.round(value) }); }} /><NumberField onDraftChange={setPendingDraft} label="Tempo · BPM" description="Set the playback tempo for the move into this set." disabledReason="The opening set has no incoming move; select a later set to edit tempo." value={setTiming(project, index).tempo} min={PROJECT_LIMITS.tempo.min} max={PROJECT_LIMITS.tempo.max} step={0.1} disabled={index === 0} onChange={value => updateSet({ tempo: value })} /></div><p className="microcopy">{index === 0 ? 'The opening set has zero move counts; its stored tempo does not affect playback.' : 'Counts and tempo describe the move into this set.'}</p><label className="form-label">Transition<Tooltip name="Transition" description="Choose constant speed or an eased start and finish for the move into this set." disabledReason={index === 0 ? 'The opening set has no incoming move. Select a later set.' : undefined}><select disabled={index === 0} value={setTiming(project, index).transition} onChange={e => updateSet({ transition: e.target.value as 'linear' | 'ease' })}><option value="linear">Constant speed</option><option value="ease">Ease in / out</option></select></Tooltip></label><label className="form-label">Rehearsal notes<CommitInput label="Rehearsal notes" description="Add instructions for this set. Enter applies; Shift+Enter adds a line; Escape cancels." multiline allowEmpty onDraftChange={setPendingDraft} placeholder="What should the ensemble know?" value={activeSet.notes} maxLength={PROJECT_LIMITS.text.notes} onCommit={notes => updateSet({ notes })} /></label><div className="reorder-controls"><span>Set order</span><Button command="set.reorder" title="Move set earlier" disabledReason="This is already the first set." disabled={index === 0} onClick={() => reorderSet(-1)}><ArrowUp size={14} /></Button><Button command="set.reorder" title="Move set later" disabledReason="This is already the last set." disabled={index === project.sets.length - 1} onClick={() => reorderSet(1)}><ArrowDown size={14} /></Button></div></div></InspectorSection>
<InspectorSection title="Transition check" preference="inspectorChecksOpen" className="transition-check" controller={controller}><TransitionCheck controller={controller} /></InspectorSection>
    </div>
  </aside>;
}
