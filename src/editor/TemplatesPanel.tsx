import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Download, Plus, Upload } from 'lucide-react';
import { Modal } from '../components/Modal';
import { NumberField } from '../components/NumberField';
import type { FormationKind, FormationOptions } from '../types';
import { captureFormationSnapshot, captureParametricFormation } from '../templates/formations';
import { captureShowTemplate, productionFromTemplate } from '../templates/production';
import { parseTemplateLibrary, serializeTemplateLibrary, TEMPLATE_LIMITS } from '../templates/library';
import type { FormationTemplate, Template, TemplateLibrary } from '../templates/library';
import { emptyTemplateLibrary } from '../templates/storage';
import { canEditPositions } from './editMode';
import { HelpButton } from './ControlHelp';
import { ShowTemplatePreview, ShowTemplateSummary } from './NewProductionPanel';
import { TemplatePreview } from './TemplatePreview';
import { beginTemplateReview, templateReviewError, templateReviewResult } from './templateReview';
import type { EditorController } from './useEditorController';
import './templates.css';

function describe(entry: Template) {
  return entry.kind === 'show' ? `${entry.sections.reduce((n, s) => n + s.count, 0)} performers · ensemble setup`
    : entry.geometry.kind === 'snapshot' ? `${entry.sourceCount} performers · saved picture` : `${entry.geometry.shape} · adapts to 1–500 performers`;
}
function useTemplateDraft(c: EditorController) {
  const drafts = useRef(new Set<string>());
  const [pending, setPending] = useState(false);
  const update = useCallback((value: boolean, id: string) => { value ? drafts.current.add(id) : drafts.current.delete(id); setPending(drafts.current.size > 0); }, []);
  useEffect(() => { c.setPendingDraft(pending, 'template-input'); return () => c.setPendingDraft(false, 'template-input'); }, [pending, c.setPendingDraft]);
  const clear = () => { drafts.current.clear(); setPending(false); c.setPendingDraft(false, 'template-input'); };
  return { pending, update, clear };
}

