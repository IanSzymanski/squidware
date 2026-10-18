import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { FolderOpen, List, PanelRight, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { coordinateDescription, PROJECT_LIMITS } from '../domain';
import type { Performer } from '../types';
import { Button, CommitInput } from './EditorControls';
import { HelpButton } from './ControlHelp';
import { nextCastRow, selectCastRow, selectVisible } from './castSelection';
import './cast.css';
import type { EditorController } from './useEditorController';

function PerformerFields({ person, controller }: { person: Performer; controller: EditorController }) {
  return <><label className="form-label">Name for {person.label}<CommitInput label={`Name for ${person.label}`} placeholder="Add a name" allowEmpty value={person.name} onDraftChange={controller.setPendingDraft} maxLength={PROJECT_LIMITS.text.performerName} onCommit={name => controller.dispatch('performer.update', { id: person.id, update: { name } })} /></label>
    <label className="form-label">Section for {person.label}<select aria-label={`Section for ${person.label}`} value={person.sectionId} onChange={e => controller.dispatch('performer.update', { id: person.id, update: { sectionId: e.target.value } })}>{controller.project.sections.map(section => <option value={section.id} key={section.id}>{section.name}</option>)}</select></label></>;
}

export function CastWorkspace({ controller, docked = false }: { controller: EditorController; docked?: boolean }) {
  const { project, projectEpoch, dispatch, setPendingDraft, selectedSet, selectedIds, setSelectedIds, setDialog, castQuery, setCastQuery, sectionFilter, setSectionFilter, rosterInput, activeSet, filteredCast } = controller;
  const visibleIds = filteredCast.map(p => p.id);
  const visibleSelected = filteredCast.filter(p => selectedSet.has(p.id)).length;
  const hiddenSelected = selectedIds.length - visibleSelected;
  const locked = !!controller.transformPreview || !!controller.formationPreview;
  const lockReason = 'Apply or cancel the position preview before changing Cast selection or roster data.';
  const scroll = useRef<HTMLDivElement>(null);
  const allCheckbox = useRef<HTMLInputElement>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const previousSelection = useRef<readonly string[]>([]);
  const anchor = useRef<string | null>(null);
  const activation = useRef<{ id: string; shift: boolean; toggle: boolean } | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const focusId = focusedId && visibleIds.includes(focusedId) ? focusedId : visibleIds.find(id => selectedSet.has(id)) ?? visibleIds[0];
  // Retain a name draft if selection changes from the field or another client.
  const [editingId, setEditingId] = useState<string | null>(selectedIds.length === 1 ? selectedIds[0] : null);
  useEffect(() => { if (!controller.pendingDraft) setEditingId(selectedIds.length === 1 ? selectedIds[0] : null); }, [selectedIds, controller.pendingDraft, projectEpoch]);
  const editing = project.performers.find(p => p.id === editingId);
  useLayoutEffect(() => {
    if (allCheckbox.current) allCheckbox.current.indeterminate = visibleSelected > 0 && visibleSelected < visibleIds.length;
  }, [visibleSelected, visibleIds.length]);
  useLayoutEffect(() => {
    const added = selectedIds.find(id => !previousSelection.current.includes(id) && rows.current.has(id));
    const id = added ?? selectedIds.find(id => rows.current.has(id));
    previousSelection.current = selectedIds;
    const row = id ? rows.current.get(id) : undefined;
    const container = scroll.current;
    if (!row || !container) return;
    const reveal = () => {
      const rect = row.getBoundingClientRect(); const bounds = container.getBoundingClientRect();
      const inset = docked ? 0 : 30;
      if (rect.top < bounds.top + inset) container.scrollTop -= bounds.top + inset - rect.top;
      else if (rect.bottom > bounds.bottom) container.scrollTop += rect.bottom - bounds.bottom;
    };
    reveal();
    // Details and window scaling can change the list height after selection.
    const observer = new ResizeObserver(reveal); observer.observe(container);
    // Reveal without taking keyboard focus from the field or a pending text edit.
    return () => observer.disconnect();
  }, [selectedIds, filteredCast, docked]);
  function choose(id: string, shift = false, toggle = false) {
    if (locked) return;
    setSelectedIds(ids => selectCastRow(ids, visibleIds, id, anchor.current, { shift, toggle }));
    if (!shift) anchor.current = id;
    setFocusedId(id);
  }
  function rowKey(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (event.nativeEvent.isComposing || event.altKey || locked) return;
    const next = nextCastRow(visibleIds, id, event.key);
    if (next) {
      event.preventDefault(); event.stopPropagation();
      if (event.shiftKey) { if (!anchor.current) anchor.current = id; choose(next, true); }
      setFocusedId(next); rows.current.get(next)?.querySelector<HTMLButtonElement>('button')?.focus();
    } else if (event.key === ' ' || event.key === 'Enter') {
      // Native button activation owns the click. Handling both keydown and click
      // can select twice, particularly with macOS Space/Enter input.
      event.stopPropagation(); activation.current = { id, shift: event.shiftKey, toggle: event.key === ' ' || event.ctrlKey || event.metaKey };
    }
  }
  const content = <>
    <div className="cast-panel-heading"><h2>Cast <span className="count-badge">{project.performers.length}</span></h2><div>
      <Button command="cast.show" title={docked ? 'Full Cast table' : 'Dock Cast beside field'} description={docked ? 'Expand Cast to the full table. Keep the selection and filters.' : 'Show Cast beside the field. Keep the selection and filters.'} disabled={locked} disabledReason={lockReason} onClick={() => controller.showCast(docked ? 'table' : 'panel')}>{docked ? <List size={16} /> : <PanelRight size={16} />}</Button>
      {docked && <Button command="cast.show" title="Show Inspector" description="Close the Cast panel and show selection tools beside the field." disabled={locked} disabledReason={lockReason} onClick={() => controller.showCast('closed')}><X size={16} /></Button>}
    </div></div>
    <div className="cast-controls"><label className="search-field"><Search size={16} /><input aria-label="Find a performer" placeholder="Find a performer…" value={castQuery} onChange={e => setCastQuery(e.target.value)} /></label><select aria-label="Filter section" value={sectionFilter} onChange={e => setSectionFilter(e.target.value)}><option value="all">All sections</option>{project.sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <HelpButton title="Add performers" description="Add performers to the roster and every set." className="button subtle" disabled={locked} disabledReason={lockReason} onClick={() => setDialog('add-cast')}><Plus size={15} />Add</HelpButton>
      <HelpButton title="Import roster CSV" description="Import performer labels, names and sections from a CSV file." className="button subtle" disabled={locked} disabledReason={lockReason} onClick={() => rosterInput.current?.click()}><FolderOpen size={15} />{!docked && 'Import CSV'}</HelpButton>
      <Button command="performers.remove" title="Remove selected performers" disabledReason={locked ? lockReason : 'Select performers before removing them from the show.'} onClick={() => setDialog('remove-cast')} disabled={!selectedIds.length || locked}><Trash2 size={16} /></Button>
    </div>
    {hiddenSelected > 0 && <div className="cast-filter-notice" role="status">{hiddenSelected} selected {hiddenSelected === 1 ? 'performer is' : 'performers are'} hidden by the current filters. Selection is kept.<button onClick={() => { setCastQuery(''); setSectionFilter('all'); }}>Show selected performers</button></div>}
    {locked && <p className="cast-filter-notice" role="status">{lockReason}</p>}
    {docked && <label className="cast-select-visible"><input ref={allCheckbox} type="checkbox" aria-label="Select all visible performers" disabled={locked || !visibleIds.length} checked={visibleIds.length > 0 && visibleSelected === visibleIds.length} onChange={e => setSelectedIds(ids => selectVisible(ids, visibleIds, e.target.checked))} />Select visible · {filteredCast.length}<span>{selectedIds.length} selected</span></label>}
    <div className="table-scroll" ref={scroll} aria-label={docked ? 'Cast performers' : 'Cast table'}>
      {docked ? <ul className="cast-list" aria-label="Performers">{filteredCast.map(p => <li key={p.id} ref={node => { if (node) rows.current.set(p.id, node); else rows.current.delete(p.id); }} data-cast-id={p.id} className={selectedSet.has(p.id) ? 'selected' : ''}>
        <button aria-label={`Select ${p.label}, ${p.name || "Unnamed performer"}, ${project.sections.find(s => s.id === p.sectionId)?.name}`} aria-pressed={selectedSet.has(p.id)} disabled={locked} tabIndex={focusId === p.id ? 0 : -1} onFocus={() => setFocusedId(p.id)} onKeyDown={e => rowKey(e, p.id)} onClick={e => { const intent = e.detail === 0 && activation.current?.id === p.id ? activation.current : null; activation.current = null; choose(p.id, intent?.shift ?? e.shiftKey, intent?.toggle ?? (e.ctrlKey || e.metaKey)); }}><span className="performer-label" style={{ borderColor: project.sections.find(s => s.id === p.sectionId)?.color }}>{p.label}</span><span className="cast-person"><strong>{p.name || 'Unnamed performer'}</strong><span>{project.sections.find(s => s.id === p.sectionId)?.name}</span></span><span className="cast-selection-mark" aria-hidden="true">{selectedSet.has(p.id) ? '✓' : ''}</span></button>
      </li>)}</ul> : <table className="cast-table"><thead><tr><th><input ref={allCheckbox} type="checkbox" aria-label="Select all visible performers" disabled={locked || !visibleIds.length} checked={visibleIds.length > 0 && visibleSelected === visibleIds.length} onChange={e => setSelectedIds(ids => selectVisible(ids, visibleIds, e.target.checked))} /></th><th>Label</th><th>Performer</th><th>Section</th><th>Set {controller.index + 1} coordinate</th></tr></thead><tbody>{filteredCast.map(p => <tr key={p.id} data-cast-id={p.id} ref={node => { if (node) rows.current.set(p.id, node); else rows.current.delete(p.id); }} className={selectedSet.has(p.id) ? 'selected' : ''}><td><input type="checkbox" aria-label={`Select ${p.label}`} disabled={locked} checked={selectedSet.has(p.id)} onChange={e => setSelectedIds(ids => selectVisible(ids, [p.id], e.target.checked))} /></td><td><button className="performer-label" aria-label={`Select only ${p.label}`} disabled={locked} style={{ borderColor: project.sections.find(s => s.id === p.sectionId)?.color }} onClick={e => choose(p.id, e.shiftKey, e.ctrlKey || e.metaKey)}>{p.label}</button></td><td><fieldset className="cast-inline-edit" disabled={locked}><CommitInput key={`${projectEpoch}:${p.id}`} label={`Name for ${p.label}`} placeholder="Add a name" allowEmpty value={p.name} onDraftChange={setPendingDraft} maxLength={PROJECT_LIMITS.text.performerName} onCommit={name => dispatch('performer.update', { id: p.id, update: { name } })} /></fieldset></td><td><select disabled={locked} aria-label={`Section for ${p.label}`} value={p.sectionId} onChange={e => dispatch('performer.update', { id: p.id, update: { sectionId: e.target.value } })}>{project.sections.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</select></td><td className="coordinate-cell">{coordinateDescription(activeSet.positions[p.id], project.field, controller.coordinateFormat)}</td></tr>)}</tbody></table>}
      {!filteredCast.length && <div className="empty-state"><Users /><h3>{project.performers.length ? 'No matching performers' : 'Start with your ensemble'}</h3><p>{project.performers.length ? 'Change search or section filters to see more performers.' : 'Add performers or import a CSV roster to start designing.'}</p>{project.performers.length > 0 && <button className="button subtle" onClick={() => { setCastQuery(''); setSectionFilter('all'); }}>Clear Cast filters</button>}</div>}
    </div>
    {docked && <div className="cast-edit"><h3>{editing ? `Edit ${editing.label}` : 'Performer details'}</h3>{editing ? <>
      {selectedIds.length !== 1 || selectedIds[0] !== editing.id ? <p className="microcopy">Finish or cancel this name edit before editing another performer.</p> : null}
      <fieldset disabled={locked}><PerformerFields key={`${projectEpoch}:${editing.id}`} person={editing} controller={controller} /></fieldset><p className="microcopy">Set {controller.index + 1}: {coordinateDescription(activeSet.positions[editing.id], project.field, controller.coordinateFormat)}</p><p className="microcopy">Enter applies · Escape cancels. Names and sections update across every set.</p>
    </> : <p className="microcopy">Select one performer to edit their name and section.</p>}</div>}
    <div className="table-footer">{filteredCast.length} shown · {selectedIds.length} selected{!docked && <span>Names and sections update across every set.</span>}</div>
    {docked && <p className="cast-keyboard-help">Arrows/Home/End: focus · Space: toggle · Enter: select · Shift: add range · Ctrl/⌘-click: toggle</p>}
  </>;
  return docked ? <aside className="cast-workspace cast-dock" aria-label="Cast panel">{content}</aside> : <section className="cast-workspace" aria-label="Full Cast table">{content}</section>;
}

CastWorkspace.displayName = 'CastWorkspace';
