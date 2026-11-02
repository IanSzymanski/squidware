import { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { NumberField } from '../components/NumberField';
import type { FormationOptions } from '../types';
import { formations } from './formations';
import { HelpButton } from './ControlHelp';
import type { EditorController } from './useEditorController';

export function FormationPanel({ controller: c }: { controller: EditorController }) {
  const region = useRef<HTMLDivElement>(null);
  const session = c.formationPreview;
  const previousSession = useRef(session);
  useEffect(() => {
    const previous = previousSession.current;
    if (session && !previous) {
      region.current?.scrollIntoView({ block: 'nearest' });
      region.current?.querySelector<HTMLElement>('.formation-grid button[aria-pressed="true"]')?.focus();
    } else if (!session && previous?.live) {
      const saved = region.current?.querySelector<HTMLElement>(`[data-live-id="${previous.live.id}"]`);
      if (saved) { saved.scrollIntoView({ block: 'nearest' }); saved.querySelector<HTMLElement>('button')?.focus({ preventScroll: true }); }
    }
    previousSession.current = session;
  }, [session]);
  const options = session?.options;
  const display = (value: number) => Number(value.toFixed(4));
  const update = (patch: Partial<FormationOptions>) => { if (options) c.dispatch('formation.update', { options: { ...options, ...patch } }); };
  const unavailable = c.pendingDraft ? 'Finish or cancel the pending input first.' : c.readOnly ? 'Return to a set and pause playback to edit positions.' : 'Select performers first. Use Select all for the full ensemble.';
  return <div ref={region} className="formation-panel">
    {!session && <HelpButton title="Browse saved formations" command="templates.open" className="button subtle" disabled={c.pendingDraft} onClick={() => c.dispatch('templates.open')}>Saved formations…</HelpButton>}
    {!session && !!c.activeSet.liveFormations?.length && <details className="live-formations" open>
      <summary>Live formations · {c.activeSet.liveFormations.length}</summary>
      <p className="microcopy">Moving dots individually detaches them. Other members keep their slots until you redistribute.</p>
      {c.activeSet.liveFormations.map(shape => <div className="live-formation" data-live-id={shape.id} key={shape.id}>
        <strong>{shape.name}</strong><span className="microcopy">{shape.kind} · {shape.members.length} members · {shape.slotCount - shape.members.length} vacant</span>
        <div className="form-row"><HelpButton command="live.edit" title={`Edit ${shape.name}`} className="button subtle" disabled={c.readOnly || c.pendingDraft} onClick={() => c.dispatch('live.edit',{id:shape.id})}>Edit</HelpButton>
          <HelpButton command="live.detach" title={`Detach ${shape.name}`} className="button subtle" disabled={c.readOnly || c.pendingDraft} onClick={() => c.dispatch('live.detach',{id:shape.id})}>Detach all</HelpButton>
          <HelpButton command="live.detach" title={`Detach selected from ${shape.name}`} className="button subtle" disabled={c.readOnly || c.pendingDraft || !shape.members.some(m=>c.selectedIds.includes(m.performerId))} onClick={() => c.dispatch('live.detach',{id:shape.id,ids:c.selectedIds})}>Detach selected</HelpButton></div>
        {c.project.sets.length > 1 && <label className="form-label"><span>Copy {shape.name} to set</span><select value="" disabled={c.readOnly || c.pendingDraft} onChange={e=>{if(e.target.value)c.dispatch('live.copy',{id:shape.id,targetSetId:e.target.value});}}><option value="">Choose a set…</option>{c.project.sets.filter(set=>set.id!==c.activeSet.id).map(set=><option key={set.id} value={set.id}>{set.name}</option>)}</select></label>}
      </div>)}
    </details>}
    <p className="section-description">{session ? `Preview · ${session.ids.length} selected · ${options?.assignment === 'position' ? 'positional' : 'roster'} order` : 'Choose a shape to preview the explicit selection.'}</p>
    <div className="formation-grid">{formations.map(f => <HelpButton key={f.kind} command="formation.preview" title={`${f.label} formation`}
      description={`Preview ${f.label.toLowerCase()} for the selected performers. Apply accepts; Cancel keeps their positions.`}
      aria-pressed={session?.kind === f.kind} className={session?.kind === f.kind ? 'active' : ''}
      disabled={c.pendingDraft || (!session && (c.readOnly || !c.selectedIds.length))} disabledReason={unavailable}
      onClick={() => c.dispatch('formation.preview', { kind: f.kind })}>{f.icon}<span>{f.label}</span></HelpButton>)}</div>
    {session && options && <div key={session.kind} className="formation-parameters">
      <label className="live-keep"><input type="checkbox" checked={!!session.live} disabled={c.pendingDraft || !!c.activeSet.liveFormations?.some(f=>f.id===session.live?.id)} onChange={e=>c.dispatch('live.configure',{enabled:e.target.checked})} />Keep editable on this set</label>
      {session.live && <div className="live-settings">
        <label className="form-label"><span>Formation name</span><input aria-label="Formation name" value={session.live.name} maxLength={80} disabled={c.pendingDraft} onChange={e=>c.dispatch('live.configure',{name:e.target.value})} /></label>
        <details className="live-members"><summary>Members · {session.ids.length} of {session.live.slotCount} slots</summary>
          <p className="microcopy">Changing members redistributes the preview. A performer can belong to one live formation per set.</p>
          <div className="live-member-list">{c.project.performers.map(p=><label key={p.id}><input type="checkbox" checked={session.ids.includes(p.id)} disabled={c.pendingDraft} onChange={e=>c.dispatch('live.members',{ids:e.target.checked?[...session.ids,p.id]:session.ids.filter(id=>id!==p.id)})}/><span>{p.label}{p.name ? ` · ${p.name}` : ''}</span></label>)}</div>
        </details>
        <HelpButton command="live.redistribute" title="Redistribute members" className="button subtle" disabled={c.pendingDraft || !session.ids.length} onClick={()=>c.dispatch('live.redistribute')}>Redistribute members</HelpButton>
        <p className="microcopy">Geometry edits preserve member slots. Redistribute closes gaps using the assignment below. Cancel keeps the saved formation.</p>
      </div>}
      <div className="form-label"><span>Assignment</span><div className="form-row" role="group" aria-label="Formation assignment">
        <HelpButton title="Positional assignment" description="Assign destinations in the selected performers’ spatial order." aria-pressed={options.assignment === 'position'} className={options.assignment === 'position' ? 'button primary' : 'button subtle'} disabled={c.pendingDraft} disabledReason="Finish or cancel the pending input before changing assignment." onClick={() => update({ assignment: 'position' })}>Positional</HelpButton>
        <HelpButton title="Roster assignment" description="Assign destinations in Cast order." aria-pressed={options.assignment !== 'position'} className={options.assignment !== 'position' ? 'button primary' : 'button subtle'} disabled={c.pendingDraft} disabledReason="Finish or cancel the pending input before changing assignment." onClick={() => update({ assignment: 'roster' })}>Roster</HelpButton>
      </div></div>
      <div className="form-row"><NumberField label="Width · yd" value={display(options.width)} min={.1} max={200} step={.1} onDraftChange={c.setPendingDraft} onChange={width => update({ width })} />
        {session.kind !== 'line' && <NumberField label={session.kind === 'arc' ? 'Bulge · yd' : 'Depth · yd'} value={display(options.height)} min={0} max={200} step={.1} onDraftChange={c.setPendingDraft} onChange={height => update({ height })} />}</div>
      <div className="form-row"><NumberField label="Rotation · °" value={display(options.rotation)} min={-3600} max={3600} step={1} onDraftChange={c.setPendingDraft} onChange={rotation => update({ rotation })} />
        {session.kind === 'block' && <NumberField label="Block columns" value={options.columns} min={1} max={500} integer onDraftChange={c.setPendingDraft} onChange={columns => update({ columns })} />}</div>
      <div className="form-row"><NumberField label="Center X · yd" value={display(options.center.x)} min={0} max={c.project.field.width} step={.1} onDraftChange={c.setPendingDraft} onChange={x => update({ center: { ...options.center, x } })} />
        <NumberField label="Center Y · yd" value={Math.min(c.project.field.height, display(options.center.y))} min={0} max={c.project.field.height} step={.1} onDraftChange={c.setPendingDraft} onChange={y => update({ center: { ...options.center, y } })} /></div>
      <p className={`transform-result${c.formationResult?.error ? ' transform-result--error' : ''}`} role="status">{c.formationResult?.error ?? 'Drag field handles or edit these values. Apply accepts this exact preview.'}</p>
      {c.formationResult?.travel && <p className="formation-travel microcopy" role="status">Total travel {c.formationResult.travel.total.toFixed(2)} yd · Longest {c.formationResult.travel.maximum.toFixed(2)} yd</p>}
      <p className="microcopy">Dashed paths show each move. Assignments stay fixed while you move or rotate the preview. Each shape keeps its parameters for this session.</p>
    </div>}
    {!session && <HelpButton command="formation.preview" title="Preview formation" description={`Preview a shape for ${c.selectedIds.length} selected performers before applying.`} className="button primary preview-formation" disabled={c.readOnly || !c.selectedIds.length || c.pendingDraft} disabledReason={unavailable} onClick={() => c.dispatch('formation.preview', {})}>Preview formation<ArrowRight size={15} /></HelpButton>}
  </div>;
}
