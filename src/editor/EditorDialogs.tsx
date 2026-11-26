import { lazy, Suspense } from 'react';
import './panels.css';
import { SurfaceSettings } from './SurfaceSettings';
import { ChoreographyPanel } from './ChoreographyPanel';
import { StagingPanel } from './StagingPanel';
import { EquipmentSelect } from './EquipmentSelect';
import { CastWorkspace } from './CastWorkspace';
import { GroupMotionPanel } from './GroupMotionPanel';
import { AssignmentPanel } from './AssignmentPanel';
import { FormationTransitionPanel } from './FormationTransitionPanel';
import { PathPanel } from './PathPanel';
import { AudioAlignmentPanel } from './AudioAlignmentPanel';
import { TempoPanel } from './TempoPanel';
import { AudioPackagePanel } from './AudioPackagePanel';
import { ScorePanel } from './ScorePanel';
import { MetronomePanel } from './MetronomePanel';
import { shortcutCommands } from './commands';
import { CommandKeycaps, HelpButton } from './ControlHelp';
import { commandKeycaps } from './shortcutDisplay';

import { Check, ChevronRight, Download, Grid2X2, Plus, ShieldCheck, Users } from 'lucide-react';

import { PROJECT_LIMITS, COORDINATE_CONVENTIONS, coordinatePrecisionLabel } from '../domain';
import { isCustomSurface } from '../surfaces';

import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { NumberField } from '../components/NumberField';

import { HistoryPanel } from './HistoryPanel';
import { PreferencesPanel } from './PreferencesPanel';
import { SnappingPanel } from './SnappingPanel';
import { RecoveryPanel } from './RecoveryPanel';
import { CommitInput, CommitColor, MiniField } from './EditorControls';

import type { EditorController } from './useEditorController';
import { ProblemsPanel } from './ProblemsPanel';
import { AnalysisRulesPanel } from './AnalysisRulesPanel';
import { RehearsalPanel } from './RehearsalPanel';
import { SetCreationPanel } from './SetCreationPanel';
import { SplitTransitionPanel } from './SplitTransitionPanel';
import { TemplatesPanel } from './TemplatesPanel';
import { NewProductionPanel } from './NewProductionPanel';

const RehearsalVideoPanel = lazy(() => import('./RehearsalVideoPanel'));

