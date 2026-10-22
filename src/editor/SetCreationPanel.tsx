import { useEffect, useRef, useState } from 'react';
import { Check, Copy, FilePlus2, ListStart, Pause } from 'lucide-react';
import { PROJECT_LIMITS } from '../domain';
import { Modal } from '../components/Modal';
import { numberDraftError } from '../components/NumberField';
import { HelpButton } from './ControlHelp';
import { creationTiming, setCreationNames, type SetCreationKind } from './projectEdits';
import type { EditorController } from './useEditorController';
import './setCreation.css';

const kinds = ['new', 'duplicate', 'insert-before', 'hold'] as const;
const icons = { new: FilePlus2, duplicate: Copy, 'insert-before': ListStart, hold: Pause };
const descriptions = {
  new: 'Fresh staging grid for the whole cast. Blank notes; constant speed.',
  duplicate: 'Copy positions, notes and incoming timing. The new picture starts with a hold; incoming travel is not replayed.',
  'insert-before': 'Carry the preceding set’s positions. Blank notes; keep the selected set’s arrival timing.',
  hold: 'Keep the current positions for the chosen counts. Blank notes; constant speed. Editable after creation.',
};

export function SetCreationPanel({ controller }: { controller: EditorController }) {
  const { project, index, activeSet, dispatch, setDialog, preferences } = controller;
  const [kind, setKind] = useState<SetCreationKind>(controller.store.getState().ui.setCreationKind);
  const initial = creationTiming(project, index, kind, preferences.value.newSetCounts);
  const [counts, setCounts] = useState(String(initial.counts));
  const [tempo, setTempo] = useState(String(initial.tempo));
  const [error, setError] = useState('');
  const countsInput = useRef<HTMLInputElement>(null);
  useEffect(() => { countsInput.current?.focus(); }, []);
  const countError = numberDraftError(counts, PROJECT_LIMITS.counts.min, PROJECT_LIMITS.counts.max, true);
  const tempoError = numberDraftError(tempo, PROJECT_LIMITS.tempo.min, PROJECT_LIMITS.tempo.max);
  const opening = kind === 'insert-before' && index === 0;
  const full = project.sets.length >= PROJECT_LIMITS.sets;
  function choose(next: SetCreationKind) {
    const timing = creationTiming(project, index, next, preferences.value.newSetCounts);
    setKind(next); setCounts(String(timing.counts)); setTempo(String(timing.tempo)); setError('');
  }
  function apply() {
    if (full || countError || tempoError) return;
    if (!dispatch('set.create', { index, kind, counts: Number(counts), tempo: Number(tempo) }))
      setError(controller.store.getState().ui.toast || 'Finish the current edit before creating a set.');
  }
  return <Modal title="Add set" onClose={() => setDialog(null)}>
    <p className="modal-intro">{kind === 'insert-before' ? 'Before' : 'After'} set {index + 1}: <strong>{activeSet.name}</strong>. Review what changes, then Apply. Cancel leaves the production unchanged.</p>
    <div className="set-creation-kinds" role="group" aria-label="Set creation action">
      {kinds.map(value => { const Icon = icons[value]; return <HelpButton key={value} title={setCreationNames[value]} description={descriptions[value]} className="button subtle" aria-pressed={kind === value} onClick={() => choose(value)}><Icon size={15} /><span>{setCreationNames[value]}</span>{kind === value && <Check size={14} aria-hidden="true" />}</HelpButton>; })}
    </div>
    <p className="set-creation-summary" role="status">{descriptions[kind]} {opening && 'The new opening has zero counts. The timing below creates a move into the former opening, using the same positions.'}</p>
    <div className="form-row">
      <label className="form-label">{opening ? 'Counts into former opening' : 'Incoming counts'}<input ref={countsInput} aria-label="Creation counts" type="number" min={PROJECT_LIMITS.counts.min} max={PROJECT_LIMITS.counts.max} step={1} value={counts} aria-invalid={!!countError} aria-describedby={countError ? 'creation-count-error' : undefined} onChange={e => setCounts(e.target.value)} />{countError && <span id="creation-count-error" className="field-error" role="status">{countError}</span>}</label>
      <label className="form-label">Tempo · BPM<input aria-label="Creation tempo" type="number" min={PROJECT_LIMITS.tempo.min} max={PROJECT_LIMITS.tempo.max} step={.1} value={tempo} aria-invalid={!!tempoError} aria-describedby={tempoError ? 'creation-tempo-error' : undefined} onChange={e => setTempo(e.target.value)} />{tempoError && <span id="creation-tempo-error" className="field-error" role="status">{tempoError}</span>}</label>
    </div>
    <p className="microcopy">{kind === 'duplicate' ? `Transition: ${initial.transition === 'ease' ? 'ease in / out' : 'constant speed'}. ${index === 0 ? 'The opening has no incoming timing; this copy uses the default counts.' : 'Counts, tempo and transition start from this set’s incoming move.'}` : 'Transition: constant speed.'} Existing sets keep their positions, notes and move timing. The next move connects from the new set. This adds {countError ? 'the chosen' : counts} counts to the show.</p>
    {kind === 'new' && <p className="microcopy">“Blank” means a new layout: all {project.performers.length} performers remain in the cast, arranged in rows near the front sideline. Shape this new set after applying.</p>}
    {(full || error) && <p className="field-error" role="alert">{full ? `A production can contain at most ${PROJECT_LIMITS.sets} sets.` : error}</p>}
    <div className="modal-actions"><button className="button subtle" onClick={() => setDialog(null)}>Cancel</button><button className="button primary" aria-label="Apply set creation" disabled={full || !!countError || !!tempoError} onClick={apply}>Apply · {setCreationNames[kind]}</button></div>
  </Modal>;
}
