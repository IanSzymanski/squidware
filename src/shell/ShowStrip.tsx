import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AudioLines, Bookmark, ChevronDown, ChevronsLeft, ChevronsRight, Images, LoaderCircle, LocateFixed, Maximize2, Music, PanelBottomClose, PanelBottomOpen, Pause, Play, Plus, Repeat2, Ruler, Search, SkipBack, SkipForward, SlidersHorizontal, Timer, TriangleAlert, Volume2, VolumeX, Waves, ZoomIn, ZoomOut } from 'lucide-react';
import { compileScore, scoreLabel, scorePosition, scoreTicks } from '../score';
import { countToSeconds, PROJECT_LIMITS, secondsToCount, setStartCount, setTiming } from '../domain';
import { activePassage, resolvePassage } from '../rehearsal';
import { uiScale } from '../uiScale';
import { Tooltip } from '../components/Tooltip';
import { HelpButton } from '../editor/ControlHelp';
import { MiniField } from '../editor/EditorControls';
import { OverflowMenu } from '../editor/OverflowMenu';
import { ProblemTimeline } from '../editor/ProblemTimeline';
import { useShowChecks } from '../editor/ShowAnalysis';
import { canChangeLayout } from '../editor/commands';
import { isModalOpen } from '../editor/confirmation';
import { useEditorSelector } from '../editor/react';
import { matchingSets } from '../editor/setList';
import { formatTimelineCount as fmt, formatTransportCount, timelineLabels, timelineReadout, timelineWindow, transportCount } from '../editor/timelineNavigation';
import type { PathOperationsSession } from '../editor/usePathOperations';
import type { EditorController } from '../editor/useEditorController';
import { Menu, type MenuEntry } from '../ui/Menu';
import type { ShellLayout } from './useShellLayout';
import { useScrollCue } from './useScrollCue';

const pad = (n: number) => String(n).padStart(2, '0');
/** Transport options in order, More playback options among them when it is shown. */
const OPTIONS = '.timeline .transport-options [aria-label]';
/** On a thumbnail card, a name written as "movement · title" shows its title; the card's number and tooltip carry the rest. */
const cardName = (name: string) => { const at = name.lastIndexOf(' · '); return at > 0 && at < name.length - 3 ? name.slice(at + 3) : name; };

function MoveOperationTrack({ editor, percent }: { editor: PathOperationsSession; percent: (count: number) => number }) {
  const { preview } = editor;
  if (!preview) return <div className="move-operation-track" />;
  const { savedRange, proposedRange, savedCount, proposedCount, start } = preview;
  const copy = editor.values.kind === 'copy';
  const tracks = [{ label: 'Saved', range: savedRange, count: savedCount }, { label: copy ? 'Copy' : 'Preview', range: proposedRange, count: proposedCount }];
  return <div className="move-operation-track" role="img" aria-label={tracks.map(({ label, range, count }) =>
    `${label} show counts ${fmt(start + range.start)} to ${fmt(start + range.end)}, preview at ${fmt(start + count)}`).join('. ')}>
    {tracks.map(({ label, range, count }, row) => {
      const left = percent(start + range.start), right = percent(start + range.end);
      const from = Math.max(0, left), to = Math.min(100, right), sample = percent(start + count);
      const ticks = new Set(range.segments.flatMap(segment => [segment.startCount, segment.endCount])
        .filter(value => value > range.start && value < range.end)
        .map(value => Math.round(percent(start + value) * 2) / 2)
        .filter(at => at > from && at < to));
      return <div key={label} className={`move-operation-track-row${row === 0 ? ' is-saved' : ''}`} aria-hidden="true">
        <span className="move-operation-track-name">{label}</span>
        {from < to && <span className="move-operation-range" style={{ left: `${from}%`, width: `${to - from}%` }}
          data-continues-left={left < 0 || undefined} data-continues-right={right > 100 || undefined} />}
        {Array.from(ticks, at => <i className="move-operation-tick" key={at} style={{ left: `${at}%` }} />)}
        {sample >= 0 && sample <= 100 && <i className="move-operation-sample" style={{ left: `${sample}%` }} />}
      </div>;
    })}
  </div>;
}

