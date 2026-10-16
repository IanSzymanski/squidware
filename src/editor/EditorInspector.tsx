import { type ReactNode, useMemo } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, CheckCheck, ChevronRight, Copy, FlipHorizontal2, AlignHorizontalJustifyCenter, Move, RotateCcw, RotateCw, SlidersHorizontal, Sparkles, Minus, Plus, ShieldCheck, Trash2, TriangleAlert, Users, X } from 'lucide-react';
import { coordinateDescription, performerMoveOutput, PROJECT_LIMITS, setCountLimits, setTiming } from '../domain';
import { NumberField } from '../components/NumberField';
import type { Preferences } from '../preferences';
import { Button, CommitInput } from './EditorControls';
import { HelpButton } from './ControlHelp';
import { Tooltip } from '../components/Tooltip';
import { formations } from './formations';
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
  const { project, projectEpoch, activeSet, selectedIds, selectedPerformers, index, readOnly, issues,
    formation, setFormation, formationWidth, setFormationWidth, formationHeight, setFormationHeight,
    formationRotation, setFormationRotation, formationColumns, setFormationColumns, setPendingDraft,
    updateSet, setPlaying, duplicateSet, setDialog, reorderSet, applyFormation, selectSet, setSelectedIds,
    movePerformers, transform, setShowPaths, setWorkspace } = controller;
  const points = useMemo(() => selectedPerformers.map(performer => activeSet.positions[performer.id]), [selectedPerformers, activeSet.positions]);
  const bounds = useMemo(() => points.length ? {
    x: Math.min(...points.map(p => p.x)), y: Math.min(...points.map(p => p.y)),
    width: Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)),
    height: Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)),
    centerX: points.reduce((sum, point) => sum + point.x / points.length, 0),
    centerY: points.reduce((sum, point) => sum + point.y / points.length, 0),
  } : null, [points]);
  const format = (n: number) => Number(n.toFixed(2));
  const unavailable = readOnly ? 'Return to a set and pause playback to edit positions.' : 'Select performers first. Use Select all for the full ensemble.';
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
        <span>Set {index + 1} · {single ? single.label : `Center ${format(bounds.centerX)}, ${format(bounds.centerY)} yd`}</span>
        <span>{single ? `X ${format(bounds.x)} · Y ${format(bounds.y)} yd` : `Bounds ${format(bounds.width)} × ${format(bounds.height)} yd`}</span>
      </> : <span>Select dots or a section to edit.</span>}</div>
      <div className="selection-actions" role="group" aria-label="Edit selected performers">
        <HelpButton title="Move selection" description="Open position controls for the selected performers on this set." disabled={!points.length || readOnly} disabledReason={unavailable} onClick={() => reveal('inspectorSelectionOpen', '.move-selection-left')}><Move size={14} />Move</HelpButton>
        <HelpButton title="Rotate selection" description="Open rotation controls around the selection center." disabled={points.length < 2 || readOnly} disabledReason={readOnly ? unavailable : points.length === 1 ? 'Select at least two performers to rotate a group.' : unavailable} onClick={() => reveal('inspectorSelectionOpen', '.rotate-selection-clockwise')}><RotateCw size={14} />Rotate</HelpButton>
        <HelpButton title="Shape selection" description="Choose a formation and its dimensions for the explicit selection." disabled={!points.length || readOnly} disabledReason={unavailable} onClick={() => reveal('inspectorFormationOpen', '.formation-grid button')}><Sparkles size={14} />Shape</HelpButton>
        <HelpButton title="Mirror selection" description="Reflect a selected group." disabled disabledReason={!points.length || readOnly ? unavailable : 'Mirror tools are not available yet.'}><FlipHorizontal2 size={14} />Mirror</HelpButton>
        <HelpButton title="Align selection" description="Align selected performers along an axis." disabled disabledReason={!points.length || readOnly ? unavailable : 'Alignment tools are not available yet.'}><AlignHorizontalJustifyCenter size={14} />Align</HelpButton>
      </div>
      {readOnly && <HelpButton command="set.select" showShortcut={false} title="Return to this set to edit" className="return-to-set" onClick={() => selectSet(index)}>Preview · return to set {index + 1} to edit<ArrowRight size={13} /></HelpButton>}
    </div>
    <div className="inspector-scroll">
      {points.length > 0 && <InspectorSection title={single ? 'Performer position' : 'Group selection'} preference="inspectorSelectionOpen" className="selection-section" controller={controller}>
        {single && <div key={`${projectEpoch}:${activeSet.id}:${single.id}`} className="selected-performer">
          <strong>{single.label}</strong><span>{single.name || project.sections.find(s => s.id === single.sectionId)?.name}</span>
          <p className="selection-coordinate">{coordinateDescription(activeSet.positions[single.id], project.field, controller.coordinateFormat)}</p>
          <p className="selection-move">{performerMoveOutput(project, index, single.id, controller.coordinateFormat).description}</p>
          <div className="form-row exact-position">
            <NumberField onDraftChange={setPendingDraft} label="X · yards from left" description="Set this performer’s horizontal distance in yards from the left edge." disabledReason={unavailable} value={Number(activeSet.positions[single.id].x.toFixed(3))} min={0} max={project.field.width} step={0.625} disabled={readOnly} onChange={x => movePerformers({ [single.id]: { ...activeSet.positions[single.id], x } })} />
            <NumberField onDraftChange={setPendingDraft} label="Y · yards from back" description="Set this performer’s distance in yards from the back sideline." disabledReason={unavailable} value={Number(activeSet.positions[single.id].y.toFixed(3))} min={0} max={project.field.height} step={0.625} disabled={readOnly} onChange={y => movePerformers({ [single.id]: { ...activeSet.positions[single.id], y } })} />
          </div>
        </div>}
        <p className="section-description">Move {selectedIds.length === 1 ? 'performer' : 'group'} · {controller.preferences.value.nudgeStep} yd</p>
        <div className="transform-buttons move-buttons">
          {([{ label: 'left', icon: ArrowLeft, options: { dx: -controller.preferences.value.nudgeStep } },
            { label: 'right', icon: ArrowRight, options: { dx: controller.preferences.value.nudgeStep } },
            { label: 'back', icon: ArrowUp, options: { dy: -controller.preferences.value.nudgeStep } },
            { label: 'front', icon: ArrowDown, options: { dy: controller.preferences.value.nudgeStep } }] as const).map(({ label, icon: Icon, options }) =>
            <Button key={label} command="selection.transform" showShortcut={false} className={`move-selection-${label}`} title={`Move selection ${label}`} description={`Move selected performers ${controller.preferences.value.nudgeStep} yards toward the ${label}; a field edge stops the group together.`} disabled={readOnly} disabledReason={unavailable} onClick={() => transform(options)}><Icon size={16} /></Button>)}
        </div>
        {points.length > 1 && <><p className="section-description">Rotate and scale around the group center</p><div className="transform-buttons">
          <Button title="Rotate selection 15° counterclockwise" disabledReason={unavailable} disabled={readOnly} onClick={() => transform({ rotation: -15 })}><RotateCcw size={16} /></Button>
          <Button className="rotate-selection-clockwise" title="Rotate selection 15° clockwise" disabledReason={unavailable} disabled={readOnly} onClick={() => transform({ rotation: 15 })}><RotateCw size={16} /></Button>
          <Button title="Compress selection by 10%" disabledReason={unavailable} disabled={readOnly} onClick={() => transform({ scale: 0.9 })}><Minus size={16} /></Button>
          <Button title="Expand selection by 10%" disabledReason={unavailable} disabled={readOnly} onClick={() => transform({ scale: 1.1 })}><Plus size={16} /></Button>
        </div></>}
        <p className="microcopy">Alt + arrows moves {controller.preferences.value.nudgeStep} yd. Shift + Alt moves {controller.preferences.value.fastNudgeStep} yd.</p>
      </InspectorSection>}
