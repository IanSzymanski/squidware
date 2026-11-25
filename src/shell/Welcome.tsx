import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, FolderOpen, LifeBuoy, Play, Plus } from 'lucide-react';
import { createBlankProject } from '../domain';
import { productionFromTemplate } from '../templates/production';
import type { ShowTemplate } from '../templates/library';
import type { Project } from '../types';
import { CommandKeycaps } from '../editor/ControlHelp';
import type { EditorController } from '../editor/useEditorController';
import { SquidMark } from '../ui/icons';

const SECTIONS = [
  { name: 'Brass', color: '#f0bf62', prefix: 'B' }, { name: 'Woodwinds', color: '#b9a1e5', prefix: 'W' },
  { name: 'Percussion', color: '#85c9dd', prefix: 'P' }, { name: 'Guard', color: '#e3a08b', prefix: 'G' },
] as const;
/** Starting ensembles: enough performers on the field to write a first set straight away. */
const STARTS = [
  { id: 'small', name: 'Small band', counts: [16, 8, 4, 4] },
  { id: 'band', name: 'Marching band', counts: [32, 16, 8, 8] },
  { id: 'large', name: 'Large band', counts: [56, 32, 16, 16] },
  { id: 'corps', name: 'Drum corps', counts: [76, 0, 34, 40] },
] as const;

function starterProject(counts: readonly number[]): Project {
  const blank = createBlankProject();
  const sections = SECTIONS.map((section, i) => ({ ...section, count: counts[i] })).filter(section => section.count > 0);
  const template: ShowTemplate = { kind: 'show', name: 'Starter', field: blank.field, openingTiming: blank.openingTiming, sections: sections.map(({ name, color, count }) => ({ name, color, count })) };
  const project = productionFromTemplate(template);
  // Labels a writer can read at a glance: B1, W1, P1, G1.
  let offset = 0;
  const performers = sections.flatMap(section => {
    const members = project.performers.slice(offset, offset + section.count).map((performer, i) => ({ ...performer, label: `${section.prefix}${i + 1}` }));
    offset += section.count;
    return members;
  });
  return { ...project, title: 'Untitled show', ensemble: 'My ensemble', performers };
}

/** Shown once at launch over the sample show: start something new, open a file, or look around. */
export function Welcome({ controller: c, onClose }: { controller: EditorController; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  useLayoutEffect(() => { const node = dialog.current; node?.showModal(); node?.focus(); return () => node?.close(); }, []);
  const recoveries = c.recovery.versions.length;
  const totals = useMemo(() => STARTS.map(start => (start.counts as readonly number[]).reduce((sum, n) => sum + n, 0)), []);
  async function create(project: Project, cast = false) {
    setBusy(true);
    try {
      const before = c.store.getState().ui.projectEpoch;
      await c.replaceProduction(project);
      if (c.store.getState().ui.projectEpoch === before) return;
      onClose();
      // An empty field starts with its cast: open the roster and the Add performers dialog.
      if (cast) { c.dispatch('cast.show', { mode: 'panel' }); c.setDialog('add-cast'); }
    } finally { setBusy(false); }
  }
  return <dialog ref={dialog} tabIndex={-1} className="welcome" aria-labelledby="welcome-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="welcome-hero">
      <SquidMark size={40} />
      <h1 id="welcome-title">Write your show</h1>
      <p>Pick an ensemble and you are on the field with dots to move. Everything stays on this computer.</p>
    </div>
    <div className="welcome-body">
      <section aria-labelledby="welcome-new">
        <h2 id="welcome-new">Start a new show</h2>
        <div className="welcome-starts">
          {STARTS.map((start, i) => <button key={start.id} type="button" className="welcome-start" disabled={busy} onClick={() => void create(starterProject(start.counts))}>
            <span className="welcome-start-count">{totals[i]}</span>
            <strong>{start.name}</strong>
            <span className="welcome-start-sections">{SECTIONS.map((section, s) => start.counts[s] > 0 && <i key={section.name} style={{ background: section.color, flexGrow: start.counts[s] }} title={`${section.name} ${start.counts[s]}`} />)}</span>
          </button>)}
        </div>
        <button type="button" className="welcome-link" disabled={busy} onClick={() => void create(createBlankProject(), true)}><Plus size={14} />Empty field — I'll add my own cast</button>
      </section>
      <section aria-labelledby="welcome-continue" className="welcome-actions">
        <h2 id="welcome-continue">Or pick up where you left off</h2>
        <button type="button" className="welcome-action" disabled={busy} onClick={() => { onClose(); void c.openProject(); }}>
          <FolderOpen size={18} /><span><strong>Open a show…</strong><small>A .squid file from this computer</small></span><CommandKeycaps command="file.open" />
        </button>
        <button type="button" className="welcome-action" onClick={onClose}>
          <Play size={18} /><span><strong>Explore the demo</strong><small>Tether · 165 performers, 67 sets</small></span><ArrowRight size={15} />
        </button>
        {recoveries > 0 && <button type="button" className="welcome-action" onClick={() => { onClose(); c.setDialog('recovery'); void c.recovery.refresh(); }}>
          <LifeBuoy size={18} /><span><strong>Recovery copies</strong><small>{recoveries} automatic {recoveries === 1 ? 'copy' : 'copies'} on this computer</small></span><ArrowRight size={15} />
        </button>}
      </section>
    </div>
  </dialog>;
}
