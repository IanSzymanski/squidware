import { memo, useEffect, useId, useRef, useState } from 'react';

import type { MouseEventHandler, ReactNode } from 'react';

import type { Point, Project } from '../types';
import { isCustomSurface } from '../surfaces';
import type { ThumbnailDot } from './thumbnailRoster';
import { HelpButton } from './ControlHelp';
import type { ControlHelpProps } from './ControlHelp';
import { Tooltip } from '../components/Tooltip';

export function Button({ children, onClick, active, className = '', ...help }: ControlHelpProps & { children: ReactNode; onClick: MouseEventHandler<HTMLButtonElement>; disabled?: boolean; className?: string }) {
  return <HelpButton {...help} active={active} className={`icon-button ${active ? 'active' : ''} ${className}`} onClick={onClick}>{children}</HelpButton>;
}
export const MiniField = memo(function MiniField({ positions, dots, field }: { positions: Readonly<Record<string, Point>>; dots: readonly ThumbnailDot[]; field?: Project['field'] }) {
  // A floor or stage is drawn as itself, fitted to the same frame as a football field.
  if (field && isCustomSurface(field)) {
    const k = Math.min(100 / field.width, 53.333 / field.height), w = field.width * k, h = field.height * k, x0 = 5 + (100 - w) / 2, y0 = 5 + (53.333 - h) / 2;
    return <svg viewBox="0 0 110 65" className="mini-field" aria-hidden="true"><rect width="110" height="65" fill="#17191d" /><rect x={x0} y={y0} width={w} height={h} rx="1.5" fill={field.preset === 'indoor' ? '#343139' : '#292f3a'} stroke="#646a76" strokeWidth=".5" />{dots.map(dot => { const pos = positions[dot.id]; return pos && <circle key={dot.id} cx={x0 + pos.x * k} cy={y0 + pos.y * k} r="1.5" fill={dot.color} />; })}</svg>;
  }
  return <svg viewBox="0 0 110 65" className="mini-field" aria-hidden="true"><rect x="5" y="5" width="100" height="53.333" rx="2" fill="#243d32" />{Array.from({ length: 11 }, (_, i) => <path key={i} d={`M${5 + i * 10},5v53.333`} stroke="#4c6555" strokeWidth="0.4" />)}{dots.map(dot => { const pos = positions[dot.id]; return pos && <circle key={dot.id} cx={pos.x + 5} cy={pos.y + 5} r="0.9" fill={dot.color} />; })}</svg>;
});
export function CommitInput({ value, onCommit, maxLength, label, onDraftChange, allowEmpty = false, multiline = false, placeholder, description }: { value: string; onCommit: (value: string) => void; maxLength: number; label?: string; onDraftChange: (pending: boolean, fieldId: string) => void; allowEmpty?: boolean; multiline?: boolean; placeholder?: string; description?: string }) {
  const [draft, setDraft] = useState(value);
  const cancelBlur = useRef(false);
  const fieldId = useId();
  const callbackRef = useRef(onDraftChange); callbackRef.current = onDraftChange;
  useEffect(() => { setDraft(value); callbackRef.current(false, fieldId); return () => callbackRef.current(false, fieldId); }, [value, fieldId]);
  const commit = () => { onDraftChange(false, fieldId); if (cancelBlur.current) { cancelBlur.current = false; return; } const next = allowEmpty ? draft : draft.trim() || value; setDraft(next); if (next !== value) onCommit(next); };
  const props = {
    'aria-label': label, value: draft, maxLength, placeholder,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setDraft(event.target.value); onDraftChange(event.target.value !== value, fieldId); },
    onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.currentTarget.closest('[hidden]') || event.relatedTarget instanceof Element && event.relatedTarget.closest('[data-preserve-drafts]')) return;
      commit();
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Enter' && (!multiline || !event.shiftKey)) { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); cancelBlur.current = true; setDraft(value); onDraftChange(false, fieldId); event.currentTarget.blur(); }
    },
  };
  const input = multiline ? <textarea {...props} rows={2} /> : <input {...props} />;
  const help = description ?? (multiline ? 'Enter applies; Shift+Enter adds a line; Escape cancels.' : undefined);
  const control = help ? <Tooltip name={label || 'Edit text'} description={help}>{input}</Tooltip> : input;
  return control;
}

export function CommitColor({ value, label, onCommit, onDraftChange }: { value: string; label: string; onCommit: (value: string) => void; onDraftChange: (pending: boolean, fieldId: string) => void }) {
  const [draft, setDraft] = useState(value);
  const fieldId = useId();
  const cancel = useRef(false);
  const callback = useRef(onDraftChange); callback.current = onDraftChange;
  useEffect(() => { setDraft(value); callback.current(false, fieldId); return () => callback.current(false, fieldId); }, [value, fieldId]);
  return <input type="color" aria-label={label} value={draft} onChange={event => { setDraft(event.target.value); onDraftChange(event.target.value !== value, fieldId); }}
    onBlur={() => { onDraftChange(false, fieldId); if (cancel.current) { cancel.current = false; return; } if (draft !== value) onCommit(draft); }}
    onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); cancel.current = true; setDraft(value); onDraftChange(false, fieldId); event.currentTarget.blur(); }
    }} />;
}
