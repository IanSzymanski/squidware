import { useEffect, useId, useRef, useState } from 'react';
import { ListFilter, X } from 'lucide-react';
import type { Section } from '../types';
import { PROJECT_LIMITS } from '../domain';
import { parseLassoPoints } from '../selectionTools';
import { useEditorSelector } from './react';
import { canChooseSelection, canSelectSection } from './selectionCommands';
import { isAtActiveSet } from './editMode';
import { HelpButton } from './ControlHelp';
import type { EditorController } from './useEditorController';
import './selectionTools.css';

function GroupName({ id, value, controller: c }: { id: string; value: string; controller: EditorController }) {
  const [draft, setDraft] = useState(value), [error, setError] = useState('');
  const field = useId(), cancelBlur = useRef(false);
  useEffect(() => { setDraft(value); setError(''); c.setPendingDraft(false, field); return () => c.setPendingDraft(false, field); }, [value, field, c.setPendingDraft]);
  function commit() {
    if (cancelBlur.current) { cancelBlur.current = false; return; }
    const next = draft.trim();
    if (!next || next.length > PROJECT_LIMITS.text.groupName || /[\u0000-\u001f]/.test(next) || c.project.selectionGroups?.some(g => g.id !== id && g.name.toLowerCase() === next.toLowerCase())) { setError('Enter a unique, nonempty group name of at most 80 characters.'); c.setPendingDraft(true, field); return; }
    c.setPendingDraft(false, field);
    if (next !== value && !c.dispatch('group.rename', { id, name: next })) { setError(c.store.getState().ui.toast); c.setPendingDraft(true, field); }
    else { setDraft(next); setError(''); }
  }
  return <><input aria-label={`Name for group ${value}`} value={draft} maxLength={PROJECT_LIMITS.text.groupName} aria-invalid={!!error || undefined} onChange={e => { setDraft(e.target.value); setError(''); c.setPendingDraft(e.target.value !== value, field); }} onBlur={commit} onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelBlur.current = true; setDraft(value); setError(''); c.setPendingDraft(false, field); e.currentTarget.blur(); } }} />{error && <p className="selection-tools-error" role="alert">{error}</p>}</>;
}

export function SelectionToolsButton({ controller }: { controller: EditorController }) {
  const enabled = useEditorSelector(s => canChooseSelection(s, true));
  return <HelpButton pointerPassThrough command="selection.tools" title="Selection tools and groups" className="icon-button" disabled={!enabled} disabledReason="Finish or cancel the current input, position preview or gesture first." onClick={() => controller.dispatch('selection.tools')}><ListFilter size={17} /></HelpButton>;
}

export function SectionSelectionButton({ section, controller }: { section: Section; controller: EditorController }) {
  const shift = useRef(false), ids = controller.sectionMembers.get(section.id) ?? [];
  const selected = ids.length > 0 && ids.every(id => controller.selectedSet.has(id));
  const enabled = useEditorSelector(canSelectSection);
  return <HelpButton pointerPassThrough command="selection.section" title={`Select all ${section.name}`} description={`Select ${ids.length} performers in the whole section. Shift-click or Shift-Enter adds them. Cast filters do not limit section buttons.`} active={selected} state={selected ? 'Selected' : 'Not selected'} disabled={!enabled} disabledReason="Finish the current gesture or selection review first." className={selected ? 'selected' : ''}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') shift.current = event.shiftKey; }}
    onClick={event => { controller.dispatch('selection.section', { id: section.id, additive: event.detail === 0 ? shift.current || event.shiftKey : event.shiftKey }); shift.current = false; }}><i style={{ background: section.color }} />Select {section.name}<span>{ids.length}</span></HelpButton>;
}