function FormationTemplateReview({ entry, controller: c, draft }: { entry: FormationTemplate; controller: EditorController; draft: ReturnType<typeof useTemplateDraft> }) {
  const [source] = useState(() => c.store.getState());
  const [review, setReview] = useState(() => beginTemplateReview(source, entry));
  const result = useMemo(() => templateReviewResult(source, review), [source, review]);
  const stale = templateReviewError(c.store.getState(), review);
  const placement = review.placement, geometry = review.template.geometry;
  const update = (patch: Partial<typeof placement>) => setReview({ ...review, placement: { ...placement, ...patch }, assignmentRotation: patch.assignment && patch.assignment !== placement.assignment ? placement.rotation : review.assignmentRotation });
  const options = (patch: Partial<FormationOptions>) => {
    if (geometry.kind === 'parametric') setReview({ ...review, template: { ...review.template, geometry: { ...geometry, ...patch } } });
  };
  const display = (n: number) => Math.round(n * 1e6) / 1e6;
  return <section className="template-formation-review" aria-label="Saved formation review">
    <p className="section-description">{review.ids.length} selected · {source.project.present.sets[source.selection.activeIndex].name}. Preview only; other performers stay in place.</p>
    <div className="template-review-grid"><div><TemplatePreview project={source.project.present} positions={result.positions} ids={review.ids} original={source.project.present.sets[source.selection.activeIndex].positions}
      center={placement.center} onCenter={center => update({ center })} snap={c.snap} disabled={draft.pending || !!stale} />
    <p className="microcopy">Drag the center handle or use arrows (1 yd; Shift 0.1 yd). Numeric fields give exact placement. The handle follows field snapping.</p></div>
    <div className="template-parameters">
      <NumberField label="Template center X · yd" value={display(placement.center.x)} min={0} max={c.project.field.width} step={.1} onDraftChange={draft.update} onChange={x => update({ center: { ...placement.center, x } })} />
      <NumberField label="Template center Y · yd" value={Math.min(c.project.field.height, display(placement.center.y))} min={0} max={c.project.field.height} step={.1} onDraftChange={draft.update} onChange={y => update({ center: { ...placement.center, y } })} />
      <NumberField label="Template rotation · °" value={placement.rotation} min={-3600} max={3600} onDraftChange={draft.update} onChange={rotation => update({ rotation })} />
      <label className="form-label">Assignment<select aria-label="Template assignment" value={placement.assignment} disabled={draft.pending} onChange={e => update({ assignment: e.target.value as 'position' | 'roster' })}><option value="position">Positional order</option><option value="roster">Cast order</option></select></label>
      {geometry.kind === 'parametric' && <>
        <NumberField label="Template width · yd" value={geometry.width} min={.1} max={200} step={.1} onDraftChange={draft.update} onChange={width => options({ width })} />
        {geometry.shape !== 'line' && <NumberField label="Template depth · yd" value={geometry.height} min={0} max={200} step={.1} onDraftChange={draft.update} onChange={height => options({ height })} />}
        {geometry.shape === 'block' && <NumberField label="Template columns" value={geometry.columns} min={1} max={500} integer onDraftChange={draft.update} onChange={columns => options({ columns })} />}
      </>}
    </div></div>
    {(stale || result.error) && <p className="field-error" role="alert">{stale || result.error}</p>}
    {result.travel && <p className="microcopy" role="status">Total travel {result.travel.total.toFixed(2)} yd · longest {result.travel.maximum.toFixed(2)} yd. Dashed lines show destination travel, not a clearance guarantee.</p>}
    <div className="template-apply"><HelpButton title="Apply saved formation" command="templates.apply" className="button primary" disabled={!!stale || !!result.error || !result.changed || draft.pending || !!c.fileOperation}
      disabledReason={stale || result.error || (draft.pending ? 'Finish or cancel the pending input.' : 'The preview matches the current positions.')}
      onClick={() => { if (c.dispatch('templates.apply', review) === true) c.notify('Saved formation applied. Undo restores the previous picture.'); }}>Apply saved formation</HelpButton></div>
  </section>;
}

