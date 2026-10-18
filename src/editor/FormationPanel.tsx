import { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { NumberField } from '../components/NumberField';
import type { FormationAssignment, FormationOptions } from '../types';
import { formations } from './formations';
import { HelpButton } from './ControlHelp';
import type { EditorController } from './useEditorController';

export function FormationPanel({ controller: c }: { controller: EditorController }) {
  const region = useRef<HTMLDivElement>(null);
  const session = c.formationPreview;
  useEffect(() => { if (session) { region.current?.scrollIntoView({ block: 'nearest' }); region.current?.querySelector<HTMLElement>('.formation-grid button[aria-pressed="true"]')?.focus(); } }, [!!session]);
  const options = session?.options;
  const display = (value: number) => Number(value.toFixed(4));
  const update = (patch: Partial<FormationOptions>) => { if (options) c.dispatch('formation.update', { options: { ...options, ...patch } }); };
  const unavailable = c.pendingDraft ? 'Finish or cancel the pending input first.' : c.readOnly ? 'Return to a set and pause playback to edit positions.' : 'Select performers first. Use Select all for the full ensemble.';
  return <div ref={region} className="formation-panel">
    <p className="section-description">{session ? `Preview · ${session.ids.length} selected · ${options?.assignment === 'position' ? 'positional' : 'roster'} order` : 'Choose a shape to preview the explicit selection.'}</p>
    <div className="formation-grid">{formations.map(f => <HelpButton key={f.kind} command="formation.preview" title={`${f.label} formation`}
      description={`Preview ${f.label.toLowerCase()} for the selected performers. Apply accepts; Cancel keeps their positions.`}
      aria-pressed={session?.kind === f.kind} className={session?.kind === f.kind ? 'active' : ''}
      disabled={c.pendingDraft || (!session && (c.readOnly || !c.selectedIds.length))} disabledReason={unavailable}
      onClick={() => c.dispatch('formation.preview', { kind: f.kind })}>{f.icon}<span>{f.label}</span></HelpButton>)}</div>
    {session && options && <div key={session.kind} className="formation-parameters">
      <label className="form-label">Assignment<select aria-label="Formation assignment" value={options.assignment ?? 'roster'} disabled={c.pendingDraft} onChange={e => update({ assignment: e.target.value as FormationAssignment })}><option value="position">Positional order</option><option value="roster">Roster order</option></select></label>
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
