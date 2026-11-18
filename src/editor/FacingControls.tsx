import { facingAt } from '../performerFacing';
import { useEffect, useId, useState } from 'react';
import { HelpButton } from './ControlHelp';
import { Tooltip } from '../components/Tooltip';
import type { EditorController } from './useEditorController';

export function FacingControls({ controller, unavailable }: { controller: EditorController; unavailable: string }) {
  const { activeSet, selectedIds, index, readOnly, dispatch, setPendingDraft } = controller;
  const current = facingAt(activeSet.facings, selectedIds[0]);
  const common = selectedIds.every(id => facingAt(activeSet.facings, id) === current);
  const saved = common && current !== undefined ? String(current) : '';
  const [draft, setDraft] = useState<string | null>(null);
  const field = useId();
  const error = draft !== null && (!draft.trim() || !Number.isFinite(Number(draft)) || Number(draft) < 0 || Number(draft) >= 360);
  const disabled = readOnly || !!controller.dialog;
  useEffect(() => () => setPendingDraft(false, field), [setPendingDraft, field]);

  function cancel() {
    setDraft(null);
    setPendingDraft(false, field);
  }
  function apply(angle: number | null) {
    setPendingDraft(false, field);
    if (dispatch('performer.facing', { index, ids: selectedIds, angle })) setDraft(null);
    else setPendingDraft(draft !== null, field);
  }

  return <form className="facing-controls" noValidate onSubmit={event => {
    event.preventDefault();
    if (draft !== null && !error && !disabled) apply(Number(draft));
  }}>
    <label className="form-label">Facing · degrees
      <Tooltip name="Facing" description="0° faces the front sideline, 90° faces Side 2, 180° faces the back sideline and 270° faces Side 1."
        disabledReason={disabled ? unavailable : undefined}>
        <input type="number" step="any" aria-label="Facing in degrees" placeholder={common ? 'Unknown' : 'Mixed'} value={draft ?? saved}
          disabled={disabled} aria-invalid={error} aria-describedby={error ? field : undefined}
          onChange={event => {
            const value = event.target.value;
            setDraft(value === saved ? null : value);
            setPendingDraft(value !== saved, field);
          }}
          onKeyDown={event => {
            if (event.key !== 'Escape' || event.nativeEvent.isComposing || draft === null) return;
            event.preventDefault();
            event.stopPropagation();
            cancel();
          }} />
      </Tooltip>
    </label>
    {error && <p className="field-error" id={field} role="status">Enter an angle from 0° up to 360°.</p>}
    <div className="transform-buttons">
      <HelpButton type="submit" title="Apply facing" className="button subtle" description="Set this heading for the selected performers at this set."
        disabled={disabled || error || draft === null} disabledReason={disabled ? unavailable : 'Enter a new valid heading.'}>Apply facing</HelpButton>
      {draft !== null
        ? <HelpButton type="button" title="Cancel facing edit" className="button subtle" onClick={cancel}>Cancel</HelpButton>
        : selectedIds.some(id => facingAt(activeSet.facings, id) !== undefined) && <HelpButton type="button" title="Clear facing" className="button subtle"
          description="Mark the selected performers’ heading as unknown at this set." disabled={disabled} disabledReason={unavailable} onClick={() => apply(null)}>Clear</HelpButton>}
    </div>
  </form>;
}