/** Search by number or name and jump: the whole set list on demand, without a permanent panel. */
function SetFinder({ controller: c, locked }: { controller: EditorController; locked: boolean }) {
  const { project, index } = c;
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement | null>(null), panel = useRef<HTMLDivElement>(null);
  const rows = matchingSets(project.sets, query), current = Math.min(active, Math.max(0, rows.length - 1));
  const close = (focus = true) => { setOpen(false); setQuery(''); if (focus) trigger.current?.focus({ preventScroll: true }); };
  useLayoutEffect(() => {
    const node = panel.current, anchor = trigger.current;
    if (!open || !node || !anchor) return;
    const scale = uiScale(), rect = anchor.getBoundingClientRect();
    const view = { width: document.documentElement.clientWidth / scale, height: document.documentElement.clientHeight / scale };
    node.style.left = `${Math.max(8, Math.min(rect.left / scale, view.width - node.offsetWidth - 8))}px`;
    node.style.bottom = `${view.height - rect.top / scale + 6}px`;
    node.querySelector('input')?.focus();
    setActive(Math.max(0, rows.indexOf(index)));
  }, [open]);
  useEffect(() => { panel.current?.querySelector('[data-active=true]')?.scrollIntoView({ block: 'nearest' }); }, [current, open, query]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => { const target = event.target as Node; if (!panel.current?.contains(target) && !trigger.current?.contains(target)) close(false); };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);
  const go = (next: number) => { close(); c.dispatch('set.select', { index: next }); };
  // Each row says where the set falls in the music.
  const score = useMemo(() => compileScore(project), [project]);
  const starts = useMemo(() => project.sets.map((_, i) => setStartCount(project, i)), [project]);
  const position = timelineReadout(project, useEditorSelector(state => state.playback.count));
  return <>
    <HelpButton pointerPassThrough title="Find set" description="Search every set by number or name and jump to it." className="set-jump" aria-haspopup="dialog" aria-expanded={open}
      disabled={locked} disabledReason="Finish or cancel the current input or preview first."
      onClick={event => { trigger.current = event.currentTarget; setOpen(!open); }}>
      <span className="set-jump-number">{position.opening || position.arrived ? '' : '→ '}{pad(position.setIndex + 1)}</span>
      <span className="set-jump-name" title={position.name}>{position.name}</span>
      <ChevronDown size={12} />
    </HelpButton>
    {open && createPortal(<div ref={panel} className="popover set-finder" role="dialog" aria-label="Find set" data-escape-scope=""
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
        if (event.key === 'Enter' && rows.length) { event.preventDefault(); event.stopPropagation(); go(rows[current]); }
        if (['ArrowDown', 'ArrowUp'].includes(event.key) && rows.length) { event.preventDefault(); event.stopPropagation(); setActive((current + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length); }
        if (event.key === ' ') event.stopPropagation();
      }}>
      <label className="set-finder-search"><Search size={14} aria-hidden="true" /><input type="search" aria-label="Find set" placeholder="Set number or name" maxLength={160} value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} /></label>
      <div className="set-finder-list" role="listbox" aria-label="Sets">
        {rows.map((i, at) => {
          const timing = setTiming(project, i);
          return <button key={project.sets[i].id} type="button" role="option" aria-selected={i === index} data-active={at === current} className="menu-item" tabIndex={-1} onMouseMove={() => setActive(at)} onClick={() => go(i)}>
            <span className="set-finder-number">{pad(i + 1)}</span>
            <span className="menu-item-label">{project.sets[i].name}</span>
            <span className="menu-item-hint">{scoreLabel(score, starts[i]).split(' · ')[0]} · {i === 0 ? 'Opening' : `${timing.counts} counts · ${timing.tempo} BPM`}</span>
          </button>;
        })}
        {!rows.length && <p className="empty-state" role="status">No matching sets. Enter a number from 1 to {project.sets.length}, or part of a name.</p>}
      </div>
    </div>, document.body)}
  </>;
}

