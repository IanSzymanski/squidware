import { useMemo, useState } from 'react';
import { FilePlus2, Waves } from 'lucide-react';
import { Modal } from '../components/Modal';
import { createBlankProject, createDemoProject } from '../domain';
import { productionFromTemplate } from '../templates/production';
import type { ShowTemplate } from '../templates/library';
import type { EditorController } from './useEditorController';
import { HelpButton } from './ControlHelp';
import { TemplatePreview } from './TemplatePreview';
import './templates.css';

export function ShowTemplateSummary({ template }: { template: ShowTemplate }) {
  return <div className="template-show-summary">
    <p>{template.sections.reduce((n, section) => n + section.count, 0)} performers · {template.field.preset === 'college' ? 'College' : 'High school'} markings · {template.openingTiming.tempo} BPM</p>
    <ul aria-label="Template sections">{template.sections.map((section, i) => <li key={i}><span className="template-swatch" style={{ background: section.color }} />{section.name} · {section.count}</li>)}</ul>
    <p className="microcopy">Fresh anonymous roster and one opening picture. No performer names, recordings or show notes.</p>
  </div>;
}

export function ShowTemplatePreview({ template }: { template: ShowTemplate }) {
  const project = useMemo(() => productionFromTemplate(template), [template]);
  return <TemplatePreview project={project} positions={project.sets[0].positions} />;
}

export function NewProductionPanel({ controller: c }: { controller: EditorController }) {
  const [selected, setSelected] = useState('');
  const shows = c.templates.library.entries.flatMap((entry, i) => entry.kind === 'show' ? [{ entry, index: i }] : []);
  const template = shows.find(item => String(item.index) === selected)?.entry;
  const preview = useMemo(() => template ? productionFromTemplate(template) : null, [template]);
  return <Modal title="New production" onClose={() => c.setDialog(null)}>
    <p className="modal-intro">Create your next production. {c.dirty ? 'Save your current project to a file before replacing it.' : 'Choose a blank field, a saved setup or the sample show.'}</p>
    <div className="new-options"><button disabled={!!c.fileOperation} onClick={() => c.replaceProduction(createBlankProject(), true)}><FilePlus2 size={28} /><strong>Blank production</strong><span>An open field, ready for your ensemble.</span></button><button disabled={!!c.fileOperation} onClick={() => c.replaceProduction(createDemoProject())}><Waves size={28} /><strong>Explore the demo</strong><span>64 performers. Six sets. Find your flow.</span></button></div>
    <h3 className="modal-subtitle">Saved ensemble setup</h3>
    {shows.length ? <><label className="form-label">Show template<select aria-label="Show template" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Choose a saved setup…</option>{shows.map(item => <option key={item.index} value={item.index}>{item.entry.name}</option>)}</select></label>
      {template && preview && <><ShowTemplateSummary template={template} /><TemplatePreview project={preview} positions={preview.sets[0].positions} />
        <HelpButton title="Create from template" className="button primary" disabled={!!c.fileOperation} disabledReason="Wait for the current file operation." onClick={() => c.replaceProduction(preview)}>Create from template</HelpButton></>}
    </> : <p className="microcopy">{c.templates.status === 'loading' ? 'Loading your library…' : 'Save an ensemble setup in Templates to reuse its sections, colors, field and roster counts.'}</p>}
    {c.templates.error && <p className="field-error" role="alert">{c.templates.error}</p>}
    <div className="modal-actions"><HelpButton title="Open Templates" className="button subtle" onClick={() => c.setDialog('templates')}>Templates…</HelpButton>{c.dirty && <button className="button subtle" disabled={!!c.fileOperation} onClick={() => void c.saveProject()}>Save current project first</button>}</div>
  </Modal>;
}