export function EditorDialogs({ controller }: { controller: EditorController }) {
  const { project, dispatch, selectedIds, dialog, setDialog, setPendingDraft, castAmount, setCastAmount, castSection, setCastSection, castPrefix, setCastPrefix, rosterInput, activeSet, removeSet, addCast, removeCast } = controller;
  return (<>
    {dialog === 'choreography' && <ChoreographyPanel controller={controller} />}
    {dialog === 'staging' && <StagingPanel controller={controller} />}
    {dialog === 'cast-table' && <Modal title="Full Cast table" wide onClose={() => setDialog(null)}><CastWorkspace controller={controller} /></Modal>}
    {dialog === 'group-motion' && <GroupMotionPanel controller={controller} />}
    {dialog === 'formation-transition' && <FormationTransitionPanel controller={controller} />}
    {dialog === 'assignment' && <AssignmentPanel controller={controller} />}
    {dialog === 'path' && <PathPanel controller={controller} />}
    {dialog === 'templates' && <TemplatesPanel controller={controller} />}
    {dialog === 'new' && <NewProductionPanel controller={controller} />}
    {dialog === 'package' && <AudioPackagePanel controller={controller} />}
    {dialog === 'audio-alignment' && <AudioAlignmentPanel controller={controller} />}
    {dialog === 'tempo' && <TempoPanel controller={controller} />}
    {dialog === 'score' && <ScorePanel controller={controller} />}
    {dialog === 'metronome' && <MetronomePanel controller={controller} />}
    {dialog === 'problems' && <ProblemsPanel controller={controller} />}
    {dialog === 'analysis-rules' && <AnalysisRulesPanel controller={controller} />}
    {dialog === 'rehearsal' && <RehearsalPanel controller={controller} />}
    {dialog === 'set-split' && <SplitTransitionPanel controller={controller} />}
    {dialog === 'set-create' && <SetCreationPanel controller={controller} />}
    {dialog === 'recovery' && <RecoveryPanel recovery={controller.recovery} onClose={() => setDialog(null)} />}
    {dialog === 'preferences' && <PreferencesPanel controller={controller} />}
    {dialog === 'snapping' && <SnappingPanel controller={controller} />}
    {dialog === 'history' && <HistoryPanel onClose={() => setDialog(null)} />}
    {dialog === 'settings' && <Modal title="Production settings" onClose={() => setDialog(null)}><label className="form-label">Production title<CommitInput onDraftChange={setPendingDraft} value={project.title} maxLength={PROJECT_LIMITS.text.title} onCommit={title => dispatch('project.update', { title })} /></label><label className="form-label">Ensemble<CommitInput allowEmpty value={project.ensemble} onDraftChange={setPendingDraft} maxLength={PROJECT_LIMITS.text.ensemble} onCommit={ensemble => dispatch('project.update', { ensemble })} /></label><SurfaceSettings key={project.id} controller={controller} /><NumberField onDraftChange={setPendingDraft} label="Audio sync offset · seconds" value={project.audioOffsetSeconds} min={PROJECT_LIMITS.audioOffsetSeconds.min} max={PROJECT_LIMITS.audioOffsetSeconds.max} step={0.1} onChange={value => dispatch('project.update', { audioOffsetSeconds: value })} /><p className="microcopy">Positive offset starts the music later in the track; negative offset delays the music. Plain .squid files save the offset. Use Export → Portable production to include or reference the recording.</p><button className="button subtle" onClick={() => dispatch('dialog.open', { dialog: 'metronome' })}>Metronome and count-in…</button><h3 className="modal-subtitle">Ensemble sections</h3>{project.sections.map(section => <div className="section-edit" key={section.id}><CommitColor label={`${section.name} color`} value={section.color} onDraftChange={setPendingDraft} onCommit={color => dispatch('section.update', { id: section.id, update: { color } })} /><CommitInput onDraftChange={setPendingDraft} label="Section name" value={section.name} maxLength={PROJECT_LIMITS.text.sectionName} onCommit={name => dispatch('section.update', { id: section.id, update: { name } })} /><EquipmentSelect
      label={`Default 3D equipment for ${section.name}`} value={section.equipment} onChange={equipment => dispatch('section.update', { id: section.id, update: { equipment } })} /></div>)}<button className="button subtle" onClick={() => dispatch('section.add')} disabled={project.sections.length >= PROJECT_LIMITS.sections}><Plus size={14} />Add section</button><div className="modal-actions"><button className="button primary" onClick={() => setDialog(null)}>Done</button></div></Modal>}
    {dialog === 'video-export' && <Suspense fallback={<Modal title="Rehearsal video" onClose={() => setDialog(null)}><p role="status">Loading video export…</p></Modal>}><RehearsalVideoPanel controller={controller} /></Suspense>}
    {dialog === 'export' && <ExportPanel controller={controller} />}
    {dialog === 'add-cast' && <Modal title="Add performers" onClose={() => setDialog(null)}><p className="modal-intro">New performers are added to every set, with starting positions near the front sideline.</p><div className="form-row"><NumberField onDraftChange={setPendingDraft} label="Number of performers" value={castAmount} min={1} max={Math.max(1, PROJECT_LIMITS.performers - project.performers.length)} integer disabled={project.performers.length >= PROJECT_LIMITS.performers} onChange={value => setCastAmount(Math.round(value))} /><label className="form-label">Label prefix<input value={castPrefix} maxLength={6} onChange={e => setCastPrefix(e.target.value)} /></label></div><label className="form-label">Section<select value={castSection} onChange={e => setCastSection(e.target.value)}>{project.sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><div className="modal-actions"><button className="button subtle" onClick={() => rosterInput.current?.click()}>Import CSV instead</button><button className="button primary" disabled={project.performers.length >= PROJECT_LIMITS.performers} onClick={() => addCast()}><Plus size={16} />Add performers</button></div><p className="microcopy">CSV headers: label,name,section. Section names must match an existing section. Labels must be unique.</p></Modal>}
    {dialog === 'remove-cast' && <Modal title={`Remove ${selectedIds.length} performers?`} onClose={() => setDialog(null)}><p className="modal-intro">Their positions will be removed from every set. You can undo this change.</p><div className="modal-actions"><button className="button subtle" onClick={() => setDialog(null)}>Cancel</button><button className="button danger" onClick={removeCast}>Remove performers</button></div></Modal>}
    {dialog === 'remove-set' && <Modal title={`Delete “${activeSet.name}”?`} onClose={() => setDialog(null)}><p className="modal-intro">The adjacent sets will connect directly. You can undo this change.</p><div className="modal-actions"><button className="button subtle" onClick={() => setDialog(null)}>Keep set</button><button className="button danger" onClick={removeSet}>Delete set</button></div></Modal>}
    {dialog === 'help' && <Modal title="Help" onClose={() => setDialog(null)} wide><p className="modal-intro">Squidware is an independent desktop drill design studio. Start with a cast, shape each set, then rehearse the transitions.</p><div className="guide-grid"><section><h3>1. Build your production</h3><p>Open the project menu for a blank production, a demo, or a saved .squid file. Add performers in Cast; customize sections in Production settings in the project menu. Personal display and editing defaults are in Preferences in the same menu.</p><h3>2. Shape the field</h3><p>Click, Shift-click, or drag a selection box; Shift-drag adds a box. Drag dots or use formation tools. Click a section in the legend to select its performers. Changes affect the current set.</p><h3>Coordinate conventions</h3><p>{COORDINATE_CONVENTIONS} Choose whole, half or quarter steps in Preferences. Rounding affects output only. Goal lines are named explicitly; midfield has no side assignment. College hashes are 20 yd from each sideline; high-school hashes are 17 7/9 yd. Equal-distance reference ties use the back reference. Dot sheets include arrival coordinates and incoming move sizes.</p><h3>Split a transition</h3><p>Choose Split transition in Set properties or the Command palette. Preview a new picture at a whole count inside the incoming move. Counts and duration stay unchanged. Eased moves show a comparison and require accepting two constant-speed parts before Apply. Cancel keeps the original move.</p><h3>3. Rehearse & export</h3><p>Counts define the move into a set. Set tempo per transition, attach audio, and switch to 3D. In 3D, drag to orbit, right-drag to pan and scroll to zoom. Review transition checks, then export your rehearsal packet.</p></section><section><h3>Keyboard shortcuts</h3><p>Search commands and drill phrases in the Command palette. Change bindings in Preferences → Keyboard shortcuts. Tab switches focus normally; the field keeps its arrow-key navigation and Alt+arrow nudges. In the field, arrows move focus between performers, Enter or Space selects and Shift+Enter adds or removes. In the Set list, ↑/↓ move between sets and Alt+↑/↓ moves the focused set one position; search the palette for Move current set to position to jump directly. In the palette, ↑/↓ explore results, Enter runs or previews and Escape closes. Turn Show hints off in Preferences to hide these tips in panels; tooltips keep them.</p><dl className="shortcut-list">{shortcutCommands.filter(({ id }) => commandKeycaps(id, undefined, undefined, undefined, controller.preferences.value.shortcutBindings).length).map(({ id, name }) => <div key={id}><dt>{name}</dt><dd><CommandKeycaps command={id} /></dd></div>)}</dl></section></div><div className="help-note"><ShieldCheck size={18} /><p>Your production stays on this device. Recovery saves automatically; use Save for a portable project file. This release does not import proprietary Pyware files or provide cloud collaboration. Geometric checks are rehearsal aids. Review body clearance and traffic on the field. 3D figures are rehearsal markers, not uniform or instrument simulations.</p></div></Modal>}
    {/* A sibling, never a child of another Modal, so it opens on top and Escape cancels only the confirmation. */}
    {controller.confirmation && <ConfirmDialog {...controller.confirmation} onCancel={() => controller.settleConfirmation(false)} onConfirm={() => controller.settleConfirmation(true)} />}
  </>);
}

const papers = [['letter', 'Letter'], ['a4', 'A4']] as const;
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** Export: the PDF drill book with what it covers and its paper, then the other formats with what each one holds. */
/** The first page of the PDF, drawn small from the production itself: its opening chart, or its first performer's sheet. */
function ExportPreview({ controller, mode }: { controller: EditorController; mode: string }) {
  const { project, thumbnailDots } = controller;
  const first = project.sets[0], performer = project.performers[0];
  const section = performer && project.sections.find(candidate => candidate.id === performer.sectionId);
  const rows = Math.min(9, project.sets.length);
  return <figure className="export-preview">
    <svg viewBox="0 0 110 85" role="img" aria-label={mode === 'charts' ? 'First page: the opening set’s field chart' : 'First page: the first performer’s coordinate sheet'}>
      <rect width="110" height="85" rx="1.5" className="export-preview-paper" />
      {mode === 'charts' ? <>
        <text x="6" y="9" className="export-preview-title">{project.title}</text>
        <text x="6" y="14" className="export-preview-text">Set 1 · {first.name}</text>
        <svg x="6" y="17" width="98" height="54" viewBox="3 3 104 59"><MiniField positions={first.positions} dots={thumbnailDots} field={project.field} /></svg>
        <path d="M6,75h70M6,79h52" className="export-preview-rule" />
      </> : <>
        <text x="6" y="9" className="export-preview-title">{performer ? `${performer.label}${performer.name ? ` · ${performer.name}` : ''}` : project.title}</text>
        <text x="6" y="14" className="export-preview-text">{section?.name ?? 'Coordinate sheet'}</text>
        <path d="M6,19h98" className="export-preview-rule strong" />
        {Array.from({ length: rows }, (_, i) => <g key={i}>
          <text x="6" y={25.5 + i * 6.2} className="export-preview-text">{i + 1}</text>
          <path d={`M14,${24 + i * 6.2}h${[52, 46, 58, 40, 50, 44, 56, 48, 42][i]}M78,${24 + i * 6.2}h${[20, 24, 18, 22, 26, 20, 16, 24, 22][i]}`} className="export-preview-rule" />
        </g>)}
      </>}
    </svg>
    <figcaption>Page 1 of {mode === 'charts' ? project.sets.length : project.performers.length || 1}{mode === 'charts' ? '' : ', before the appendix'}</figcaption>
  </figure>;
}

function ExportPanel({ controller }: { controller: EditorController }) {
  const { project, dispatch, setDialog, printMode, setPrintMode, exportText, exportPdf, preferences, coordinateFormat, index, activeSet } = controller;
  const sets = project.sets.length, performers = project.performers.length;
  // The drill book always covers the whole show; these pages follow the charts or dot books when the production has them.
  const appendix = [(project.tempoMap || project.audioAnchors?.length) && 'Tempo map', project.rehearsal?.length && plural(project.rehearsal.length, 'rehearsal passage')].filter(Boolean);
  const coordinates = isCustomSurface(project.field) ? `coordinates in ${project.field.unit}` : `rounded to ${coordinatePrecisionLabel(coordinateFormat).toLowerCase()}`;
  const contents = [
    ['charts', Grid2X2, 'Field charts', 'One chart per set, with counts and rehearsal notes.'],
    ['coordinates', Users, 'Performer coordinate sheets', 'Individual dot books with positions for every set.'],
  ] as const;
  return <Modal title="Export" onClose={() => setDialog(null)}>
    <section aria-labelledby="export-pdf-title">
      <h3 id="export-pdf-title" className="modal-subtitle">PDF drill book</h3>
      <div className="export-options" role="radiogroup" aria-label="PDF contents">{contents.map(([mode, Icon, name, summary]) => <label key={mode} className={printMode === mode ? 'selected' : ''}>
        <input type="radio" name="print" checked={printMode === mode} onChange={() => setPrintMode(mode)} /><Icon size={16} /><div><strong>{name}</strong><span>{summary}</span></div>{printMode === mode && <Check className="export-check" size={14} aria-hidden="true" />}
      </label>)}</div>
      <div className="export-result">
        <ExportPreview controller={controller} mode={printMode} />
        <div className="export-result-facts">
          {/* What the file will hold, as a sentence; only the paper is a choice. */}
          <p className="export-summary" data-export-scope="">{printMode === 'charts'
            ? <><strong>{sets === 1 ? '1 page' : `${sets} pages`}</strong>, one landscape chart for {sets === 1 ? 'the set' : `each of the ${sets} sets`}.</>
            : <><strong>{performers === 1 ? '1 sheet' : `${performers} sheets`}</strong>, one for each performer, {coordinates}.</>}
            {appendix.length > 0 && <> Then {appendix.join(' and ').replace(/^Tempo map/, 'the tempo map')}.</>}</p>
          <p className="microcopy">The PDF holds one of the two. Export again for the other.</p>
          <div className="export-paper-row"><span id="export-paper-title">Paper</span><span className="export-paper" role="radiogroup" aria-labelledby="export-paper-title">{papers.map(([value, name]) => <label key={value}><input type="radio" name="paper" checked={preferences.value.paperSize === value} onChange={() => preferences.update({ paperSize: value })} />{name}</label>)}</span></div>
        </div>
      </div>
      <button className="button primary export-pdf" onClick={() => void exportPdf()}><Download size={16} />{window.squidware ? 'Save PDF' : 'Print / save PDF'}</button>
    </section>
    <section aria-labelledby="export-other-title">
      <h3 id="export-other-title" className="modal-subtitle">Other formats</h3>
      <div className="export-secondary">
        <HelpButton title="Coordinates CSV" description="Every performer at every set: X and Y coordinates, arrival descriptions, timing, sections and notes." className="button subtle" onClick={() => void exportText('csv')}>Coordinates CSV<Download size={14} /></HelpButton>
        <span className="export-detail">{plural(performers, 'performer')} × {plural(sets, 'set')}</span>
        <HelpButton title="Current chart SVG" description="A scalable drawing of the active set, using the current label visibility." className="button subtle" onClick={() => void exportText('svg')}>Current chart SVG<Download size={14} /></HelpButton>
        <span className="export-detail">Set {index + 1} · {activeSet.name}</span>
        <HelpButton title="Portable production with audio…" description="Review and save a .squidpack with the recording bundled or referenced, to open on another computer." className="button subtle" onClick={() => dispatch('dialog.open', { dialog: 'package' })}>Portable production with audio…<ChevronRight size={14} /></HelpButton>
        <span className="export-detail">.squidpack · drill and recording</span>
        <HelpButton title="Rehearsal video…" description="Render a WebM video of a set range with a chosen camera angle." className="button subtle" onClick={() => dispatch('dialog.open', { dialog: 'video-export' })}>Rehearsal video…<ChevronRight size={14} /></HelpButton>
        <span className="export-detail">WebM · pick sets and camera</span>
      </div>
    </section>
    <p className="microcopy export-note">Exports are snapshots. To keep the editable .squid file, use Save in the Project menu.</p>
  </Modal>;
}