/** Every set as a card, in show order: the storyboard of the show. Drag or Alt+arrows reorders. */
function SetStrip({ controller: c, addButton }: { controller: EditorController; addButton: boolean }) {
  const { project, index, projectEpoch, thumbnailDots, preferences } = c;
  const revision = useEditorSelector(state => state.project.revision);
  const locked = !useEditorSelector(canChangeLayout);
  const thumbnails = preferences.value.setThumbnails;
  const [over, setOver] = useState<number | null>(null), [dragId, setDragId] = useState<string | null>(null);
  const drag = useRef<{ id: string; revision: number; epoch: number } | null>(null), list = useRef<HTMLDivElement>(null);
  useScrollCue(list, 'x');
  const activeId = project.sets[index].id;
  const resetDrag = () => { drag.current = null; setDragId(null); setOver(null); };
  const card = (id: string) => Array.from(list.current?.querySelectorAll<HTMLButtonElement>('.set-card') ?? []).find(node => node.dataset.setId === id);
  useLayoutEffect(() => { resetDrag(); }, [activeId, index, revision, projectEpoch, locked]);
  useLayoutEffect(() => { card(activeId)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [activeId, index, project.sets.length, thumbnails]);
  const select = (next: number, focus = false) => { if (c.dispatch('set.select', { index: next }) && focus) card(project.sets[next].id)?.focus(); };
  const from = project.sets.findIndex(set => set.id === dragId);
  // Problems found in the move into each set.
  const checks = useShowChecks();
  const flags = project.sets.map((_, i) => i === 0 ? 0 : checks.moves[i - 1]?.issues.length ?? 0);
  const danger = project.sets.map((_, i) => i > 0 && !!checks.moves[i - 1]?.issues.some(issue => issue.severity === 'danger'));
  return <div className={`set-strip${thumbnails ? ' set-strip--thumbnails' : ''}`}>
    <div className="set-list" ref={list} role="group" aria-label="Sets"
      onWheel={event => { if (list.current && !event.shiftKey && Math.abs(event.deltaY) > Math.abs(event.deltaX)) list.current.scrollLeft += event.deltaY; }}
      onDragOver={event => {
        if (!drag.current || !list.current) return;
        const rect = list.current.getBoundingClientRect();
        if (event.clientX < rect.left + 48) list.current.scrollLeft -= 24; else if (event.clientX > rect.right - 48) list.current.scrollLeft += 24;
      }} onDrop={resetDrag}>
      {project.sets.map((set, i) => {
        const timing = setTiming(project, i);
        return <HelpButton pointerPassThrough key={set.id} command="set.select" showShortcut={false} title={`Set ${i + 1}: ${set.name}`}
          description={`${i === 0 ? 'Opening set' : `${timing.counts} counts at ${timing.tempo} ${project.tempoMap ? 'base BPM' : 'BPM'}`}${flags[i] ? ` · ${flags[i]} ${flags[i] === 1 ? 'problem' : 'problems'} in the move into this set` : ''}. Drag to reorder, or use Alt+Left and Alt+Right.`}
          state={index === i ? 'Current set' : undefined} aria-current={index === i ? 'step' : undefined} tabIndex={i === index ? 0 : -1} data-set-id={set.id} disabled={locked}
          className={`set-card${index === i ? ' selected' : ''}${over === i && from !== i ? from < i ? ' drop-after' : ' drop-before' : ''}${dragId === set.id ? ' dragging' : ''}`}
          draggable={!locked}
          onDragStart={event => { drag.current = { id: set.id, revision, epoch: projectEpoch }; setDragId(set.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-squidware-set', set.id); }}
          onDragEnd={resetDrag}
          onDragOver={event => { if (drag.current && !locked) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOver(i); } }}
          onDrop={event => {
            if (!drag.current || locked) return;
            event.preventDefault(); event.stopPropagation();
            // The command confirms the move, including any change to the opening's timing.
            if (drag.current.id !== set.id && !c.dispatch('set.move-to', { ...drag.current, target: i })) c.notify(c.store.getState().ui.toast || 'The set order changed or an edit is pending. Try again.');
            resetDrag();
          }}
          onClick={() => select(i)}
          onKeyDown={event => {
            if (locked || event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.shiftKey) return;
            const back = ['ArrowLeft', 'ArrowUp'].includes(event.key), forward = ['ArrowRight', 'ArrowDown'].includes(event.key);
            if (event.altKey && (back || forward)) { event.preventDefault(); event.stopPropagation(); c.dispatch('set.reorder', { index: i, direction: back ? -1 : 1 }); card(set.id)?.focus(); return; }
            if (!event.altKey && (back || forward || event.key === 'Home' || event.key === 'End')) {
              event.preventDefault(); event.stopPropagation();
              select(event.key === 'Home' ? 0 : event.key === 'End' ? project.sets.length - 1 : Math.max(0, Math.min(project.sets.length - 1, i + (forward ? 1 : -1))), true);
            }
          }}>
          {thumbnails && <span className="set-card-thumb"><MiniField positions={set.positions} dots={thumbnailDots} field={project.field} />
            <span className="set-number">{pad(i + 1)}</span>
            {i > 0 && <span className="set-row-counts">{timing.counts}</span>}
            {flags[i] > 0 && <span className={`set-card-flag${danger[i] ? ' danger' : ''}`}><TriangleAlert size={10} aria-hidden="true" />{flags[i]}</span>}
          </span>}
          <span className="set-card-caption">
            {!thumbnails && <span className="set-number">{pad(i + 1)}</span>}
            <span className="set-row-name">{thumbnails ? cardName(set.name) : set.name}</span>
            {!thumbnails && flags[i] > 0 && <span className={`set-card-flag${danger[i] ? ' danger' : ''}`}><TriangleAlert size={10} aria-hidden="true" />{flags[i]}</span>}
            {!thumbnails && i > 0 && <span className="set-row-counts">{timing.counts}</span>}
          </span>
        </HelpButton>;
      })}
    </div>
    {addButton && <HelpButton command="set.hold" showShortcut={false} title="Add set" description="Add the next set, starting from this picture. The dialog also offers a repeat, a clean staging grid or an insert, and you choose the counts before it is created."
      disabled={project.sets.length >= PROJECT_LIMITS.sets} disabledReason={`A production can contain at most ${PROJECT_LIMITS.sets} sets.`} className="add-set" onClick={c.addSet}>
      <Plus size={16} /><span>Add set</span>
    </HelpButton>}
  </div>;
}

/** Playback, position in the show, a count-proportional scrubber and the set strip. */
export function ShowStrip({ controller, layout }: { controller: EditorController; layout: ShellLayout }) {
  const { project, playing, loop, setLoop, speed, setSpeed, metronome, audioName, audioLoading, muted, setMuted, index, duration, selectSet, togglePlay, scrub, waveform } = controller;
  const transport = layout.breakpoints.transport;
  const count = useEditorSelector(state => state.playback.count);
  const clockStatus = useEditorSelector(state => state.playback.clockStatus);
  const rehearsalId = useEditorSelector(state => state.playback.rehearsalId);
  const locked = !useEditorSelector(canChangeLayout);
  const passage = activePassage(project, rehearsalId), resolved = passage ? resolvePassage(project, passage) : undefined;
  const position = timelineReadout(project, count), shown = transportCount(position.count, playing);
  const score = useMemo(() => compileScore(project), [project]), musical = scorePosition(score, shown);
  const setsVisible = layout.arrangement.timeline === 'full' && layout.mode === 'write';
  const toggleSets = () => { controller.dispatch('workspace.update', { update: { timeline: layout.arrangement.timeline === 'full' ? 'compact' : 'full' } }); };

  // The count window: fitted to the show by default, zoomable for precise scrubbing.
  const viewportRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600), [zoom, setZoom] = useState(1), [start, setStart] = useState(0), [follow, setFollow] = useState(true);
  const [musicalRuler, setMusicalRuler] = useState(true);
  const view = timelineWindow(duration, width, zoom, start);
  const movePreview = controller.pathOperations?.preview;
  // On a fitted timeline, leave space for a proposed end beyond the saved show.
  const span = view.zoom === 1 && movePreview ? Math.max(view.span, movePreview.start + movePreview.proposedRange.end) : view.span;
  const savedEnd = Math.min(duration, view.start + span);
  const scrubberWidth = span > view.span ? `calc(${savedEnd / span * 100}% + 10px)` : undefined;
  useLayoutEffect(() => {
    const element = viewportRef.current!;
    const observer = new ResizeObserver(() => setWidth(Math.max(1, element.clientWidth - 28)));
    observer.observe(element); setWidth(Math.max(1, element.clientWidth - 28));
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setZoom(1); setStart(0); setFollow(true); }, [project.id]);
  useEffect(() => {
    if (follow && (count < view.start || count > view.start + span * (playing ? .9 : 1))) setStart(timelineWindow(duration, width, zoom, count - span * .15).start);
  }, [count, duration, width, zoom, follow, playing, span, view.start]);
  // Set numbers read as a scale: every set when there is room, otherwise every second, fifth or tenth, plus the current one.
  const perSet = width / Math.max(1, project.sets.length * span / Math.max(1, duration));
  const numberStride = [1, 5, 10, 20].find(stride => perSet * stride >= 34) ?? 50;
  // A segment whose move has problems shows its marker instead of its number.
  const showChecks = useShowChecks();
  const flagged = useMemo(() => new Set(showChecks.moves.flatMap((move, i) => move.issues.length ? [i + 1] : [])), [showChecks.moves]);
  const starts = useMemo(() => project.sets.map((_, i) => setStartCount(project, i)), [project]);
  // The current set is always numbered; the others take their turn where a number has room.
  const numbered = useMemo(() => {
    const at = (i: number) => ((starts[Math.max(0, i - 1)] + starts[i]) / 2 - view.start) / span * width;
    const shown = new Set<number>([index]), taken = [at(index)];
    for (let i = 1; i < starts.length; i++) {
      if (i === index || (i + 1) % numberStride || flagged.has(i)) continue;
      if (taken.every(x => Math.abs(x - at(i)) >= 22)) { shown.add(i); taken.push(at(i)); }
    }
    return shown;
  }, [starts, index, numberStride, flagged, view.start, span, width]);
  const arrivals = useMemo(() => project.sets.map((set, i) => ({ set, index: i, count: setStartCount(project, i), from: setStartCount(project, Math.max(0, i - 1)), counts: setTiming(project, i).counts })), [project]);
  const labels = musicalRuler ? scoreTicks(score, view.start, savedEnd, width) : timelineLabels(project, view.start, span, width).map(value => ({ count: value, label: fmt(value) }));
  const markGroups = new Map<number, typeof score.marks>();
  for (const mark of score.marks.filter(m => m.count >= view.start && m.count <= view.start + span)) { const bucket = Math.floor((mark.count - view.start) / span * width / 26); markGroups.set(bucket, [...(markGroups.get(bucket) ?? []), mark]); }
  const marks = [...markGroups.values()];
  const percent = (value: number) => (value - view.start) / span * 100;
  const changeZoom = (next: number) => {
    const anchor = count >= view.start && count <= view.start + span ? count : view.start + span / 2;
    const fraction = (anchor - view.start) / span;
    const nextView = timelineWindow(duration, width, next, 0);
    setZoom(nextView.zoom); setStart(timelineWindow(duration, width, nextView.zoom, anchor - fraction * nextView.span).start);
  };

  const timelineMenu: MenuEntry[] = [
    { label: 'Zoom in', icon: <ZoomIn size={15} />, keepOpen: true, disabled: view.zoom >= view.maxZoom, disabledReason: 'Timeline is at maximum zoom.', onSelect: () => changeZoom(view.zoom * 2) },
    { label: 'Zoom out', icon: <ZoomOut size={15} />, keepOpen: true, disabled: view.zoom <= 1, disabledReason: 'The whole show is visible.', onSelect: () => changeZoom(view.zoom / 2) },
    { label: 'Fit whole show', icon: <Maximize2 size={15} />, onSelect: () => { setZoom(1); setStart(0); } },
    { label: 'Follow playhead', icon: <LocateFixed size={15} />, checked: follow, keepOpen: true, description: 'Keep the playhead visible during playback, stepping and set navigation.', onSelect: () => setFollow(!follow) },
    { type: 'separator' },
    { label: 'Ruler in measures', icon: <Ruler size={15} />, checked: musicalRuler, radio: true, keepOpen: true, onSelect: () => setMusicalRuler(true) },
    { label: 'Ruler in counts', icon: <Ruler size={15} />, checked: !musicalRuler, radio: true, keepOpen: true, onSelect: () => setMusicalRuler(false) },
    { type: 'separator' },
    { label: 'Set thumbnails', icon: <Images size={15} />, checked: controller.preferences.value.setThumbnails, keepOpen: true, onSelect: () => controller.preferences.update({ setThumbnails: !controller.preferences.value.setThumbnails }) },
    { type: 'heading', label: 'Music' },
    { label: 'Score map…', icon: <Music size={15} />, command: 'score.open', onSelect: () => { controller.dispatch('score.open'); } },
    { label: 'Tempo map…', icon: <Timer size={15} />, command: 'tempo.open', onSelect: () => { controller.dispatch('tempo.open'); } },
    { label: 'Align recording…', icon: <Waves size={15} />, command: 'audio.align-open', onSelect: () => { controller.dispatch('audio.align-open'); } },
    { label: 'Metronome and count-in…', icon: <Timer size={15} />, onSelect: () => { controller.dispatch('dialog.open', { dialog: 'metronome' }); } },
  ];

  const rehearsal = <HelpButton command="rehearsal.open" title="Rehearsal passages" className="icon-button" active={!!passage} onClick={() => controller.dispatch('rehearsal.open')}><Bookmark size={16} /><span className="overflow-option-label">Rehearsal passages</span></HelpButton>;
  const audio = <HelpButton title={audioName ? 'Replace audio' : 'Attach audio'} description="Choose a local audio file to accompany rehearsal playback." disabledReason="Wait for the audio file to finish loading." className={`audio-attach ${audioName ? 'attached' : ''}`} onClick={() => void controller.chooseAudio()} disabled={audioLoading || !!controller.fileOperation}>{audioLoading ? <LoaderCircle size={14} className="spin" /> : <AudioLines size={14} />}<span className="audio-file-label">{audioName || 'Add audio'}</span></HelpButton>;
  const loopButton = <HelpButton title={resolved?.end ? 'Loop range' : 'Loop show'} description={resolved?.end ? 'Repeat the active count range using the shared audio clock.' : 'Restart from the opening set when playback reaches the end.'} className="icon-button transport-labelled" active={loop} onClick={() => setLoop(!loop)}><Repeat2 size={16} /><span className="overflow-option-label">{resolved?.end ? 'Loop range' : 'Loop show'}</span></HelpButton>;
  const metronomeButton = <HelpButton title="Metronome" command="metronome.toggle" description="Toggle meter-aware clicks. Configure meter and count-in from the timeline menu." className="icon-button transport-labelled" active={metronome} onClick={() => controller.dispatch('metronome.toggle')}><Timer size={16} /><span className="overflow-option-label">Metronome</span></HelpButton>;
  const speedSelect = <label className="transport-speed"><span className="overflow-option-label">Speed</span><Tooltip name="Playback speed" description="Change rehearsal speed without changing the written move tempos." state={`${speed}×`}><select aria-label="Playback speed" value={speed} onChange={event => setSpeed(Number(event.target.value))}><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option></select></Tooltip></label>;
  // Stable keys: a tier change never turns one folded control's node into another. Folded options keep the order they have in the transport.
  const folded = (transport === 'full' ? [] : transport === 'compact' ? ['loop', 'metronome', 'speed'] : ['audio', 'rehearsal', 'loop', 'metronome', 'speed']).map(key => <Fragment key={key}>{{ rehearsal, audio, loop: loopButton, metronome: metronomeButton, speed: speedSelect }[key]}</Fragment>);
  // A tier change (a resize, a UI scale change, focus mode or the side panel docking beside the field) moves options
  // between the transport and More playback options, also under a dialog (a confirmation included) opened from one.
  // Focus on a moved option then follows it to where it is now, or to More when it is folded away, instead of falling
  // to the page; focus on More itself, when a wider tier removes it, moves to the first option that left the menu.
  // Only focus held as the change renders counts: each render while no dialog is shown notes the focused option (a tier
  // change and an opening dialog render here before their commit), and a shown dialog keeps the option it opened from.
  // Focus that left for the page stays there.
  const moving = useRef<{ modal: boolean; node: Element | null; beside: string[] }>({ modal: false, node: null, beside: [] }), focused = document.activeElement;
  if (!moving.current.modal) {
    const node = moving.current.node = focused?.closest('.timeline .transport-options') ? focused : null;
    // What the transport shows beside More (its open panel aside): an option that is new after More goes is one that left the menu.
    moving.current.beside = node?.matches('.overflow-menu-trigger') ? Array.from(document.querySelectorAll(OPTIONS)).filter(option => !option.closest('.overflow-menu-panel')).map(option => option.getAttribute('aria-label') ?? '') : [];
  }
  const modal = useEditorSelector(state => isModalOpen(state) || state.ui.paletteOpen);
  useLayoutEffect(() => {
    const { node, beside } = moving.current, label = node?.getAttribute('aria-label');
    moving.current.modal = modal;
    if (modal || !label || node?.isConnected || document.activeElement !== document.body) return;
    moving.current.node = null;
    const options = [...document.querySelectorAll<HTMLElement>(OPTIONS)];
    const named = (name: string) => options.find(option => option.getAttribute('aria-label') === name);
    (named(label) ?? named('More playback options') ?? (beside.length ? options.find(option => !beside.includes(option.getAttribute('aria-label') ?? '')) : undefined))?.focus();
  }, [modal, transport]);
  const status = clockStatus.startsWith('Fermata') ? `Hold · ${clockStatus.split(' · ').at(-1)?.replace(' remaining', '')}` : clockStatus.startsWith('Count-in') ? clockStatus : clockStatus.startsWith('Metronome unavailable') ? 'Click unavailable' : '';

  return <section className="timeline show-strip" aria-label="Show timeline" data-sets={setsVisible || undefined}>
    {passage && resolved && <div className="rehearsal-status" role="status"><span><strong>{passage.name}</strong> · {resolved.end ? `Counts ${resolved.start.count}–${resolved.end.count}` : `Bookmark ${resolved.start.count}`} · {resolved.focus.label} · {resolved.focus.ids.length} on field{passage.notes ? ` · ${passage.notes}` : ''}</span><button className="button small" onClick={() => controller.dispatch('rehearsal.clear')}>Full show</button></div>}
    {controller.portableAudio.audioWarning && <div className="rehearsal-status rehearsal-status--warning" role="status"><span>{controller.portableAudio.audioWarning}</span><button className="button small" disabled={audioLoading || !!controller.fileOperation} onClick={() => void controller.chooseAudio()}>Relink audio</button></div>}

    <div className="transport">
      <div className="play-controls">
        <HelpButton command="set.select" showShortcut={false} title="First set" className="icon-button timeline-edge-set" description="Stop playback and return to the opening set." onClick={() => selectSet(0)}><ChevronsLeft size={16} /></HelpButton>
        <HelpButton command="set.select" shortcutVariant={0} title="Previous set" className="icon-button" disabled={index === 0} disabledReason="This is already the first set." onClick={() => selectSet(index - 1)}><SkipBack size={16} /></HelpButton>
        <span className="divider-vertical" />
        <HelpButton command="playback.count-previous" title="Previous count" className="icon-button count-step" disabled={count <= 0} disabledReason="The opening set is count zero." onClick={() => controller.dispatch('playback.count-previous')}>−1</HelpButton>
        <HelpButton command="playback.toggle" title={playing ? 'Pause playback' : 'Play show'} state={playing ? 'Playing' : 'Paused'} disabled={!duration} disabledReason="Add a second set with move counts to rehearse a transition." className="play-button" aria-label={playing ? 'Pause playback' : 'Play show'} onClick={togglePlay}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</HelpButton>
        <HelpButton command="playback.count-next" title="Next count" className="icon-button count-step" disabled={count >= duration} disabledReason="This is the final show count." onClick={() => controller.dispatch('playback.count-next')}>+1</HelpButton>
        <span className="divider-vertical" />
        <HelpButton command="set.select" shortcutVariant={1} title="Next set" className="icon-button" disabled={index === project.sets.length - 1} disabledReason="This is already the last set." onClick={() => selectSet(index + 1)}><SkipForward size={16} /></HelpButton>
        <HelpButton command="set.select" showShortcut={false} title="Last set" className="icon-button timeline-edge-set" description="Stop playback and arrive at the final set." onClick={() => selectSet(project.sets.length - 1)}><ChevronsRight size={16} /></HelpButton>
      </div>

      <div className="count-display">
        <SetFinder controller={controller} locked={locked} />
        <span className="move-count readout" title={position.name}>
          <span className="readout-label move-heading">{position.opening ? 'Opening' : position.arrived ? 'At set' : 'Move'}</span>
          <span className="readout-value" role={status ? 'status' : undefined} aria-label={clockStatus.startsWith('Fermata') ? clockStatus : undefined}>
            {status || (position.opening ? <strong>0</strong> : <><strong>{fmt(transportCount(position.localCount, playing))}</strong><small>/ {position.counts}</small></>)}
          </span>
        </span>
        <span className="readout readout--score">
          <span className="readout-label">Measure</span>
          <small className="score-readout readout-value" aria-label="Score position" title={`${scoreLabel(score, shown)} · ${musical.meter.numerator}/${musical.meter.denominator}${musical.mark ? ` · ${musical.mark}` : ''}`}><strong>{scoreLabel(score, shown)}</strong>{musical.mark ? <span className="score-mark-chip">{musical.mark}</span> : null}</small>
        </span>
        <span className="show-count readout">
          <small className="readout-label">Show</small>
          <span className="readout-value"><strong>{fmt(transportCount(count, playing))}</strong><small>/ {duration}</small></span>
        </span>
      </div>

      <div className="transport-options">
        {transport !== 'narrow' && <>{audio}{rehearsal}</>}
        {transport === 'full' && <>{loopButton}{metronomeButton}{speedSelect}</>}
        <HelpButton title={muted ? 'Unmute audio' : 'Mute audio'} description="Mute or restore the attached rehearsal audio; metronome clicks are separate." state={muted ? 'Muted' : 'Audible'} className="icon-button" active={muted} onClick={() => setMuted(!muted)}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</HelpButton>
        {folded.length > 0 && <OverflowMenu title="More playback options" description={transport === 'compact' ? 'Loop, metronome and playback speed. A wider window shows them in the transport.' : 'Audio, rehearsal passages, loop, metronome and playback speed. A wider window shows them in the transport.'} placement="above">{folded}</OverflowMenu>}
        <span className="divider-vertical" />
        {/* With the strip out of sight, in a short window or when hidden, adding a set stays one click away. */}
        {layout.mode === 'write' && (!setsVisible || layout.breakpoints.short) && <HelpButton command="set.hold" showShortcut={false} title="Add set" description="Add the next set, starting from this picture. The dialog also offers a repeat, a clean staging grid or an insert."
          disabled={project.sets.length >= PROJECT_LIMITS.sets} disabledReason={`A production can contain at most ${PROJECT_LIMITS.sets} sets.`} className="icon-button" onClick={controller.addSet}><Plus size={16} /></HelpButton>}
        {layout.mode === 'write' && <HelpButton pointerPassThrough title={setsVisible ? 'Hide set strip' : 'Show set strip'} description="Show or hide the strip of set thumbnails to give the field more room." className="icon-button strip-toggle" aria-expanded={setsVisible} disabled={layout.locked} disabledReason="Finish or cancel the current input or preview first." onClick={toggleSets}>{setsVisible ? <PanelBottomClose size={16} /> : <PanelBottomOpen size={16} />}</HelpButton>}
        <Menu label="Timeline options" description="Zoom the timeline, show or hide the set strip, and open the score, tempo and recording tools." className="icon-button" align="end" side="above" items={timelineMenu}><SlidersHorizontal size={16} /></Menu>
      </div>
    </div>

    <div className="timeline-tracks">
      <div className="timeline-viewport" ref={viewportRef}>
        <div className="tracks">
          <div className="count-ruler">
            {labels.map(label => <span key={label.count} style={{ left: `${percent(label.count)}%` }}>{label.label}</span>)}
            {marks.map(group => {
              const mark = group[0], p = scorePosition(score, mark.count);
              return <HelpButton key={mark.count} title={group.length === 1 ? `Rehearsal mark ${mark.label}` : `${group.length} rehearsal marks`} description={group.map(m => `${m.label} · ${scoreLabel(score, m.count)} · count ${m.count}`).join('; ')} className="score-mark" style={{ left: `${percent(mark.count)}%` }} onClick={() => group.length === 1 ? controller.dispatch('score.seek', { measure: p.measure, beat: p.beat }) : controller.dispatch('score.open')}><span className="sr-only">{group.length === 1 ? mark.label : `${group.length} marks`}</span></HelpButton>;
            })}
          </div>
          <div className="set-track">
            {/* The opening set leads the DOM so Tab follows set order. */}
            {view.start === 0 && <HelpButton command="set.select" showShortcut={false} title={`Opening set: ${project.sets[0].name}`} description="Set 1 is the opening picture at show count zero." className={`timeline-opening ${index === 0 ? 'active' : ''}`} onClick={() => selectSet(0)}><span className="sr-only">01</span></HelpButton>}
            {arrivals.filter(a => a.index > 0 && a.count > view.start && a.from < view.start + span).map(a => {
              const left = Math.max(0, percent(a.from)), right = Math.min(100, percent(a.count));
              return <HelpButton key={a.set.id} pointerPassThrough command="set.select" showShortcut={false} title={`Set ${a.index + 1}: ${a.set.name}`} description={`Arrive at show count ${a.count}; ${a.counts} move counts. Stop playback and edit this set.`} state={index === a.index ? 'Current set' : 'Available'} aria-current={index === a.index ? 'step' : undefined} className={index === a.index ? 'active' : ''} style={{ left: `${left}%`, width: `${right - left}%` }} onClick={() => selectSet(a.index)}>
                <span className={numbered.has(a.index) ? 'set-track-number' : 'sr-only'}>{pad(a.index + 1)}</span>
              </HelpButton>;
            })}
          </div>
          {controller.pathOperations && <MoveOperationTrack editor={controller.pathOperations} percent={percent} />}
          <ProblemTimeline start={view.start} span={span} width={width} />
          {audioName && <div className={`audio-track ${waveform.length ? 'has-audio' : ''}`}>
            <span className="audio-clock-status" role="status">{clockStatus}</span>
            {waveform.length ? waveform.map((value, i) => {
              const time = (i + .5) / waveform.length * controller.portableAudio.audioDuration - project.audioOffsetSeconds;
              const at = secondsToCount(project, time);
              if (time < 0 || time > countToSeconds(project, duration)) return null;
              return at >= view.start && at <= view.start + span ? <i key={i} style={{ left: `${percent(at)}%`, height: `${Math.max(2, value * 95)}%` }} /> : null;
            }) : <span>{audioLoading ? 'Loading audio…' : 'Audio attached'}</span>}
          </div>}
          {count >= view.start && count <= view.start + span && <div className="playhead" style={{ left: `${percent(count)}%` }}><i /></div>}
          <input className="timeline-scrubber" style={{ width: scrubberWidth }} type="range" min={view.start} max={savedEnd || 1} step="any" value={Math.max(view.start, Math.min(view.start + span, count))} aria-label="Timeline playhead" aria-valuetext={`Show count ${formatTransportCount(count, playing)} · ${scoreLabel(score, transportCount(Math.min(duration, Math.max(0, count)), playing))}`} onChange={event => scrub(Number(event.target.value))} />
        </div>
      </div>
      {view.zoom > 1 && <Tooltip name="Pan timeline" description="Move the visible count window without moving the playhead. Panning turns follow off."><input className="timeline-pan" aria-label="Pan timeline" type="range" min={0} max={Math.max(0, duration - span)} step="any" value={view.start} onChange={event => { setFollow(false); setStart(Number(event.target.value)); }} /></Tooltip>}
    </div>

    {setsVisible && <SetStrip controller={controller} addButton={!layout.breakpoints.short} />}
  </section>;
}

ShowStrip.displayName = 'ShowStrip';
