

import { ArrowRight, ShieldCheck } from 'lucide-react';

import { countToSeconds } from '../domain';

import { Button } from './EditorControls';

import type { EditorController } from './useEditorController';

export function ProductionWorkspace({ controller }: { controller: EditorController }) {
  const { project, setWorkspace, setDialog, duration, selectSet } = controller;
  return (<div className="production-workspace"><div className="production-stats"><div><span>PERFORMERS</span><strong>{project.performers.length}</strong><small>{project.sections.length} sections</small></div><div><span>SETS</span><strong>{project.sets.length}</strong><small>{duration} counts</small></div><div><span>RUN TIME</span><strong>{Math.floor(countToSeconds(project, duration) / 60)}:{String(Math.round(countToSeconds(project, duration) % 60)).padStart(2, '0')}</strong><small>at written tempos</small></div></div><div className="production-table"><table><thead><tr><th>Set</th><th>Counts</th><th>BPM</th><th>Rehearsal notes</th><th /></tr></thead><tbody>{project.sets.map((set, i) => <tr key={set.id}><td><span className="set-number">{String(i + 1).padStart(2, '0')}</span>{set.name}</td><td>{set.counts}</td><td>{set.tempo}</td><td>{set.notes || '—'}</td><td><Button title={`Edit set ${i + 1}`} onClick={() => { selectSet(i); setWorkspace('design'); }}><ArrowRight size={16} /></Button></td></tr>)}</tbody></table></div><div className="production-note"><ShieldCheck size={21} /><div><h3>Designed for the rehearsal field</h3><p>Review transitions in 3D, check performer spacing, and export field charts and individual coordinate sheets.</p></div><button className="button subtle" onClick={() => setDialog('export')}>Export packet<ArrowRight size={15} /></button></div></div>);
}