export function SelectionTools({ controller: c }: { controller: EditorController }) {
  const open = useEditorSelector(s => s.ui.selectionToolsOpen), review = useEditorSelector(s => s.ui.selectionPreview);
  const enabled = useEditorSelector(s => canChooseSelection(s)), geometric = useEditorSelector(s => canChooseSelection(s, true) && !s.playback.playing && isAtActiveSet(s));
  const tolerance = useEditorSelector(s => s.ui.selectionTolerance);
  const panel = useRef<HTMLElement>(null);
  const [anchor, setAnchor] = useState(''), [amount, setAmount] = useState(String(tolerance));
  const [additive, setAdditive] = useState(false), [points, setPoints] = useState('10, 10\n30, 10\n30, 20\n10, 20');
  const [name, setName] = useState(''), [error, setError] = useState('');
  const visible = c.filteredCast;
  const anchorId = visible.some(p => p.id === anchor) ? anchor : visible.find(p => c.selectedSet.has(p.id))?.id ?? visible[0]?.id ?? '';
  const validTolerance = !!amount.trim() && Number.isFinite(Number(amount)) && Number(amount) >= 0 && Number(amount) <= 5;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [open]);
  useEffect(() => { if (review?.spec.kind === 'lasso') setPoints(review.spec.points.map(p => `${Number(p.x.toFixed(4))}, ${Number(p.y.toFixed(4))}`).join('\n')); }, [review?.spec]);
  if (!open) return null;
  function preview(kind: 'rank' | 'file' | 'lasso') {
    try {
      setError('');
      const spec = kind === 'lasso' ? { kind, points: parseLassoPoints(points), tolerance: Number(amount) } : { kind, anchorId, tolerance: Number(amount) };
      if (!c.dispatch('selection.preview', { spec, additive: review?.additive ?? additive })) setError(c.store.getState().ui.toast || 'Return to a set and finish the current input before selecting geometry.');
    } catch (e) { setError((e as Error).message); }
  }
  const groups = c.project.selectionGroups ?? [];
  const invalidName = !name.trim() || name.length > PROJECT_LIMITS.text.groupName || /[\u0000-\u001f]/.test(name) || groups.some(g => g.name.toLowerCase() === name.trim().toLowerCase());
  return <section ref={panel} tabIndex={-1} className="selection-tools-panel" role="region" aria-label="Selection tools and groups">
    <div className="selection-tools-heading"><h2>Selection tools</h2><HelpButton pointerPassThrough title="Close selection tools" command="selection.close" onClick={() => c.dispatch('selection.close')}><X size={17} /></HelpButton></div>
    <p className="microcopy">Geometry and invert use the current Cast search and section filters: {visible.length} performers. Invert keeps selections outside these filters.</p>
    <div className="selection-tools-row"><HelpButton pointerPassThrough command="selection.invert" title="Invert visible selection" disabled={!enabled} disabledReason="Apply or cancel the preview first." onClick={() => c.dispatch('selection.invert')}>Invert visible</HelpButton><label><input type="checkbox" aria-label="Add selection results" checked={review?.additive ?? additive} onChange={e => { setAdditive(e.target.checked); if (review) c.dispatch('selection.review', { ids: review.ids, additive: e.target.checked }); }} />Add to selection</label></div>
    <details open><summary>Rank, file and lasso</summary><p className="microcopy">Rank = same front/back distance (Y). File = same left/right distance (X). Tolerance is in physical yards.</p>
      <label className="form-label">Anchor performer<select aria-label="Selection anchor" value={anchorId} onChange={e => { if (review) c.dispatch('selection.cancel'); setAnchor(e.target.value); }}>{visible.map(p => <option key={p.id} value={p.id}>{p.label} · {p.name || 'Unnamed'}</option>)}</select></label>
      <label className="form-label">Tolerance (yards)<input aria-label="Selection tolerance in yards" type="number" min="0" max="5" step="0.05" value={amount} aria-invalid={!validTolerance || undefined} onChange={e => { if (review) c.dispatch('selection.cancel'); setAmount(e.target.value); const value = Number(e.target.value); if (e.target.value.trim() && Number.isFinite(value) && value >= 0 && value <= 5) c.store.setValue('ui', 'selectionTolerance', value); }} /></label>
      {!validTolerance && <p className="selection-tools-error">Enter a tolerance from 0 to 5 yards.</p>}
      <div className="selection-tools-row">{(['rank', 'file'] as const).map(kind => <HelpButton pointerPassThrough key={kind} command="selection.preview" title={`Preview ${kind}`} disabled={!geometric || !validTolerance || !anchorId} disabledReason="Return to a set, choose a visible anchor and a valid tolerance, and finish other input." onClick={() => preview(kind)}>Preview {kind}</HelpButton>)}</div>
      <details><summary>Keyboard lasso</summary><label className="form-label">Lasso points: x, y yards, one pair per line<textarea aria-label="Lasso points in yards" rows={4} maxLength={32768} value={points} onChange={e => { if (review) c.dispatch('selection.cancel'); setPoints(e.target.value); }} /></label><p className="microcopy">The final edge closes automatically. Interior and boundary-tolerance dots are included; near-edge dots are flagged for review. Crossing paths use even-odd fill.</p><HelpButton pointerPassThrough command="selection.preview" title="Preview typed lasso" disabled={!geometric || !validTolerance} disabledReason="Return to a set and finish other input first." onClick={() => preview('lasso')}>Preview lasso</HelpButton></details>
    </details>
    {error && <p className="selection-tools-error" role="alert">{error}</p>}
    {review && <div className="selection-review"><h3>{review.spec.kind === 'lasso' ? 'Lasso' : review.spec.kind === 'rank' ? 'Rank' : 'File'} preview</h3><p role="status">{review.ids.length} included · {review.candidates.filter(p => p.boundary).length} near boundary. Review the rings and membership below.</p><div className="selection-tools-row"><HelpButton pointerPassThrough command="selection.apply" title="Apply selection" onClick={() => c.dispatch('selection.apply')}>Apply selection</HelpButton><HelpButton pointerPassThrough command="selection.cancel" title="Cancel selection preview" onClick={() => c.dispatch('selection.cancel')}>Cancel</HelpButton></div>
      <div className="selection-candidates" aria-label="Selection preview candidates">{review.candidates.map(candidate => { const person = c.project.performers.find(p => p.id === candidate.id)!; return <label key={candidate.id}><input type="checkbox" aria-label={`Include ${person.label} in selection`} checked={review.ids.includes(candidate.id)} onChange={e => c.dispatch('selection.review', { additive: review.additive, ids: e.target.checked ? [...review.ids, candidate.id] : review.ids.filter(id => id !== candidate.id) })} /><span>{person.label} · {person.name || 'Unnamed'}<small>{candidate.boundary ? 'Near boundary · ' : ''}{candidate.distance.toFixed(2)} yd {review.spec.kind === 'lasso' ? 'from edge' : 'from axis'}</small></span></label>; })}{!review.candidates.length && <p>No matching performers. Adjust the polygon, anchor, filters or tolerance.</p>}</div><p className="microcopy">Apply changes only selection. Escape cancels this preview.</p></div>}
    <details open><summary>Saved groups · {groups.length}/{PROJECT_LIMITS.selectionGroups}</summary><p className="microcopy">Saved with this production by performer ID, independently of sections. Recall includes members hidden by Cast filters. Group edits have Undo.</p>
      <form className="selection-tools-row" onSubmit={e => { e.preventDefault(); if (enabled && !invalidName && c.dispatch('group.create', { name })) { setName(''); setError(''); } }}><label className="form-label">New group name<input aria-label="New selection group name" maxLength={PROJECT_LIMITS.text.groupName} value={name} onChange={e => setName(e.target.value)} /></label><HelpButton pointerPassThrough type="submit" command="group.create" title="Save selection group" disabled={!enabled || invalidName || !c.selectedIds.length || groups.length >= PROJECT_LIMITS.selectionGroups} disabledReason="Select performers and enter a unique group name; finish the current preview or draft. At most 64 groups." onClick={() => {}}>Save group</HelpButton></form>
      {groups.map(group => <div className="selection-saved-group" key={group.id}><fieldset disabled={!!review}><GroupName id={group.id} value={group.name} controller={c} /></fieldset><span>{group.performerIds.length} members{!group.performerIds.length && ' · empty after performer removal'}</span><div className="selection-tools-row"><HelpButton pointerPassThrough command="group.select" title={`Recall group ${group.name}`} disabled={!enabled || !group.performerIds.length} disabledReason="Finish the preview/input first. Empty groups have no performers to recall." onClick={() => c.dispatch('group.select', { id: group.id, additive })}>Recall</HelpButton><HelpButton pointerPassThrough command="group.update" title={`Replace members of ${group.name}`} disabled={!enabled || !c.selectedIds.length} disabledReason="Select performers and finish other input first." onClick={() => c.dispatch('group.update', { id: group.id })}>Use current selection</HelpButton><HelpButton pointerPassThrough command="group.remove" title={`Delete group ${group.name}`} disabled={!enabled} disabledReason="Finish other input first." onClick={() => c.dispatch('group.remove', { id: group.id })}>Delete</HelpButton></div></div>)}
      {!groups.length && <p className="microcopy">No saved groups yet. Select performers, name the group and choose Save group.</p>}
    </details>
  </section>;
}
