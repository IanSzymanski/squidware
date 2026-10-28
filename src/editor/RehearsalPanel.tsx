import { compileScore, scoreLabel } from '../score';
import { useState } from 'react';
import { Modal } from '../components/Modal';
import { PROJECT_LIMITS, totalCounts, uid } from '../domain';
import { activePassage, anchorAtCount, resolveAnchor, resolvePassage, validateRehearsal } from '../rehearsal';
import type { Project, RehearsalAnchor, RehearsalPassage } from '../types';
import { useEditorSelector } from './react';
import type { EditorController } from './useEditorController';
import './rehearsal.css';

function Target({ label, project, value, onChange }: { label: string; project: Project; value: RehearsalAnchor; onChange: (value: RehearsalAnchor) => void }) {
  const resolved = resolveAnchor(project, value), key = value.kind === 'set' ? `set:${value.setId}` : `move:${value.moveId}`;
  const choices = [...project.sets.map((set, i) => ({ key: `set:${set.id}`, label: `Set ${i + 1} · ${set.name} · arrival` })),
    ...project.moves.map((move, i) => ({ key: `move:${move.id}`, label: `Move to set ${i + 2} · ${project.sets[i + 1].name}` }))];
  return <fieldset className="rehearsal-target"><legend>{label}</legend><label className="form-label">{label} target<select aria-label={`${label} target`} value={key} onChange={e => {
    const move = project.moves.find(move => `move:${move.id}` === e.target.value);
    onChange(move ? { kind: 'move', moveId: move.id, fromSetId: move.fromSetId, toSetId: move.toSetId, count: 0 } : { kind: 'set', setId: e.target.value.slice(4) });
  }}>{!choices.some(c => c.key === key) && <option value={key}>Missing target — choose a replacement</option>}{choices.map(c => <option value={c.key} key={c.key}>{c.label}</option>)}</select></label>
    {value.kind === 'move' && <label className="form-label">{label} local count<input aria-label={`${label} local count`} type="number" required min="0" max={project.moves.find(m => m.id === value.moveId)?.counts ?? 0} step="any" value={Number.isFinite(value.count) ? value.count : ''} onChange={e => onChange({ ...value, count: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>}
    <p className="microcopy">{resolved.error ?? `${resolved.label} · show count ${Number(resolved.count.toFixed(3))} · ${scoreLabel(compileScore(project),Math.min(totalCounts(project),resolved.count))}`}</p>
  </fieldset>;
}
export function RehearsalPanel({ controller }: { controller: EditorController }) {
  const { project, dispatch } = controller;
  const count = useEditorSelector(s => s.playback.count), rehearsalId = useEditorSelector(s => s.playback.rehearsalId);
  const fresh = (): RehearsalPassage => ({ id: uid(), name: '', notes: '', start: anchorAtCount(project, count), focus: { kind: 'all' } });
  const [draft, setDraft] = useState(fresh), [error, setError] = useState('');
  const saved = activePassage(project, draft.id), resolved = resolvePassage(project, draft);
  const update = (next: Partial<RehearsalPassage>) => { setDraft(p => ({ ...p, ...next })); setError(''); };
  let invalid = '';
  try { validateRehearsal([draft]); invalid = resolved.error ?? ''; } catch (e) { invalid = (e as Error).message; }
  const focusValue = draft.focus.kind === 'all' ? 'all' : draft.focus.kind === 'section' ? `section:${draft.focus.sectionId}` : 'performers';
  return <Modal title="Rehearsal passages" wide onClose={() => controller.setDialog(null)}>
    <p className="modal-intro">Save annotated bookmarks or count ranges. Go to a passage, then use Play and Loop. Section focus changes the rehearsal view; the attached recording remains the full mix.</p>
    <div className="rehearsal-panel"><aside aria-label="Saved rehearsal passages"><button className="button subtle" type="button" disabled={(project.rehearsal?.length ?? 0) >= PROJECT_LIMITS.rehearsalPassages} onClick={() => { setDraft(fresh()); setError(''); }}>New passage</button>
      {!project.rehearsal?.length && <p className="microcopy">No passages saved yet.</p>}
      {project.rehearsal?.map(p => { const r = resolvePassage(project, p); return <button type="button" key={p.id} className={`rehearsal-item${draft.id === p.id ? ' selected' : ''}`} aria-pressed={draft.id === p.id} onClick={() => { setDraft(structuredClone(p)); setError(''); }}><strong>{p.name}</strong><span>{p.end ? 'Range' : 'Bookmark'}{rehearsalId === p.id ? ' · Active' : ''}</span>{r.error && <span className="rehearsal-error">Needs repair · {r.error}</span>}</button>; })}
    </aside><form onSubmit={e => { e.preventDefault(); if (invalid) { setError(invalid); return; } if (dispatch('rehearsal.save', { passage: draft })) { setDraft(validateRehearsal([draft])[0]); setError(''); controller.notify('Rehearsal passage saved.'); } else setError(controller.store.getState().ui.toast || 'Could not save passage.'); }}>
      <label className="form-label">Passage name<input autoFocus required maxLength={PROJECT_LIMITS.text.setName} aria-label="Passage name" value={draft.name} onChange={e => update({ name: e.target.value })} /></label>
      <label className="form-label">Passage type<select aria-label="Passage type" value={draft.end ? 'range' : 'bookmark'} onChange={e => { if (e.target.value === 'range') update({ end: anchorAtCount(project, totalCounts(project)) }); else { const { end: _end, ...rest } = draft; setDraft(rest); setError(''); } }}><option value="bookmark">Bookmark · start here, continue through show</option><option value="range">Count range · stop or loop at the end</option></select></label>
      <Target label="Start" project={project} value={draft.start} onChange={start => update({ start })} />
      <button type="button" className="button subtle" onClick={() => update({ start: anchorAtCount(project, count) })}>Use current count for start · {Number(count.toFixed(3))}</button>
      {draft.end && <Target label="End" project={project} value={draft.end} onChange={end => update({ end })} />}
      <label className="form-label">Rehearsal focus<select aria-label="Rehearsal focus" value={focusValue} onChange={e => update({ focus: e.target.value === 'all' ? { kind: 'all' } : e.target.value === 'performers' ? { kind: 'performers', performerIds: [...controller.selectedIds] } : { kind: 'section', sectionId: e.target.value.slice(8) } })}><option value="all">Full ensemble</option>{project.sections.map(s => <option key={s.id} value={`section:${s.id}`}>{s.name}</option>)}<option value="performers" disabled={!controller.selectedIds.length && draft.focus.kind !== 'performers'}>Saved performers from selection</option>{draft.focus.kind === 'section' && !project.sections.some(s => `section:${s.id}` === focusValue) && <option value={focusValue}>Missing section — choose replacement</option>}</select></label>
      {draft.focus.kind === 'performers' && <p className="microcopy">{draft.focus.performerIds.length} saved performers. <button type="button" disabled={!controller.selectedIds.length} onClick={() => update({ focus: { kind: 'performers', performerIds: [...controller.selectedIds] } })}>Replace with current selection ({controller.selectedIds.length})</button></p>}
      <label className="form-label">Annotation<textarea aria-label="Annotation" value={draft.notes} maxLength={PROJECT_LIMITS.text.notes} onChange={e => update({ notes: e.target.value })} rows={3} /></label>
      {(error || resolved.error) && <p role="alert" className="rehearsal-error">{error || resolved.error}</p>}
      {!resolved.error && <p className="microcopy">{draft.end ? `Show counts ${resolved.start.count}–${resolved.end!.count}` : `Bookmark at show count ${resolved.start.count}`} · {resolved.focus.label} · {resolved.focus.ids.length} performer{resolved.focus.ids.length === 1 ? '' : 's'}. Saved references also appear in rehearsal exports.</p>}
      <div className="modal-actions rehearsal-actions"><button className="button subtle" type="button" onClick={() => controller.setDialog(null)}>Cancel</button>{saved && <button className="button subtle" type="button" onClick={() => { if (dispatch('rehearsal.remove', { id: draft.id })) setDraft(fresh()); }}>Delete passage</button>}<button aria-label="Save passage" className="button primary" type="submit" disabled={!!invalid}>Save passage</button></div>
      {saved && <button aria-label="Go to saved passage" className="button" type="button" disabled={!!invalid || JSON.stringify(saved) !== JSON.stringify(draft)} onClick={() => dispatch('rehearsal.activate', { id: saved.id })}>Go to saved passage</button>}
    </form></div>
    {rehearsalId && <div className="modal-actions"><button className="button subtle" onClick={() => { dispatch('rehearsal.clear'); controller.setDialog(null); }}>Return to full show</button></div>}
  </Modal>;
}
