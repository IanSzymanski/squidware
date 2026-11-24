import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Modal } from '../components/Modal';
import { CHOREOGRAPHY_LIMITS, choreographyLabels, incompatibleFlagPerformers } from '../choreography';
import { setStartCount, uid } from '../domain';
import type { ChoreographyCue, ChoreographyPreset } from '../types';
import { saveChoreographyCue } from './choreographyEdits';
import type { EditorController } from './useEditorController';
import './choreography.css';

interface Draft {
  id: string;
  performerIds: string[];
  preset: ChoreographyPreset;
  start: string;
  end: string;
  transition: string;
  turnout: string;
  depth: string;
  revision: number;
  epoch: number;
}

const number = (value: string) => value.trim() ? Number(value) : NaN;

export function ChoreographyPanel({ controller }: { controller: EditorController }) {
  const { project, index, selectedIds, store, dispatch } = controller;
  const [moveId, setMoveId] = useState(project.moves[Math.max(0, index - 1)]?.id ?? '');
  const [draft, setDraft] = useState<Draft>();
  const [message, setMessage] = useState('');
  const moveSelect = useRef<HTMLSelectElement>(null);
  const presetSelect = useRef<HTMLSelectElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const editing = !!draft;
  const focusList = () => {
    if (addButton.current && !addButton.current.disabled) addButton.current.focus();
    else moveSelect.current?.focus();
  };
  useLayoutEffect(() => {
    if (editing) presetSelect.current?.focus();
    else if (!document.activeElement || document.activeElement === document.body) focusList();
  }, [editing]);
  const move = project.moves.find(item => item.id === moveId);
  const labels = new Map(project.performers.map(person => [person.id, person.label]));
  const names = new Map(project.sets.map(set => [set.id, set.name]));
  const cues = (project.choreography ?? []).filter(cue => cue.moveId === moveId);
  const close = () => dispatch('dialog.open', { dialog: null });
  const latest = () => {
    const state = store.getState();
    return { revision: state.project.revision, epoch: state.ui.projectEpoch };
  };
  const members = (ids: string[]) => ids.length <= 4
    ? ids.map(id => labels.get(id)).join(', ') : `${ids.length} performers`;

  function begin(cue?: ChoreographyCue) {
    if (!move) return;
    setMessage('');
    setDraft({
      id: cue?.id ?? uid(), performerIds: cue?.performerIds ?? [...selectedIds], preset: cue?.preset ?? 'second',
      start: String(cue?.start ?? 0), end: String(cue?.end ?? move.counts),
      transition: String(cue?.transition ?? Math.min(2, move.counts / 2)),
      turnout: String(cue && cue.preset !== 'flag-up' ? cue.turnout : CHOREOGRAPHY_LIMITS.turnout.default),
      depth: String(cue?.preset === 'plie' ? cue.depth : CHOREOGRAPHY_LIMITS.depth.default),
      ...latest(),
    });
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || !move) return;
    const common = {
      id: draft.id, performerIds: draft.performerIds, moveId: move.id, fromSetId: move.fromSetId, toSetId: move.toSetId,
      start: number(draft.start), end: number(draft.end), transition: number(draft.transition),
    };
    const cue: ChoreographyCue = draft.preset === 'flag-up' ? { ...common, preset: 'flag-up' }
      : draft.preset === 'plie' ? { ...common, preset: 'plie', turnout: number(draft.turnout), depth: number(draft.depth) }
        : { ...common, preset: 'second', turnout: number(draft.turnout) };
    try {
      saveChoreographyCue(project, cue);
      if (dispatch('choreography.save', { cue, epoch: draft.epoch, revision: draft.revision }) !== true) {
        throw new Error('The project changed while this cue was open. Cancel the edit and reopen the cue.');
      }
      setDraft(undefined);
      setMessage('');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message.replace(/^Invalid project choreography: /, '') : String(cause));
    }
  }

  function review(cue: ChoreographyCue) {
    const moveIndex = project.moves.findIndex(item => item.id === cue.moveId);
    if (moveIndex < 0) return;
    close();
    dispatch('view.select', { view: '3d' });
    dispatch('playback.scrub', { count: setStartCount(project, moveIndex) + cue.start + cue.transition });
  }

  const hold = draft ? number(draft.end) - number(draft.start) - 2 * number(draft.transition) : NaN;
  const incompatible = draft?.preset === 'flag-up' ? incompatibleFlagPerformers(project, draft.performerIds) : [];
  return <Modal title="Choreography cues" onClose={close} wide>
    <label className="form-label">Move
      <select ref={moveSelect} value={moveId} disabled={!!draft} onChange={event => { setMoveId(event.target.value); setMessage(''); }}>
        {project.moves.map(item => <option key={item.id} value={item.id}>{names.get(item.fromSetId)} → {names.get(item.toSetId)}</option>)}
      </select>
    </label>
    {draft && move ? <form noValidate onSubmit={save} className="cue-form" aria-label="Cue settings">
      <p className="microcopy">For {members(draft.performerIds)}</p>
      {selectedIds.length > 0 && (selectedIds.length !== draft.performerIds.length || !selectedIds.every(id => draft.performerIds.includes(id)))
        && <button type="button" className="button subtle cue-reassign" onClick={() => setDraft({ ...draft, performerIds: [...selectedIds] })}>Use current selection</button>}
      <label className="form-label">Preset
        <select ref={presetSelect} value={draft.preset} onChange={event => { setMessage(''); setDraft({ ...draft, preset: event.target.value as ChoreographyPreset }); }}>
          {Object.entries(choreographyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <div className="cue-inputs">
        {([
          ['start', 'Start count', 0, move.counts],
          ['end', 'End count', 0, move.counts],
          ['transition', 'Counts per transition', CHOREOGRAPHY_LIMITS.transitionMin, move.counts / 2],
          ...(draft.preset !== 'flag-up' ? [['turnout', 'Turnout · degrees', CHOREOGRAPHY_LIMITS.turnout.min, CHOREOGRAPHY_LIMITS.turnout.max] as const] : []),
          ...(draft.preset === 'plie' ? [['depth', 'Plié depth · yards', CHOREOGRAPHY_LIMITS.depth.min, CHOREOGRAPHY_LIMITS.depth.max] as const] : []),
        ] as const).map(([key, label, min, max]) => <label key={key} className="form-label">{label}
          <input type="number" min={min} max={max} step="any" value={draft[key]}
            onChange={event => { setMessage(''); setDraft({ ...draft, [key]: event.target.value }); }} />
        </label>)}
      </div>
      <p className="microcopy">Counts are measured from the start of this move. Both transitions have the same duration.
        {hold >= 0 ? ` Holds for ${Number(hold.toFixed(3))} counts.` : ''}</p>
      {incompatible.length > 0 && <p role="status" className="field-error">Assign flag equipment to {members(incompatible.map(person => person.id))} before saving this cue.</p>}
      {message && <p role="alert" className="field-error">{message}</p>}
      <div className="modal-actions">
        <button type="button" className="button subtle" onClick={() => { setDraft(undefined); setMessage(''); }}>Cancel edit</button>
        <button type="submit" className="button primary" disabled={incompatible.length > 0}>Save cue</button>
      </div>
    </form> : <>
      {cues.length ? <ul className="cue-list">{cues.map(cue => {
        const inactive = cue.preset === 'flag-up' ? incompatibleFlagPerformers(project, cue.performerIds) : [];
        return <li key={cue.id}>
          <div><strong>{choreographyLabels[cue.preset]} · {cue.start}–{cue.end}</strong><p>{members(cue.performerIds)}</p>
            {inactive.length > 0 && <p className="field-error">Inactive for {members(inactive.map(person => person.id))} without flag equipment.</p>}</div>
          <div className="cue-actions">
            <button type="button" className="button subtle" aria-label={`Review ${choreographyLabels[cue.preset]} cue at count ${cue.start}`}
              onClick={() => review(cue)}>Review</button>
            <button type="button" className="button subtle" aria-label={`Edit ${choreographyLabels[cue.preset]} cue at count ${cue.start}`} onClick={() => begin(cue)}>Edit</button>
            <button type="button" className="button subtle" aria-label={`Remove ${choreographyLabels[cue.preset]} cue at count ${cue.start}`}
              onClick={() => { focusList(); dispatch('choreography.remove', { id: cue.id, ...latest() }); }}>Remove</button>
          </div>
        </li>;
      })}</ul> : <p className="microcopy">No cues on this move.</p>}
      {selectedIds.length === 0 && <p className="microcopy">Select one or more performers on the field or in Cast to add a cue.</p>}
      <div className="modal-actions">
        <button type="button" className="button subtle" onClick={close}>Done</button>
        <button ref={addButton} type="button" className="button primary" disabled={!move || selectedIds.length === 0 || (project.choreography?.length ?? 0) >= CHOREOGRAPHY_LIMITS.cues}
          onClick={() => begin()}>Add cue</button>
      </div>
    </>}
  </Modal>;
}
