import { useEffect, useId, useRef, useState } from 'react';

export function numberDraftError(draft: string, min: number, max: number, integer = false): string | undefined {
  if (!draft.trim() || !Number.isFinite(Number(draft))) return 'Enter a finite number.';
  const value = Number(draft);
  if (integer && !Number.isInteger(value)) return 'Enter a whole number.';
  if (value < min || value > max) return `Enter a value from ${min} to ${max}.`;
}

export interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  integer?: boolean;
  disabled?: boolean;
  onDraftChange?: (pending: boolean, fieldId: string) => void;
}

/** Keeps incomplete and invalid typing local, then commits a validated value on blur/Enter. */
export function NumberField({ label, value, onChange, min, max, step = 1, integer = false, disabled, onDraftChange }: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));
  const cancelBlur = useRef(false);
  const errorId = useId();
  const draftCallback = useRef(onDraftChange); draftCallback.current = onDraftChange;
  useEffect(() => { setDraft(String(value)); draftCallback.current?.(false, errorId); }, [value, errorId]);
  useEffect(() => () => draftCallback.current?.(false, errorId), [errorId]);
  const error = disabled ? undefined : numberDraftError(draft, min, max, integer);
  function commit() {
    if (cancelBlur.current) { cancelBlur.current = false; return; }
    if (error) { onDraftChange?.(true, errorId); return; }
    const next = Number(draft);
    onDraftChange?.(false, errorId);
    setDraft(String(next));
    if (next !== value) onChange(next);
  }
  return <label className="form-label">{label}<input type="number" value={draft} min={min} max={max} step={step} disabled={disabled}
    aria-invalid={!!error} aria-describedby={error ? errorId : undefined}
    onChange={event => { setDraft(event.target.value); onDraftChange?.(event.target.value !== String(value), errorId); }}
    onBlur={commit}
    onKeyDown={event => {
      if (event.key === 'Enter') event.currentTarget.blur();
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelBlur.current = true; setDraft(String(value)); onDraftChange?.(false, errorId); event.currentTarget.blur(); }
    }} />{error && <span id={errorId} className="field-error" role="status">{error}</span>}</label>;
}
