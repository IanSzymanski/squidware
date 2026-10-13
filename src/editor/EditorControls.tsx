import { memo, useEffect, useId, useRef, useState } from 'react';

import type { ReactNode } from 'react';

import type { DrillSet, Project } from '../types';
import { commandRegistry } from './commands';
import type { CommandId } from './commands';

export function Button({ children, onClick, title, command, active, disabled, className = '' }: { children: ReactNode; onClick: () => void; title: string; command?: CommandId; active?: boolean; disabled?: boolean; className?: string }) {
  const tooltip = command ? `${commandRegistry[command].name} — ${commandRegistry[command].description}` : title;
  return <button className={`icon-button ${active ? 'active' : ''} ${className}`} title={tooltip} aria-label={title} aria-pressed={active === undefined ? undefined : active} onClick={onClick} disabled={disabled}>{children}</button>;
}
export const MiniField = memo(function MiniField({ project, set }: { project: Project; set: DrillSet }) {
  return <svg viewBox="0 0 110 65" className="mini-field" aria-hidden="true"><rect x="5" y="5" width="100" height="53.333" rx="2" fill="#243d32" />{Array.from({ length: 11 }, (_, i) => <path key={i} d={`M${5 + i * 10},5v53.333`} stroke="#4c6555" strokeWidth="0.4" />)}{project.performers.map(p => { const pos = set.positions[p.id]; return pos && <circle key={p.id} cx={pos.x + 5} cy={pos.y + 5} r="0.9" fill={project.sections.find(s => s.id === p.sectionId)?.color || '#d0f398'} />; })}</svg>;
});
export function CommitInput({ value, onCommit, maxLength, label, onDraftChange, allowEmpty = false, multiline = false, placeholder }: { value: string; onCommit: (value: string) => void; maxLength: number; label?: string; onDraftChange: (pending: boolean, fieldId: string) => void; allowEmpty?: boolean; multiline?: boolean; placeholder?: string }) {
  const [draft, setDraft] = useState(value);
  const cancelBlur = useRef(false);
  const fieldId = useId();
  const callbackRef = useRef(onDraftChange); callbackRef.current = onDraftChange;
  useEffect(() => { setDraft(value); callbackRef.current(false, fieldId); return () => callbackRef.current(false, fieldId); }, [value, fieldId]);
  const commit = () => { onDraftChange(false, fieldId); if (cancelBlur.current) { cancelBlur.current = false; return; } const next = allowEmpty ? draft : draft.trim() || value; setDraft(next); if (next !== value) onCommit(next); };
  const props = {
    'aria-label': label, value: draft, maxLength, placeholder,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setDraft(event.target.value); onDraftChange(event.target.value !== value, fieldId); },
    onBlur: commit,
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Enter' && (!multiline || !event.shiftKey)) { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); cancelBlur.current = true; setDraft(value); onDraftChange(false, fieldId); event.currentTarget.blur(); }
    },
  };
  return multiline ? <><textarea {...props} rows={2} /><small className="microcopy">Enter applies · Shift+Enter adds a line · Escape cancels</small></> : <input {...props} />;
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
