import { ScatterFormationFields } from './ScatterFormationFields';
import { BezierFormationFields } from './BezierFormationFields';
import { useEffect, useMemo, useRef } from 'react';
import { DEFAULT_SNAPPING } from '../snapping';
import { coordinateDescription } from '../domain';
import { isCustomSurface } from '../surfaces';
import { previewStrides } from './formationStride';
import { BezierIcon, BezierWaveIcon, ScatterIcon } from '../ui/icons';
import { NumberField } from '../components/NumberField';
import type { FormationOptions } from '../types';
import type { FormationAssignmentMode } from '../formationPreview';
import { sessionAssignmentMode, shortestOrderStale } from './formationSession';
import { formations } from './formations';
import { Copy, MoreHorizontal, Unlink } from 'lucide-react';
import { HelpButton } from './ControlHelp';
import { Menu, type MenuEntry } from '../ui/Menu';
import type { EditorController } from './useEditorController';

export function FormationPanel({ controller: c }: { controller: EditorController }) {
  const region = useRef<HTMLDivElement>(null);
  const session = c.formationPreview;
  const previousSession = useRef<typeof session>(null);
  useEffect(() => {
    const previous = previousSession.current;
    if (session && !previous) {
      c.preferences.update({inspectorFormationOpen:true});
      requestAnimationFrame(()=>{
        // Keep focus the writer already moved into the new parameters while
        // this initial focus callback was waiting for the section to open.
        if(region.current?.contains(document.activeElement))return;
        region.current?.scrollIntoView({ block: 'nearest' });
        // Curve and Scatter are shaped on the field and leave focus where it is, so Enter on the page still applies
        // a preview started from the Command palette. Their tiles joined this grid; only the other shapes take focus.
        if (!session.scatter && !session.bezier) region.current?.querySelector<HTMLElement>('.formation-grid button[aria-pressed="true"]')?.focus();
      });
    } else if (!session && previous?.live) {
      const saved = region.current?.querySelector<HTMLElement>(`[data-live-id="${previous.live.id}"]`);
      if (saved) { saved.scrollIntoView({ block: 'nearest' }); saved.querySelector<HTMLElement>('button')?.focus({ preventScroll: true }); }
    }
    previousSession.current = session;
  }, [session]);
  const options = session?.options;
  const display = (value: number) => Number(value.toFixed(2));
  const plain = !!session && !session.scatter && !session.bezier;
  // Lengths read in the production's steps on a football field, and in yards on any other surface.
  const custom = isCustomSurface(c.project.field);
  const lengthYards = custom ? 1 : 5 / (c.project.snapping ?? DEFAULT_SNAPPING).steps, lengthUnit = custom ? 'yd' : 'steps';
  const display1 = (value: number) => value.toFixed(value >= 100 ? 0 : 1);
  // The typical gap between neighbors in the preview, which is how a drill writer specifies a form.
  const previewPoints = c.formationResult?.updates;
  const spacing = useMemo(() => {
    const points = previewPoints ? Object.values(previewPoints) : [];
    if (points.length < 2 || points.length > 400) return null;
    let total = 0;
    for (const a of points) { let nearest = Infinity; for (const b of points) if (a !== b) nearest = Math.min(nearest, Math.hypot(a.x - b.x, a.y - b.y)); total += nearest; }
    return total / points.length;
  }, [previewPoints]);
  const interval = plain && spacing !== null && spacing > 1e-6 ? spacing / lengthYards : null;
  const center = options ? coordinateDescription(options.center, c.project.field, c.coordinateFormat).split('; ') : [];
  const centerSide = center.length ? /^(Side [12]): (.+)$/.exec(center[0]) : null;
  const resultPositions = c.formationResult?.error ? undefined : c.formationResult?.positions;
  const strides = useMemo(() => session && resultPositions ? previewStrides(c.project, c.index, session.ids, resultPositions) : null, [c.project, c.index, session, resultPositions]);
  const update = (patch: Partial<FormationOptions>) => { if (options) c.dispatch('formation.update', { options: { ...options, ...patch } }); };
  const mode = session ? sessionAssignmentMode(session) : undefined, stale = !!session && shortestOrderStale(session);
  const assign = (assignmentMode: FormationAssignmentMode) => { if (options) c.dispatch('formation.update', { options: { ...options, assignment: assignmentMode === 'roster' ? 'roster' : 'position' }, assignmentMode }); };
  const assignmentLocked = session?.assignmentConstraints ? 'Review or clear saved constraints in Optimize assignment.' : 'Finish or cancel the pending input before changing assignment.';
  const unavailable = c.pendingDraft ? 'Finish or cancel the pending input first.' : c.readOnly ? 'Return to a set and pause playback to edit positions.' : 'Select performers first. Use Select all for the full ensemble.';
  const live = c.activeSet.liveFormations ?? [];
  const editingLocked = c.readOnly || c.pendingDraft;
  if (!session && !live.length) return null;
  return <div ref={region} className="formation-panel">
    {!session && <div className="live-formations">
      <h3 className="inspector-subhead">Live formations<span className="badge">{live.length}</span></h3>
      {live.map(shape => {
        const selectedMembers = shape.members.some(m => c.selectedIds.includes(m.performerId));
        const vacant = shape.slotCount - shape.members.length;
        const more: MenuEntry[] = [
          { label: 'Detach all', icon: <Unlink size={15} />, description: 'Return every member to plain dots. Positions stay where they are.', disabled: editingLocked, onSelect: () => { c.dispatch('live.detach', { id: shape.id }); } },
          { label: 'Detach selected', icon: <Unlink size={15} />, disabled: editingLocked || !selectedMembers, disabledReason: 'Select members of this formation first.', onSelect: () => { c.dispatch('live.detach', { id: shape.id, ids: c.selectedIds }); } },
          ...(c.project.sets.length > 1 ? [{ type: 'heading', label: 'Copy to set' } as MenuEntry, ...c.project.sets.filter(set => set.id !== c.activeSet.id).map((set): MenuEntry => (
            { key: set.id, label: set.name, icon: <Copy size={15} />, hint: String(c.project.sets.indexOf(set) + 1), disabled: editingLocked, onSelect: () => { c.dispatch('live.copy', { id: shape.id, targetSetId: set.id }); } }))] : []),
        ];
        return <div className="live-formation" data-live-id={shape.id} key={shape.id}>
          <div className="live-formation-text"><strong>{shape.name}</strong><span>{shape.scatter ? 'Scatter' : shape.bezier ? 'Curve' : shape.kind === 'curve' ? 'Wave' : shape.kind[0].toUpperCase() + shape.kind.slice(1)} · {shape.members.length}{vacant > 0 ? ` · ${vacant} vacant` : ''}</span></div>
          <HelpButton command="live.edit" title={`Edit ${shape.name}`} description="Reopen this formation’s shape and members. Moving a dot on its own detaches it." className="button small" disabled={editingLocked} onClick={() => c.dispatch('live.edit', { id: shape.id })}>Edit</HelpButton>
          <Menu label={`More for ${shape.name}`} description="Detach members or copy this formation to another set." className="icon-button" align="end" items={more}><MoreHorizontal size={15} /></Menu>
        </div>;
      })}
    </div>}
    {session && <div className="formation-grid" role="group" aria-label="Shape">
      {formations.map(f => <HelpButton pointerPassThrough key={f.kind} command="formation.preview" title={`${f.label} formation`}
        description={`Preview ${f.label.toLowerCase()} for the selected performers. Apply accepts; Cancel keeps their positions.`}
        aria-pressed={plain && session.kind === f.kind} className={plain && session.kind === f.kind ? 'active' : ''}
        disabled={c.pendingDraft} disabledReason={unavailable}
        onClick={() => c.dispatch('formation.preview', { kind: f.kind })}>{f.icon}<span>{f.label}</span></HelpButton>)}
      <HelpButton pointerPassThrough command="formation.bezier" title="Bézier curve formation" description="Space the selection evenly along a curve you shape with anchors and handles." aria-pressed={!!session.bezier} className={session.bezier ? 'active' : ''} disabled={c.pendingDraft || c.selectedIds.length < 2} disabledReason="Select at least two performers." onClick={() => c.dispatch('formation.bezier', { wave: false })}><BezierIcon size={20} /><span>Curve</span></HelpButton>
      <HelpButton pointerPassThrough command="formation.bezier" title="Bézier wave formation" description="Start from an S-shaped curve with a middle anchor." disabled={c.pendingDraft || c.selectedIds.length < 2} disabledReason="Select at least two performers." onClick={() => c.dispatch('formation.bezier', { wave: true })}><BezierWaveIcon size={20} /><span>S-curve</span></HelpButton>
      <HelpButton pointerPassThrough command="formation.scatter" title="Scatter formation" description="Fill a region with evenly spread, repeatable random positions." aria-pressed={!!session.scatter} className={session.scatter ? 'active' : ''} disabled={c.pendingDraft || !c.selectedIds.length} onClick={() => c.dispatch('formation.scatter')}><ScatterIcon size={20} /><span>Scatter</span></HelpButton>
    </div>}
    {session && options && <div key={session.kind} className="formation-parameters">
      {session.scatter ? <ScatterFormationFields controller={c} /> : session.bezier ? <BezierFormationFields controller={c} /> : <>
        <div className="form-row">
          {interval !== null
            ? <NumberField label={`Interval · ${lengthUnit}`} description="The distance between neighbors. Changing it resizes the whole shape and keeps its proportions." value={display(interval)} min={.1} max={320} step={.25} onDraftChange={c.setPendingDraft} onChange={next => update({ width: options.width * next / interval, height: options.height * next / interval })} />
            : <NumberField label={`Depth · ${lengthUnit}`} value={display(options.height / lengthYards)} min={0} max={320} step={.5} disabled={session.kind === 'line'} onDraftChange={c.setPendingDraft} onChange={height => update({ height: height * lengthYards })} />}
          <NumberField label={`${session.kind === 'line' ? 'Length' : 'Width'} · ${lengthUnit}`} value={display(options.width / lengthYards)} min={.1} max={320} step={.5} onDraftChange={c.setPendingDraft} onChange={width => update({ width: width * lengthYards })} />
        </div>
        <div className="form-row">
          {session.kind !== 'line' && interval !== null && <NumberField label={`${session.kind === 'arc' ? 'Bulge' : 'Depth'} · ${lengthUnit}`} value={display(options.height / lengthYards)} min={0} max={320} step={.5} onDraftChange={c.setPendingDraft} onChange={height => update({ height: height * lengthYards })} />}
          <NumberField label="Rotation · °" value={display(options.rotation)} min={-3600} max={3600} step={1} onDraftChange={c.setPendingDraft} onChange={rotation => update({ rotation })} />
          {session.kind === 'block' && <NumberField label="Columns" value={options.columns} min={1} max={500} integer onDraftChange={c.setPendingDraft} onChange={columns => update({ columns })} />}
        </div>
        <div className="formation-center">
          <span className="selection-coordinate-label">Center{centerSide ? ` · ${centerSide[1]}` : ''}</span>
          {(centerSide ? [centerSide[2], ...center.slice(1)] : center).map((line, i) => <span key={i}>{line.charAt(0).toUpperCase() + line.slice(1)}</span>)}
          <details className="performer-facing"><summary>Exact center</summary>
            <div className="form-row exact-position"><NumberField label="Center X · yd" value={display(options.center.x)} min={0} max={c.project.field.width} step={.1} onDraftChange={c.setPendingDraft} onChange={x => update({ center: { ...options.center, x } })} />
              <NumberField label="Center Y · yd" value={Math.min(c.project.field.height, display(options.center.y))} min={0} max={c.project.field.height} step={.1} onDraftChange={c.setPendingDraft} onChange={y => update({ center: { ...options.center, y } })} /></div>
          </details>
        </div></>}
      {c.formationResult?.error
        ? <p className="transform-result transform-result--error" role="status">{c.formationResult.error}</p>
        : <dl className="selection-stats formation-stats" role="status">
          {c.formationResult?.travel && <div><dt>Farthest moved</dt><dd>{display1(c.formationResult.travel.maximum / lengthYards)}<small>{lengthUnit}</small></dd></div>}
          {strides
            ? <div data-level={strides.level}><dt>Biggest step<span className="formation-move-context">Set {c.index} → {c.index + 1} · {strides.counts} counts</span></dt><dd>{strides.stride > 1e-6 ? `${(5 / strides.stride).toFixed(1)}-to-5` : 'Hold'}{strides.level !== 'ok' && <small>{strides.level === 'over' ? 'over the limit' : 'near the limit'}</small>}</dd></div>
            : c.formationResult?.travel && <div><dt>Total moved</dt><dd>{display1(c.formationResult.travel.total / lengthYards)}<small>{lengthUnit}</small></dd></div>}
        </dl>}
      {c.formationResult?.travel && !c.formationResult.error && <p className="formation-travel sr-only" role="status">Total travel {c.formationResult.travel.total.toFixed(2)} yd · Longest {c.formationResult.travel.maximum.toFixed(2)} yd</p>}
      <div className="form-label"><span>{session.assignmentReviewed || session.assignmentConstraints ? 'Who goes where · reviewed' : 'Who goes where'}</span><div className="segmented fill formation-assignment" role="group" aria-label="Formation assignment">
        <HelpButton title="Shortest-travel assignment" description={stale ? "The order was solved for an earlier shape and is kept while you adjust it. Choose this again to re-solve for the current shape with the least total travel." : "Assign destinations with the least total travel; straight paths do not cross."} aria-pressed={mode === 'shortest'} disabled={c.pendingDraft || !!session.assignmentConstraints || !!session.scatter || !!session.bezier} disabledReason={session.scatter || session.bezier ? 'Scatter and Bézier formations use positional or roster order.' : assignmentLocked} onClick={() => assign('shortest')}>Shortest{stale ? ' *' : ''}</HelpButton>
        <HelpButton title="Positional assignment" description="Assign destinations in the selected performers’ spatial order." aria-pressed={mode === 'position'} disabled={c.pendingDraft || !!session.assignmentConstraints} disabledReason={assignmentLocked} onClick={() => assign('position')}>Positional</HelpButton>
        <HelpButton title="Roster assignment" description="Assign destinations in Cast order." aria-pressed={mode === 'roster'} disabled={c.pendingDraft || !!session.assignmentConstraints} disabledReason={assignmentLocked} onClick={() => assign('roster')}>Roster</HelpButton>
      </div></div>
      <HelpButton title="Optimize formation assignment" command="assignment.open" description="Compare alternative mappings by travel and movement checks, with pins and constraints." className="button subtle block" disabled={c.pendingDraft || session.ids.length < 2 || !!c.formationResult?.error} onClick={() => c.dispatch('assignment.open')}>Optimize assignment…</HelpButton>
      {session.assignmentConstraints && <p className="microcopy">Assignment constraints are saved. Review or clear them in Optimize assignment before changing members or order.</p>}
      <label className="live-keep"><input type="checkbox" checked={!!session.live} disabled={!!session.assignmentConstraints || !!session.scatter || !!session.bezier || c.pendingDraft || !!c.activeSet.liveFormations?.some(f => f.id === session.live?.id)} onChange={e => c.dispatch('live.configure', { enabled: e.target.checked })} />Keep as a live formation</label>
      {session.live && <div className="live-settings">
        <label className="form-label"><span>Formation name</span><input aria-label="Formation name" value={session.live.name} maxLength={80} disabled={c.pendingDraft} onChange={e => c.dispatch('live.configure', { name: e.target.value })} /></label>
        <details className="live-members"><summary>Members · {session.ids.length} of {session.live.slotCount} slots</summary>
          <div className="live-member-list">{c.project.performers.map(p => <label key={p.id}><input type="checkbox" checked={session.ids.includes(p.id)} disabled={c.pendingDraft || !!session.assignmentConstraints} onChange={e => c.dispatch('live.members', { ids: e.target.checked ? [...session.ids, p.id] : session.ids.filter(id => id !== p.id) })} /><span>{p.label}{p.name ? ` · ${p.name}` : ''}</span></label>)}</div>
        </details>
        <HelpButton command="live.redistribute" title="Redistribute members" description="Close gaps using the assignment order above. Geometry edits keep member slots until you redistribute." className="button subtle block" disabled={c.pendingDraft || !!session.assignmentConstraints || !session.ids.length} disabledReason="Clear assignment constraints in Optimize assignment before redistributing members." onClick={() => c.dispatch('live.redistribute')}>Redistribute members</HelpButton>
      </div>}
    </div>}
  </div>;
}
