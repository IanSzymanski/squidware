import { useEffect, useRef } from 'react';
import { NumberField } from '../components/NumberField';
import { Tooltip } from '../components/Tooltip';
import { fieldPivot } from '../transforms';
import type { FieldPivot, TransformOperation, TransformPivot } from '../transforms';
import type { EditorController } from './useEditorController';

export function TransformPanel({ controller: c }: { controller: EditorController }) {
  const section = useRef<HTMLElement>(null);
  useEffect(() => { section.current?.scrollIntoView({ block: 'nearest' }); section.current?.querySelector<HTMLElement>('select')?.focus(); }, []);
  const session = c.transformPreview; if (!session) return null;
  const options = session.options; const result = c.transformResult!;
  const update = (value: Partial<typeof options>) => c.dispatch('transform.update', { options: { ...options, ...value } });
  function choosePivot(kind: TransformPivot['kind']) {
    update({ pivot: kind === 'centroid' ? { kind } : kind === 'performer' ? { kind, id: session!.ids[0] }
      : kind === 'field' ? { kind, reference: 'center' } : { kind, point: result.pivot ?? fieldPivot(c.project.field, 'center') } });
  }
  return <section ref={section} className="inspector-section transform-panel" aria-label="Exact transform preview">
    <h3>Exact transform preview</h3>
    <p className="section-description">{session.ids.length} selected · set {c.index+1}. Original positions stay unchanged until Apply.</p>
    <label className="form-label">Operation<Tooltip name="Transform operation" description="Choose rotation/scaling or a mirror around a fixed field axis."><select aria-label="Transform operation" value={options.operation} onChange={event => update({ operation: event.target.value as TransformOperation, angle: 0, scale: 1, pivot: { kind: 'centroid' } })}>
      <option value="rotate-scale">Rotate and scale</option><option value="across-50">Mirror across the 50</option><option value="front-back">Flip front to back</option>
    </select></Tooltip></label>
    {options.operation === 'rotate-scale' ? <>
      <div className="form-row">
        <NumberField label="Angle · degrees" description="Positive turns clockwise. Enter updates the field preview; Apply commits it." min={-3600} max={3600} step={1} value={options.angle} onChange={angle => update({ angle })} onDraftChange={c.setPendingDraft} />
        <NumberField label="Scale · percent" description="100% keeps the size; 200% doubles distances from the chosen pivot. Enter previews; Apply commits." min={1} max={10000} step={1} value={options.scale*100} onChange={value => update({ scale: value/100 })} onDraftChange={c.setPendingDraft} />
      </div>
      <label className="form-label">Pivot<Tooltip name="Transform pivot" description="Choose the fixed point used by both numeric controls and field handles."><select aria-label="Transform pivot" value={options.pivot.kind} onChange={event => choosePivot(event.target.value as TransformPivot['kind'])}>
        <option value="centroid">Selection center</option><option value="performer">Performer</option><option value="custom">Custom point</option><option value="field">Field reference</option>
      </select></Tooltip></label>
      {options.pivot.kind === 'performer' && <label className="form-label">Pivot performer<Tooltip name="Pivot performer" description="Use this performer's committed position on the current set as the fixed pivot. It can be outside the selection."><select aria-label="Pivot performer" value={options.pivot.id} onChange={event => update({ pivot: { kind: 'performer', id: event.target.value } })}>{c.project.performers.map(person => <option key={person.id} value={person.id}>{person.label}{person.name ? ` · ${person.name}` : ''}</option>)}</select></Tooltip></label>}
      {options.pivot.kind === 'field' && <label className="form-label">Field reference<Tooltip name="Pivot field reference" description="Use a midfield, hash or corner reference from this production's field geometry."><select aria-label="Pivot field reference" value={options.pivot.reference} onChange={event => update({ pivot: { kind: 'field', reference: event.target.value as FieldPivot } })}>
        <option value="center">Midfield center</option><option value="back-hash">50 / back hash</option><option value="front-hash">50 / front hash</option><option value="back-left">Back left corner</option><option value="back-right">Back right corner</option><option value="front-left">Front left corner</option><option value="front-right">Front right corner</option>
      </select></Tooltip></label>}
      {options.pivot.kind === 'custom' && <div className="form-row" key="custom-pivot">
        <NumberField label="Pivot X · yards" min={0} max={c.project.field.width} step={.625} value={options.pivot.point.x} onDraftChange={c.setPendingDraft} onChange={x => update({ pivot: { kind: 'custom', point: { x, y: result.pivot?.y ?? 0 } } })} />
        <NumberField label="Pivot Y · yards" min={0} max={c.project.field.height} step={.625} value={options.pivot.point.y} onDraftChange={c.setPendingDraft} onChange={y => update({ pivot: { kind: 'custom', point: { x: result.pivot?.x ?? 0, y } } })} />
      </div>}
      {result.pivot && <p className="microcopy">Pivot: {Number(result.pivot.x.toFixed(3))}, {Number(result.pivot.y.toFixed(3))} yd. Drag the round rotation handle, square scale handle, or pivot crosshair. Numbers are the keyboard alternative.</p>}
    </> : <p className="microcopy">{options.operation === 'across-50' ? 'Reflect X around midfield; Y stays fixed.' : 'Reflect Y around the middle of the field; X stays fixed.'} Performer identities stay the same.</p>}
    <p className={`transform-result${result.error ? ' transform-result--error' : ''}`} role="status">{result.error || (c.pendingDraft ? 'Finish or cancel incomplete inputs before applying.' : result.changed ? 'Preview ready. Apply once to record one undo action.' : 'Preview matches the original positions.')}</p>
    <p className="microcopy">Out-of-field results cannot be applied. Changing selection, set, workspace, playback or project revision cancels this preview.</p>
  </section>;
}
