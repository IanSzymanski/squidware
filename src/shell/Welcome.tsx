import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, FolderOpen, LifeBuoy, Play, Plus, Square } from 'lucide-react';
import { createBlankProject, uid, validateProject } from '../domain';
import type { Point, Project } from '../types';
import type { CustomSurface } from '../surfaces';
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

/** A tidy staging block on the step grid, centered on the field: four-step intervals, about three times as wide as deep. */
function stagingBlock(count: number, width: number, height: number): Point[] {
  const interval = 2.5, step = .625;
  const columns = Math.min(count, Math.max(4, Math.round(Math.sqrt(count * 2.5) / 2) * 2));
  const rows = Math.ceil(count / columns);
  const snap = (value: number) => Math.round(value / step) * step;
  const x0 = snap(width / 2 - (columns - 1) * interval / 2), y0 = snap(height / 2 - (rows - 1) * interval / 2);
  return Array.from({ length: count }, (_, i) => {
    // Center a short last row under the block.
    const row = Math.floor(i / columns), inRow = row === rows - 1 ? count - row * columns : columns;
    return { x: x0 + ((columns - inRow) / 2 + i % columns) * interval, y: y0 + row * interval };
  });
}

function starterSections(counts: readonly number[]) {
  return SECTIONS.map((section, i) => ({ ...section, count: counts[i] })).filter(section => section.count > 0);
}

/** A basketball-court floor, as winter guard and indoor percussion rehearse on: 84 by 50 feet with marks every 6 feet. */
const INDOOR_FLOOR: CustomSurface = { preset: 'indoor', width: 28, height: 16 + 2 / 3, unit: 'ft', referenceInterval: 6 };
const INDOOR_SECTIONS = [{ name: 'Flags', color: '#ffa8cf', prefix: 'F', count: 12 }, { name: 'Rifles', color: '#f0bf62', prefix: 'R', count: 5 }, { name: 'Sabres', color: '#85c9dd', prefix: 'S', count: 3 }] as const;

/** Twenty performers in a block at the middle of an indoor floor. */
function indoorProject(): Project {
  const blank = createBlankProject();
  const sections = INDOOR_SECTIONS.map(section => ({ ...section, id: uid() }));
  const performers = sections.flatMap(section => Array.from({ length: section.count }, (_, i) => ({ id: uid(), sectionId: section.id, label: `${section.prefix}${i + 1}`, name: '' })));
  // Two-yard intervals, five across.
  const columns = 5, interval = 2, rows = Math.ceil(performers.length / columns);
  const x0 = INDOOR_FLOOR.width / 2 - (columns - 1) * interval / 2, y0 = INDOOR_FLOOR.height / 2 - (rows - 1) * interval / 2;
  return validateProject({
    ...blank, field: INDOOR_FLOOR, sections: sections.map(({ id, name, color }) => ({ id, name, color })), performers,
    sets: [{ ...blank.sets[0], positions: Object.fromEntries(performers.map((performer, i) => [performer.id, { x: x0 + i % columns * interval, y: y0 + Math.floor(i / columns) * interval }])) }],
  });
}

function starterProject(counts: readonly number[]): Project {
  const blank = createBlankProject();
  const sections = starterSections(counts).map(section => ({ ...section, id: uid() }));
  // Labels a writer can read at a glance: B1, W1, P1, G1.
  const performers = sections.flatMap(section => Array.from({ length: section.count }, (_, i) => ({ id: uid(), sectionId: section.id, label: `${section.prefix}${i + 1}`, name: '' })));
  const points = stagingBlock(performers.length, blank.field.width, blank.field.height);
  return validateProject({
    ...blank, sections: sections.map(({ id, name, color }) => ({ id, name, color })), performers,
    sets: [{ ...blank.sets[0], positions: Object.fromEntries(performers.map((performer, i) => [performer.id, points[i]])) }],
  });
}

/** The picture a starter opens with, drawn small. */
function StarterPreview({ counts }: { counts: readonly number[] }) {
  const sections = starterSections(counts);
  const colors = sections.flatMap(section => Array.from({ length: section.count }, () => section.color));
  const points = stagingBlock(colors.length, 100, 53.333);
  return <svg className="welcome-start-preview" viewBox="18 12.5 64 28.2" aria-hidden="true">
    {Array.from({ length: 21 }, (_, i) => <path key={i} d={`M${i * 5},0v53.333`} className={i % 2 ? 'minor' : 'major'} />)}
    {points.map((point, i) => <circle key={i} cx={point.x} cy={point.y} r={.8} fill={colors[i]} />)}
  </svg>;
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
      <SquidMark size={36} />
      <div><h1 id="welcome-title">Write your show</h1>
        <p>Pick an ensemble and you are on the field with dots to move.</p></div>
    </div>
    <div className="welcome-body">
      <section aria-labelledby="welcome-new">
        <h2 id="welcome-new">New production</h2>
        <div className="welcome-starts">
          {STARTS.map((start, i) => <button key={start.id} type="button" className="welcome-start" disabled={busy} onClick={() => void create(starterProject(start.counts))}>
            <StarterPreview counts={start.counts} />
            <span className="welcome-start-text"><strong>{start.name}</strong><span>{totals[i]} performers</span></span>
          </button>)}
        </div>
        <div className="welcome-links">
          <button type="button" className="welcome-link" disabled={busy} onClick={() => void create(indoorProject())}><Square size={14} />Indoor floor · winter guard, 20</button>
          <button type="button" className="welcome-link" disabled={busy} onClick={() => void create(createBlankProject(), true)}><Plus size={14} />Empty field, add my own cast</button>
        </div>
      </section>
      <section aria-labelledby="welcome-continue" className="welcome-actions">
        <h2 id="welcome-continue">Continue</h2>
        <button type="button" className="welcome-action" disabled={busy} onClick={() => { onClose(); void c.openProject(); }}>
          <FolderOpen size={18} /><span><strong>Open a production…</strong><small>A .squid file on this computer</small></span><CommandKeycaps command="file.open" />
        </button>
        <button type="button" className="welcome-action" onClick={onClose}>
          <Play size={18} /><span><strong>Explore the demo</strong><small>Tether · 165 performers, 67 sets</small></span><ArrowRight size={15} />
        </button>
        <button type="button" className="welcome-action" onClick={() => { onClose(); c.setDialog('recovery'); void c.recovery.refresh(); }}>
          <LifeBuoy size={18} /><span><strong>Recovery copies</strong><small>{recoveries > 0 ? `${recoveries} automatic ${recoveries === 1 ? 'copy' : 'copies'} on this computer` : 'Automatic copies of your work'}</small></span><ArrowRight size={15} />
        </button>
        <h2 className="welcome-keys-title">Good to know</h2>
        <dl className="welcome-keys">
          <div><dt>Find any action</dt><dd><CommandKeycaps command="palette.open" /></dd></div>
          <div><dt>Play or pause</dt><dd><CommandKeycaps command="playback.toggle" /></dd></div>
          <div><dt>Previous / next set</dt><dd><CommandKeycaps command="set.previous" /><CommandKeycaps command="set.next" /></dd></div>
        </dl>
      </section>
    </div>
  </dialog>;
}