function CaptureTemplate({ controller: c, draft, onSaved }: { controller: EditorController; draft: ReturnType<typeof useTemplateDraft>; onSaved: (index: number) => void }) {
  const [source] = useState(() => c.store.getState());
  const [kind, setKind] = useState<'show' | 'snapshot' | 'parametric'>('show');
  const [name, setName] = useState('');
  const [includeSectionNames, setIncludeSectionNames] = useState(false);
  const [shape, setShape] = useState<FormationKind>(c.formation);
  const [options, setOptions] = useState<FormationOptions>({ center: { x: 50, y: 25 }, width: c.formationWidth, height: c.formationHeight, columns: c.formationColumns, rotation: 0 });
  const ids = useMemo(() => source.project.present.performers.filter(p => source.selection.selectedIds.includes(p.id)).map(p => p.id), [source]);
  // Naming a template must not revalidate every picture in a maximum-size production.
  const { entry, error } = useMemo(() => {
    try {
      if (kind !== 'show' && !ids.length) throw new Error('Select performers on the field before saving a formation.');
      const entry = kind === 'show' ? captureShowTemplate(source.project.present, 'Ensemble setup', { includeSectionNames })
        : kind === 'snapshot' ? captureFormationSnapshot(source.project.present, source.selection.activeIndex, ids, 'Saved picture')
        : captureParametricFormation('Reusable shape', shape, options, ids.length);
      return { entry, error: '' };
    } catch (reason) { return { entry: null, error: (reason as Error).message }; }
  }, [source, ids, kind, includeSectionNames, shape, options]);
  const stale = source.project.revision !== c.store.getState().project.revision || source.ui.projectEpoch !== c.projectEpoch;
  const allowed = c.templates.status === 'saved' && c.templates.library.entries.length < TEMPLATE_LIMITS.entries;
  return <section aria-label="Save a template">
    <h3>Save from this production</h3>
    <label className="form-label">Template name<input autoFocus aria-label="Template name" value={name} maxLength={160} onChange={e => setName(e.target.value)} placeholder="Name this reusable setup or shape" /></label>
    <label className="form-label">Save as<select aria-label="Template kind" value={kind} disabled={draft.pending} onChange={e => setKind(e.target.value as typeof kind)}><option value="show">Ensemble setup</option><option value="snapshot">Selected dot picture</option><option value="parametric">Reusable parametric shape</option></select></label>
    {kind === 'show' ? <label className="template-checkbox"><input type="checkbox" checked={includeSectionNames} onChange={e => setIncludeSectionNames(e.target.checked)} />Include current section names (may contain personal text)</label>
      : <p className="microcopy">{ids.length} selected on set {source.selection.activeIndex + 1}. {kind === 'snapshot' ? 'Saves only their relative dot geometry; applying needs the same member count.' : 'Saves shape parameters; applying can adapt to a different member count.'}</p>}
    {kind !== 'show' && !canEditPositions(source) && <p className="field-error" role="alert">Pause at a set with full-show editing to capture a formation.</p>}
    {kind === 'parametric' && <><label className="form-label">Shape<select aria-label="Template shape" value={shape} disabled={draft.pending} onChange={e => setShape(e.target.value as FormationKind)}>{(['line', 'arc', 'circle', 'block', 'curve'] as const).map(value => <option key={value} value={value}>{value === 'curve' ? 'Wave' : value[0].toUpperCase() + value.slice(1)}</option>)}</select></label><div className="template-parameters">
      <NumberField label="Saved shape width · yd" value={options.width} min={.1} max={200} step={.1} onDraftChange={draft.update} onChange={width => setOptions({ ...options, width })} />
      {shape !== 'line' && <NumberField label="Saved shape depth · yd" value={options.height} min={0} max={200} step={.1} onDraftChange={draft.update} onChange={height => setOptions({ ...options, height })} />}
      {shape === 'block' && <NumberField label="Saved shape columns" value={options.columns} min={1} max={500} integer onDraftChange={draft.update} onChange={columns => setOptions({ ...options, columns })} />}
    </div></>}
    {entry?.kind === 'show' && <ShowTemplateSummary template={entry} />}
    <p className="template-disclosure">Included: the name you enter{kind === 'show' ? ', field, opening tempo, section colors and counts' : ', member count and geometry'}. {kind === 'show' ? includeSectionNames ? 'Current section names are included.' : 'Section names become Section 1, Section 2, etc.' : 'No section or roster information.'} Performer names, labels, identifiers, recordings, production titles and notes are excluded.</p>
    {(error || stale) && <p className="field-error" role="alert">{stale ? 'The production changed. Cancel and reopen Save new template.' : error}</p>}
    <HelpButton title="Save template to library" className="button primary" disabled={!entry || !name.trim() || draft.pending || !allowed || stale || kind !== 'show' && !canEditPositions(source)}
      disabledReason={error || (!name.trim() ? 'Enter a template name.' : !allowed ? 'Wait for library storage or remove an entry if the library is full.' : 'Finish or cancel the pending input.')}
      onClick={() => { const index = c.templates.library.entries.length; void c.templates.add({ ...entry!, name: name.trim() }).then(saved => { if (saved) onSaved(index); }); }}>Save template to library</HelpButton>
  </section>;
}

