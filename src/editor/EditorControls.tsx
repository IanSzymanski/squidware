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
export function CommitInput({ value, onCommit, maxLength, label, onDraftChange }: { value: string; onCommit: (value: string) => void; maxLength: number; label?: string; onDraftChange: (pending: boolean, fieldId: string) => void }) {
  const [draft, setDraft] = useState(value);
  const cancelBlur = useRef(false);
  const fieldId = useId();
  const callbackRef = useRef(onDraftChange); callbackRef.current = onDraftChange;
  useEffect(() => { setDraft(value); callbackRef.current(false, fieldId); return () => callbackRef.current(false, fieldId); }, [value, fieldId]);
  const commit = () => { onDraftChange(false, fieldId); if (cancelBlur.current) { cancelBlur.current = false; return; } const next = draft.trim() || value; setDraft(next); if (next !== value) onCommit(next); };
  return <input aria-label={label} value={draft} maxLength={maxLength} onChange={event => { setDraft(event.target.value); onDraftChange(event.target.value !== value, fieldId); }} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { event.stopPropagation(); cancelBlur.current = true; setDraft(value); event.currentTarget.blur(); } }} />;
}