<InspectorSection title="Formation tools" preference="inspectorFormationOpen" className="formation-section" controller={controller}><p className="section-description">{selectedIds.length ? `Shape ${selectedIds.length} selected performers` : 'Select performers or a section before shaping.'}</p><div className="formation-grid">{formations.map(f => <HelpButton title={`${f.label} formation`} description={`Choose ${f.label.toLowerCase()} as the next formation; positions change when you apply it.`} state={formation === f.kind ? 'Chosen' : 'Available'} key={f.kind} aria-pressed={formation === f.kind} className={formation === f.kind ? 'active' : ''} onClick={() => setFormation(f.kind)}>{f.icon}<span>{f.label}</span></HelpButton>)}</div><div className="form-row"><NumberField onDraftChange={setPendingDraft} label="Width · yd" description="Choose the formation width in yards before applying it." value={formationWidth} min={1} max={95} onChange={setFormationWidth} /><NumberField onDraftChange={setPendingDraft} label="Depth · yd" description="Choose the formation depth in yards before applying it." value={formationHeight} min={1} max={48} onChange={setFormationHeight} /></div><div className="form-row"><NumberField onDraftChange={setPendingDraft} label="Rotation · °" description="Choose the formation angle in degrees before applying it." value={formationRotation} min={-180} max={180} onChange={setFormationRotation} /><NumberField onDraftChange={setPendingDraft} label="Block columns" description="Choose the number of columns used by a block formation." value={formationColumns} min={1} max={PROJECT_LIMITS.performers} integer onChange={value => setFormationColumns(Math.round(value))} /></div><HelpButton command="formation.apply" title="Apply formation" description={selectedIds.length ? `Reshape ${selectedIds.length} selected performers on this set.` : 'Choose performers on the field, a section, or Select all before applying a formation.'} disabledReason={readOnly ? 'Return to a set and pause playback to edit positions.' : 'Select performers first. Use Select all to reshape the full ensemble.'} className="button primary apply-formation" onClick={applyFormation} disabled={readOnly || !selectedIds.length}>Apply formation<ArrowRight size={15} /></HelpButton>{readOnly && <HelpButton command="set.select" showShortcut={false} title="Return to this set to edit" description="Stop playback and return to the active set’s exact count." className="return-to-set" onClick={() => selectSet(index)}>Return to this set to edit</HelpButton>}</InspectorSection>
<InspectorSection title="Set properties" preference="inspectorSetOpen" controller={controller}><div key={`${projectEpoch}-${activeSet.id}`}><div className="section-title"><span>Current set</span><div><Button command="set.add" title="Duplicate current set" description="Append a copy of the current set to the show." disabled={project.sets.length >= PROJECT_LIMITS.sets} disabledReason={`A production can contain at most ${PROJECT_LIMITS.sets} sets.`} onClick={duplicateSet}><Copy size={14} /></Button><Button command="set.remove" title="Delete current set" disabledReason="Keep at least one set in the production." disabled={project.sets.length <= 1} onClick={() => setDialog('remove-set')}><Trash2 size={14} /></Button></div></div><label className="form-label">Set name<CommitInput label="Set name" description="Rename this set. Enter applies; Escape cancels." onDraftChange={setPendingDraft} value={activeSet.name} maxLength={PROJECT_LIMITS.text.setName} onCommit={name => updateSet({ name })} /></label><div className="form-row"><NumberField onDraftChange={setPendingDraft} label="Counts" description="Set the number of counts in the move into this set." disabledReason="The opening set has no incoming move and always has zero counts." value={setTiming(project, index).counts} min={setCountLimits(index).min} max={setCountLimits(index).max} integer disabled={index === 0} onChange={value => { setPlaying(false); updateSet({ counts: Math.round(value) }); }} /><NumberField onDraftChange={setPendingDraft} label="Tempo · BPM" description="Set the playback tempo for the move into this set." disabledReason="The opening set has no incoming move; select a later set to edit tempo." value={setTiming(project, index).tempo} min={PROJECT_LIMITS.tempo.min} max={PROJECT_LIMITS.tempo.max} step={0.1} disabled={index === 0} onChange={value => updateSet({ tempo: value })} /></div><p className="microcopy">{index === 0 ? 'The opening set has zero move counts; its stored tempo does not affect playback.' : 'Counts and tempo describe the move into this set.'}</p><label className="form-label">Transition<Tooltip name="Transition" description="Choose constant speed or an eased start and finish for the move into this set." disabledReason={index === 0 ? 'The opening set has no incoming move. Select a later set.' : undefined}><select disabled={index === 0} value={setTiming(project, index).transition} onChange={e => updateSet({ transition: e.target.value as 'linear' | 'ease' })}><option value="linear">Constant speed</option><option value="ease">Ease in / out</option></select></Tooltip></label><label className="form-label">Rehearsal notes<CommitInput label="Rehearsal notes" description="Add instructions for this set. Enter applies; Shift+Enter adds a line; Escape cancels." multiline allowEmpty onDraftChange={setPendingDraft} placeholder="What should the ensemble know?" value={activeSet.notes} maxLength={PROJECT_LIMITS.text.notes} onCommit={notes => updateSet({ notes })} /></label><div className="reorder-controls"><span>Set order</span><Button command="set.reorder" title="Move set earlier" disabledReason="This is already the first set." disabled={index === 0} onClick={() => reorderSet(-1)}><ArrowUp size={14} /></Button><Button command="set.reorder" title="Move set later" disabledReason="This is already the last set." disabled={index === project.sets.length - 1} onClick={() => reorderSet(1)}><ArrowDown size={14} /></Button></div></div></InspectorSection>
<InspectorSection title="Transition check" preference="inspectorChecksOpen" className="transition-check" controller={controller}><div className="section-title"><span>{issues.length ? <TriangleAlert size={15} /> : <ShieldCheck size={15} />} {issues.length ? "Flags to review" : "Current move"}</span><span className={`check-count ${issues.length ? 'has-issues' : ''}`}>{issues.length || <Check size={12} />}</span></div>{index === 0 ? <p className="section-description">Select the next set to check the transition into it.</p> : issues.length ? <><p className="section-description">Review spacing and step size before rehearsal.</p><div className="issue-list">{issues.slice(0, 12).map((issue, i) => <HelpButton title="Review transition flag" description="Select the affected performers and show their travel paths on this set." key={i} onClick={() => { setSelectedIds(issue.performerIds); setShowPaths(true); setWorkspace('design'); selectSet(index); }}><span className={`issue-dot ${issue.severity}`} /><span>{issue.message}</span><ChevronRight size={12} /></HelpButton>)}</div>{issues.length > 12 && <p className="microcopy">+ {issues.length - 12} more issues. Adjust the formation and recheck.</p>}</> : <p className="check-passed"><CheckCheck size={16} />No spacing or stride flags.</p>}</InspectorSection>
    </div>
  </aside>;
}
