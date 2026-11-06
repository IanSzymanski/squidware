import { useLayoutEffect, useRef, useState } from 'react';
import { GripVertical, Image, Plus, X } from 'lucide-react';
import { countToSeconds, PROJECT_LIMITS, setTiming } from '../domain';
import { MiniField } from './EditorControls';
import { Tooltip } from '../components/Tooltip';
import { HelpButton, useShowHints } from './ControlHelp';
import { canChangeLayout } from './commands';
import { useEditorSelector } from './react';
import { matchingSets } from './setList';
import type { useEditorController } from './useEditorController';
import './setList.css';

type Controller = ReturnType<typeof useEditorController>;
type Drag = { id: string; revision: number; epoch: number };

export function SetListPanel({ controller: c }: { controller: Controller }) {
  const { project, index, projectEpoch, thumbnailDots, preferences } = c;
  const revision = useEditorSelector(s => s.project.revision);
  const locked = !useEditorSelector(canChangeLayout);
  const [query, setQuery] = useState('');
  const showHints = useShowHints();
  const [over, setOver] = useState<number | null>(null), [dragId, setDragId] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null), list = useRef<HTMLDivElement>(null);
  const activeId = project.sets[index].id, rows = matchingSets(project.sets, query);
  const thumbnails = preferences.value.setThumbnails;
  const resetDrag = () => { drag.current = null; setDragId(null); setOver(null); };
  const rowButton = (id: string) => Array.from(list.current?.querySelectorAll<HTMLButtonElement>('.set-card') ?? []).find(n => n.dataset.setId === id);
  useLayoutEffect(() => { setQuery(current => matchingSets(project.sets, current).includes(index) ? current : ''); }, [activeId, index, projectEpoch, project.sets]);
  useLayoutEffect(() => { resetDrag(); }, [activeId, index, revision, projectEpoch, locked]);
  useLayoutEffect(() => { rowButton(activeId)?.scrollIntoView({ block: 'nearest' }); }, [activeId, index, project.sets, query, thumbnails]);
  const select = (next: number, focus = false) => {
    if (c.dispatch('set.select', { index: next }) && focus) rowButton(project.sets[next].id)?.focus();
  };
  const move = (request: Drag, to: number) => {
    // The command confirms the move, including any change to the opening's timing.
    if (!c.dispatch('set.move-to', { ...request, target: to })) c.notify(c.store.getState().ui.toast || 'The set order changed or an edit is pending. Try again.');
  };
  const elapsed = Math.round(countToSeconds(project, c.duration));
  return <aside className="set-panel set-list-panel" aria-label="Set list">
    <div className="set-list-tools">
      <div className="set-list-heading"><strong><span className="count-badge">{project.sets.length}</span> {project.sets.length === 1 ? 'set' : 'sets'}</strong><HelpButton pointerPassThrough title="Show set thumbnails" description="Switch between compact rows and formation thumbnails. This is a personal display preference." active={thumbnails} className="icon-button" onClick={() => preferences.update({ setThumbnails: !thumbnails })}><Image size={15} /></HelpButton></div>
      <div className="set-find"><Tooltip pointerPassThrough name="Find set" description="Enter an exact set number or part of a name. Enter goes to the first match; Escape clears search. Arrow keys navigate the focused result rows."><input type="search" aria-label="Find set" placeholder="Set number or name" maxLength={160} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter' && rows.length && !locked) { e.preventDefault(); select(rows[0], true); }
        if (e.key === 'Escape') {
          e.preventDefault(); e.stopPropagation(); setQuery(''); const field = e.currentTarget;
          requestAnimationFrame(() => { if (document.activeElement === field) rowButton(activeId)?.focus(); });
        }
      }} /></Tooltip>{query && <HelpButton className="icon-button" title="Clear set search" onClick={() => setQuery('')}><X size={14} /></HelpButton>}</div>
      <div className="set-list-summary" role="status">{query ? `${rows.length} ${rows.length === 1 ? 'match' : 'matches'}` : showHints ? <span data-hint="">↑ / ↓ navigate · Alt+↑ / ↓ move</span> : null}{!rows.includes(index) && <HelpButton title="Show current set" onClick={() => setQuery('')}>Show current</HelpButton>}</div>
      <div className="set-list-columns" aria-hidden="true"><span>Set / name</span><span>cts</span><span>BPM</span></div>
    </div>
    <div className="set-list" ref={list} aria-label="Sets" onDragOver={e => {
      if (!drag.current || !list.current) return;
      const rect = list.current.getBoundingClientRect();
      if (e.clientY < rect.top + 30) list.current.scrollTop -= 24;
      else if (e.clientY > rect.bottom - 30) list.current.scrollTop += 24;
    }} onDrop={resetDrag}>
      {!rows.length && <p className="set-list-empty">No matching sets. Enter a set number from 1 to {project.sets.length}, or part of a name.</p>}
      {rows.map(i => {
        const set = project.sets[i], timing = setTiming(project, i), from = project.sets.findIndex(s => s.id === dragId);
        return <HelpButton pointerPassThrough key={set.id} command="set.select" showShortcut={false} title={`Set ${i + 1}: ${set.name}`} description={`Stop playback and edit this set. ${i === 0 ? 'Opening set, zero counts' : `${timing.counts} move counts`} · ${timing.tempo} ${project.tempoMap?'base BPM (see Tempo map)':'BPM'}. Drag the handle to reorder; Arrow keys navigate; Alt+Up/Down moves one position. To jump to a position, search the Command palette for Move current set to position.`} state={index === i ? 'Current set' : 'Available'}
          aria-current={index === i ? 'step' : undefined} tabIndex={i === (rows.includes(index) ? index : rows[0]) ? 0 : -1} data-set-id={set.id}
          disabled={locked} className={`set-card set-row${thumbnails ? ' set-row--thumbnails' : ''}${index === i ? ' selected' : ''}${over === i && from !== i ? from < i ? ' drop-after' : ' drop-before' : ''}`}
          draggable={!locked} onDragStart={e => { drag.current = { id: set.id, revision, epoch: projectEpoch }; setDragId(set.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('application/x-squidware-set', set.id); }}
          onDragEnd={resetDrag} onDragOver={e => { if (drag.current && !locked) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(i); } }}
          onDrop={e => { if (!drag.current || locked) return; e.preventDefault(); e.stopPropagation(); if (drag.current.id !== set.id) move(drag.current, i); resetDrag(); }}
          onClick={() => select(i)} onKeyDown={e => {
            if (locked || e.nativeEvent.isComposing || e.ctrlKey || e.metaKey || e.shiftKey) return;
            if (e.altKey && ['ArrowUp', 'ArrowDown'].includes(e.key)) {
              e.preventDefault(); e.stopPropagation(); c.dispatch('set.reorder', { index: i, direction: e.key === 'ArrowUp' ? -1 : 1 }); rowButton(set.id)?.focus(); return;
            }
            if (!e.altKey && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
              e.preventDefault(); e.stopPropagation(); const at = rows.indexOf(i);
              select(e.key === 'Home' ? rows[0] : e.key === 'End' ? rows[rows.length - 1] : rows[Math.max(0, Math.min(rows.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))], true);
            }
          }}>
          <GripVertical size={12} aria-hidden="true" className="set-grip" /><span className="set-number">{String(i + 1).padStart(2, '0')}</span><span className="set-row-name">{set.name}</span><span className="set-row-counts">{i === 0 ? '—' : timing.counts}</span><span className="set-row-tempo">{timing.tempo}</span>
          {thumbnails && <MiniField positions={set.positions} dots={thumbnailDots} />}
        </HelpButton>;
      })}
    </div>
    <div className="set-panel-footer">
      <HelpButton command="set.new" title="Add set" disabled={project.sets.length >= PROJECT_LIMITS.sets} disabledReason={`A production can contain at most ${PROJECT_LIMITS.sets} sets.`} className="button add-set" onClick={c.addSet}><Plus size={15} />Add set</HelpButton>
      <span>{c.duration} counts · {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>
    </div>
  </aside>;
}