export function TemplatesPanel({ controller: c }: { controller: EditorController }) {
  const draft = useTemplateDraft(c);
  const [selected, setSelected] = useState<number | null>(c.templates.library.entries.length ? 0 : null);
  const [reviewToken, setReviewToken] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [rename, setRename] = useState('');
  const [imported, setImported] = useState<TemplateLibrary | null>(null);
  const [exporting, setExporting] = useState<TemplateLibrary | null>(null);
  const [ioBusy, setIoBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const entry = selected === null ? undefined : c.templates.library.entries[selected];
  const writable = c.templates.status === 'saved' && !ioBusy;
  const clear = () => { draft.clear(); setError(''); setNotice(''); setImported(null); setExporting(null); };
  const close = () => { draft.clear(); c.setDialog(null); };
  const choose = (index: number) => { clear(); setCapturing(false); setSelected(index); setReviewToken(n => n + 1); setRename(''); };
  const read = async (load: () => Promise<string | null>) => {
    setIoBusy(true); setError(''); setNotice('');
    try { const text = await load(); if (text !== null && mounted.current) { const next = parseTemplateLibrary(text); clear(); setCapturing(false); setImported(next); } }
    catch (reason) { if (mounted.current) setError((reason as Error).message); }
    finally { if (mounted.current) setIoBusy(false); }
  };
  const exportFile = async () => {
    if (!exporting) return;
    setIoBusy(true); setError('');
    try {
      const content = serializeTemplateLibrary(exporting);
      if (window.squidware) {
        const destination = await window.squidware.exportTemplateLibrary(content);
        if (!destination) { setNotice('Export canceled.'); return; }
        setNotice('Template library exported.');
      } else {
        const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
        const a = document.createElement('a'); a.href = url; a.download = 'Squidware-templates.squidlib'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice('Template library download requested.');
      }
      setExporting(null);
    } catch (reason) { setError((reason as Error).message); }
    finally { setIoBusy(false); }
  };
  return <Modal title="Templates" wide className="templates-modal" onClose={close}>
    <p className="modal-intro">Your personal library · {c.templates.library.entries.length}/{TEMPLATE_LIMITS.entries} entries. Saved on this device, separately from productions.</p>
    <div className="template-toolbar">
      <HelpButton title="Save new template" className="button subtle" disabled={!writable || draft.pending} disabledReason="Finish the pending input and wait for personal library storage." onClick={() => { clear(); setCapturing(true); }}><Plus size={15} />Save new template</HelpButton>
      <HelpButton title="Import template library" className="button subtle" disabled={!writable || draft.pending} disabledReason="Finish the pending input and wait for personal library storage." onClick={() => window.squidware ? void read(() => window.squidware!.openTemplateLibrary()) : input.current?.click()}><Upload size={15} />Import library</HelpButton>
      <HelpButton title="Review library export" className="button subtle" disabled={!c.templates.library.entries.length || ioBusy || draft.pending} disabledReason="Add templates and finish the pending input before exporting." onClick={() => { clear(); setCapturing(false); setExporting(c.templates.library); }}><Download size={15} />Export library</HelpButton>
    </div>
    {c.templates.status === 'loading' && <p role="status">Loading your library…</p>}
    {c.templates.status === 'saving' && <p role="status">Saving personal library…</p>}
    {(error || c.templates.error) && <p className="field-error" role="alert">{error || c.templates.error}</p>}
    {notice && <p role="status">{notice}</p>}
    <input ref={input} type="file" aria-label="Template library file" accept=".squidlib,.json,application/json" hidden onChange={event => {
      const file = event.target.files?.[0]; event.target.value = '';
      if (file) void read(async () => { if (file.size > TEMPLATE_LIMITS.bytes) throw new Error('Choose a library up to 1 MiB.'); return file.text(); });
    }} />
    <div className="template-layout">
      <nav className="template-list" aria-label="Saved templates">
        {!c.templates.library.entries.length && <p className="microcopy">Your library is empty. Save a setup or formation, or import a shared library.</p>}
        {c.templates.library.entries.map((item, i) => <button key={i} aria-pressed={!capturing && !imported && !exporting && selected === i} disabled={draft.pending || ioBusy || c.templates.status === 'saving'} onClick={() => choose(i)}><strong>{item.name}</strong><span>{describe(item)}</span></button>)}
      </nav>
      <div className="template-detail">
        {capturing ? <CaptureTemplate controller={c} draft={draft} onSaved={index => { clear(); setCapturing(false); setSelected(index); }} />
          : imported ? <section aria-label="Review imported templates"><h3>Review library import</h3><p>{imported.entries.length} incoming templates. They will be added to your library; existing entries stay in place. Duplicate names are allowed.</p><ul>{imported.entries.map((item, i) => <li key={i}>{item.name} · {describe(item)}</li>)}</ul>
            {imported.entries.length + c.templates.library.entries.length > TEMPLATE_LIMITS.entries && <p className="field-error" role="alert">This import would exceed 100 entries. Remove templates or use a smaller library.</p>}
            <div className="modal-actions"><button className="button subtle" onClick={clear}>Cancel import</button><HelpButton title="Add imported templates" className="button primary" disabled={!writable || !imported.entries.length || imported.entries.length + c.templates.library.entries.length > TEMPLATE_LIMITS.entries} onClick={() => { const index = c.templates.library.entries.length; void c.templates.importEntries(imported).then(saved => { if (saved) { clear(); setSelected(index); setNotice('Imported templates saved to your personal library.'); } }); }}>Add imported templates</HelpButton></div></section>
          : exporting ? <section aria-label="Review template export"><h3>Review library export</h3><p>The file includes these template names and settings. Review free text before sharing.</p><ul>{exporting.entries.map((item, i) => <li key={i}><strong>{item.name}</strong> · {describe(item)}{item.kind === 'show' && <span className="template-export-sections">Sections: {item.sections.map(s => s.name).join(', ')}</span>}</li>)}</ul><p className="template-disclosure">Performer names, labels, identifiers, production titles/notes, recordings and file paths are excluded. Template and section names can contain personal information. No upload.</p><div className="modal-actions"><button className="button subtle" disabled={ioBusy} onClick={clear}>Cancel export</button><HelpButton title="Export library file" className="button primary" disabled={ioBusy} onClick={() => void exportFile()}>Export library file</HelpButton></div></section>
          : entry ? <section key={`${selected}:${entry.name}:${reviewToken}`}><div className="template-heading"><BookOpen size={18} /><h3>{entry.name}</h3></div><p className="microcopy">{describe(entry)}</p>
            {entry.kind === 'show' ? <><ShowTemplateSummary template={entry} /><ShowTemplatePreview template={entry} />
              <HelpButton title="Use ensemble setup" className="button primary" disabled={!!c.fileOperation} onClick={() => c.replaceProduction(productionFromTemplate(entry))}>Create production from setup</HelpButton></>
              : <FormationTemplateReview entry={entry} controller={c} draft={draft} />}
            <details className="template-management"><summary>Rename, export or remove</summary><label className="form-label">New template name<input aria-label="Rename template" value={rename} maxLength={160} placeholder={entry.name} onChange={e => setRename(e.target.value)} /></label><div className="template-toolbar"><HelpButton title="Rename saved template" className="button subtle" disabled={!writable || !rename.trim() || draft.pending} onClick={() => { void c.templates.rename(selected!, rename.trim()).then(saved => { if (saved) setRename(''); }); }}>Rename</HelpButton>
              <HelpButton title="Review selected template export" className="button subtle" disabled={draft.pending || ioBusy} onClick={() => { clear(); setExporting({ ...emptyTemplateLibrary(), entries: [entry] }); }}>Export selected</HelpButton>
              <HelpButton title="Remove saved template" className="button subtle" disabled={!writable || draft.pending} onClick={() => { if (window.confirm(`Remove “${entry.name}” from your personal library? Export a copy first to keep it. This does not change the production.`)) void c.templates.remove(selected!).then(saved => { if (saved) { setSelected(null); setRename(''); } }); }}>Remove from library</HelpButton></div></details>
          </section> : <section className="template-empty"><BookOpen size={28} /><h3>Reuse your next good starting point</h3><p>Save an ensemble setup, a selected dot picture, or an adaptable shape. Select a formation to preview placement before applying it.</p></section>}
      </div>
    </div>
    <div className="modal-actions"><button className="button subtle" onClick={close}>Cancel / close</button></div>
  </Modal>;
}
