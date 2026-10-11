import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { ChangeEvent, ReactNode } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, AudioLines, Box, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, Circle, CircleHelp, Copy, Download, FilePlus2, Flag, FolderOpen, Grid2X2, Hand, LayoutGrid, ListMusic, LoaderCircle, Magnet, Maximize, Minus, MoreHorizontal, MousePointer2, Music2, Pause, Play, Plus, Redo2, Repeat2, RotateCcw, RotateCw, Save, Search, Settings2, ShieldCheck, SkipBack, SkipForward, SlidersHorizontal, Sparkles, Square, Trash2, TriangleAlert, Undo2, Users, Volume2, VolumeX, Waves, X } from 'lucide-react';
import type { DrillSet, FormationKind, Performer, Point, Project } from './types';
import { analyzeTransition, coordinateDescription, countToSeconds, createBlankProject, createDemoProject, exportCoordinatesCsv, fitFormationToField, generateFormation, importRosterCsv, parseProject, sampleProject, secondsToCount, serializeProject, setStartCount, totalCounts, transformPositions, uid } from './domain';
import { Field2D, FieldDrawing } from './components/Field2D';
import { Stage3D } from './components/Stage3D';
import { Modal } from './components/Modal';
import { PrintOutput } from './components/PrintOutput';
import { AUTOSAVE_KEY, useProject } from './useProject';

type Dialog = 'new' | 'settings' | 'export' | 'help' | 'add-cast' | 'remove-cast' | 'remove-set' | null;
type Workspace = 'design' | 'cast' | 'production';
const formations: { kind: FormationKind; label: string; icon: ReactNode }[] = [
  { kind: 'line', label: 'Line', icon: <Minus /> }, { kind: 'arc', label: 'Arc', icon: <span className="arc-icon">⌒</span> },
  { kind: 'circle', label: 'Circle', icon: <Circle /> }, { kind: 'block', label: 'Block', icon: <Grid2X2 /> }, { kind: 'curve', label: 'Wave', icon: <Waves /> },
];
const cleanFilename = (title: string) => (title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/[. ]+$/, '').trim().slice(0, 100) || 'Squidware project').replace(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i, '$1-project');
function download(content: string, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Button({ children, onClick, title, active, disabled, className = '' }: { children: ReactNode; onClick: () => void; title: string; active?: boolean; disabled?: boolean; className?: string }) {
  return <button className={`icon-button ${active ? 'active' : ''} ${className}`} title={title} aria-label={title} aria-pressed={active === undefined ? undefined : active} onClick={onClick} disabled={disabled}>{children}</button>;
}
const MiniField = memo(function MiniField({ project, set }: { project: Project; set: DrillSet }) {
  return <svg viewBox="0 0 110 65" className="mini-field" aria-hidden="true"><rect x="5" y="5" width="100" height="53.333" rx="2" fill="#243d32" />{Array.from({ length: 11 }, (_, i) => <path key={i} d={`M${5 + i * 10},5v53.333`} stroke="#4c6555" strokeWidth="0.4" />)}{project.performers.map(p => { const pos = set.positions[p.id]; return pos && <circle key={p.id} cx={pos.x + 5} cy={pos.y + 5} r="0.9" fill={project.sections.find(s => s.id === p.sectionId)?.color || '#d0f398'} />; })}</svg>;
});
function NumberField({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number; step?: number }) {
  return <label className="form-label">{label}<input type="number" value={value} min={min} max={max} step={step} onChange={e => { if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber)) onChange(Math.min(max, Math.max(min, e.target.valueAsNumber))); }} /></label>;
}
function CommitInput({ value, onCommit, maxLength, label, onDraftChange }: { value: string; onCommit: (value: string) => void; maxLength: number; label?: string; onDraftChange: (pending: boolean) => void }) {
  const [draft, setDraft] = useState(value);
  const cancelBlur = useRef(false);
  useEffect(() => setDraft(value), [value]);
  const commit = () => { onDraftChange(false); if (cancelBlur.current) { cancelBlur.current = false; return; } const next = draft.trim() || value; setDraft(next); if (next !== value) onCommit(next); };
  return <input aria-label={label} value={draft} maxLength={maxLength} onChange={event => { setDraft(event.target.value); onDraftChange(event.target.value !== value); }} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { event.stopPropagation(); cancelBlur.current = true; setDraft(value); event.currentTarget.blur(); } }} />;
}

export default function App() {
  const { project, recoveryError, change, load, undo, redo, canUndo, canRedo } = useProject();
  const [activeIndex, setActiveIndex] = useState(0);
  const [workspace, setWorkspace] = useState<Workspace>('design');
  const [view, setView] = useState<'2d' | '3d'>('2d');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [count, setCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [metronome, setMetronome] = useState(false);
  const [tool, setTool] = useState<'select' | 'pan'>('select');
  const [zoom, setZoom] = useState(1);
  const [fitVersion, setFitVersion] = useState(0);
  const [showLabels, setShowLabels] = useState(true);
  const [showPaths, setShowPaths] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [snap, setSnap] = useState(true);
  const [dialog, setDialogState] = useState<Dialog>(null);
  function setDialog(next: Dialog) { if (next) setPlaying(false); setDialogState(next); }
  const [pendingDraft, setPendingDraft] = useState(false);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState('');
  const [savedSignature, setSavedSignature] = useState(() => JSON.stringify(project));
  const [needsSaveAs, setNeedsSaveAs] = useState(true);
  const [saveStatus, setSaveStatus] = useState('Recovered locally');
  const [formation, setFormation] = useState<FormationKind>('arc');
  const [formationWidth, setFormationWidth] = useState(45);
  const [formationHeight, setFormationHeight] = useState(22);
  const [formationRotation, setFormationRotation] = useState(0);
  const [formationColumns, setFormationColumns] = useState(8);
  const [castQuery, setCastQuery] = useState('');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [castAmount, setCastAmount] = useState(8);
  const [castSection, setCastSection] = useState(project.sections[0]?.id ?? '');
  const [castPrefix, setCastPrefix] = useState('B');
  const [printMode, setPrintMode] = useState<'charts' | 'coordinates'>('charts');
  const [printing, setPrinting] = useState(false);
  const [audioName, setAudioName] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [waveform, setWaveform] = useState<number[]>([]);
  const [audioLoading, setAudioLoading] = useState(false);
  const [muted, setMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const rosterInput = useRef<HTMLInputElement>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const audioDecodeGeneration = useRef(0);
  const projectRef = useRef(project); projectRef.current = project;
  const restoreHistoryArrival = useRef(false);
  const playheadRef = useRef(count); playheadRef.current = count;
  const index = Math.min(activeIndex, project.sets.length - 1);
  const activeSet = project.sets[index];
  const duration = totalCounts(project);
  const sample = useMemo(() => sampleProject(project, count), [project, count]);
  const atSet = Math.abs(count - setStartCount(project, index)) < 0.001;
  const readOnly = playing || !atSet;
  const positions = atSet && !playing ? activeSet.positions : sample.positions;
  const issues = useMemo(() => analyzeTransition(project, index), [project, index]);
  const signature = useMemo(() => JSON.stringify(project), [project]);
  const dirty = signature !== savedSignature;
  const allSelected = selectedIds.length === project.performers.length && selectedIds.length > 0;
  const selectedPerformers = project.performers.filter(p => selectedIds.includes(p.id));
  const selectionCenter = selectedIds.length ? selectedIds.reduce((point, id) => ({ x: point.x + (activeSet.positions[id]?.x || 0) / selectedIds.length, y: point.y + (activeSet.positions[id]?.y || 0) / selectedIds.length }), { x: 0, y: 0 }) : { x: 50, y: 26.667 };

  const notify = useCallback((message: string) => { setToast(message); }, []);
  useEffect(() => { if (!toast) return; const timeout = setTimeout(() => setToast(''), 5000); return () => clearTimeout(timeout); }, [toast]);
  useEffect(() => {
    if (recoveryError) {
      setSaveStatus('Recovery needs attention');
      try { const original = localStorage.getItem(AUTOSAVE_KEY); if (original) localStorage.setItem(`${AUTOSAVE_KEY}.unreadable`, original); } catch { /* The original recovery is still untouched. */ }
      notify('The last recovery could not be opened and has been preserved. Open a saved project or edit the demo to start a new recovery.');
      return;
    }
    setSaveStatus('Saving recovery…');
    const timeout = setTimeout(() => { try { localStorage.setItem(AUTOSAVE_KEY, signature); setSaveStatus('Recovery saved'); } catch { setSaveStatus('Recovery unavailable'); notify('Local recovery is full or unavailable. Save your project to a file.'); } }, 700);
    return () => clearTimeout(timeout);
  }, [signature, notify, recoveryError]);
  useEffect(() => { window.squidware?.setDirty(dirty || pendingDraft); }, [dirty, pendingDraft]);
  useEffect(() => { const guard = (e: BeforeUnloadEvent) => { if ((dirty || pendingDraft) && !window.squidware) e.preventDefault(); }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, [dirty, pendingDraft]);
  useEffect(() => { setSelectedIds(ids => ids.filter(id => project.performers.some(p => p.id === id))); setCount(c => Math.min(c, duration)); }, [project.performers, duration]);
  useEffect(() => {
    if (!restoreHistoryArrival.current) return;
    restoreHistoryArrival.current = false;
    const next = Math.min(activeIndex, project.sets.length - 1);
    setActiveIndex(next); setCount(setStartCount(project, next));
  }, [project, activeIndex]);
  useEffect(() => { if (!audioUrl) return; return () => URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  function selectSet(next: number) { const i = Math.max(0, Math.min(project.sets.length - 1, next)); setPlaying(false); setActiveIndex(i); setCount(setStartCount(project, i)); }
  function undoDrill() { if (!canUndo) return; setPlaying(false); restoreHistoryArrival.current = true; undo(); }
  function redoDrill() { if (!canRedo) return; setPlaying(false); restoreHistoryArrival.current = true; redo(); }
  function updateSet(update: Partial<DrillSet>) {
    const next = { ...project, sets: project.sets.map((set, i) => i === index ? { ...set, ...update } : set) };
    change(() => next);
    if (update.counts !== undefined && atSet) setCount(setStartCount(next, index));
  }
  function movePerformers(updates: Record<string, Point>) { if (readOnly) return; updateSet({ positions: { ...activeSet.positions, ...updates } }); }
  function transform(options: { dx?: number; dy?: number; rotation?: number; scale?: number }) {
    if (readOnly || !selectedIds.length) return;
    updateSet({ positions: transformPositions(activeSet.positions, selectedIds, options, project.field) });
  }
  function addSet() {
    if (project.sets.length >= 128) { notify('This release supports up to 128 sets per production.'); return; }
    const set = { ...activeSet, id: uid(), name: `Set ${project.sets.length + 1}`, counts: 32, positions: structuredClone(activeSet.positions), notes: '' };
    change(p => ({ ...p, sets: [...p.sets.slice(0, index + 1), set, ...p.sets.slice(index + 1)] }));
    setActiveIndex(index + 1); setCount(setStartCount(project, index) + 32); setPlaying(false); notify('New set added. Shape the next moment.');
  }
  function duplicateSet() { addSet(); }
  function removeSet() {
    const next = project.sets.filter((_, i) => i !== index).map((s, i) => i === 0 ? { ...s, counts: 0 } : s);
    const nextProject = { ...project, sets: next }; change(() => nextProject); setActiveIndex(Math.max(0, index - 1)); setCount(setStartCount(nextProject, Math.max(0, index - 1))); setDialog(null);
  }
  function reorderSet(direction: number) {
    const target = index + direction; if (target < 0 || target >= project.sets.length) return;
    const sets = [...project.sets]; [sets[index], sets[target]] = [sets[target], sets[index]];
    const fixed = sets.map((s, i) => ({ ...s, counts: i === 0 ? 0 : s.counts || 32 })); const next = { ...project, sets: fixed };
    change(() => next); setActiveIndex(target); setCount(setStartCount(next, target)); setPlaying(false);
  }
  function applyFormation() {
    if (readOnly) return;
    const ids = selectedIds.length ? project.performers.filter(p => selectedIds.includes(p.id)).map(p => p.id) : project.performers.map(p => p.id);
    const points = fitFormationToField(generateFormation(formation, ids.length, { center: selectionCenter, width: formationWidth, height: formationHeight, rotation: formationRotation, columns: formationColumns }), project.field);
    const updates = Object.fromEntries(ids.map((id, i) => [id, { x: Math.max(0, Math.min(project.field.width, points[i].x)), y: Math.max(0, Math.min(project.field.height, points[i].y)) }]));
    movePerformers(updates); notify(`${formations.find(f => f.kind === formation)?.label} applied to ${ids.length} performers`);
  }
  function loadProject(next: Project) {
    load(next); setPendingDraft(false); setSavedSignature(JSON.stringify(next)); setActiveIndex(0); setCount(0); setPlaying(false); setSelectedIds([]); setDialog(null); setAudioUrl(''); setAudioName(''); setWaveform([]); audioDecodeGeneration.current += 1; setAudioLoading(false); setWorkspace('design'); setCastSection(next.sections[0]?.id || ''); setZoom(1); setFitVersion(v => v + 1);
  }
  async function saveProject(saveAs = false) {
    try {
      flushSync(() => (document.activeElement as HTMLElement | null)?.blur());
      const savingProject = projectRef.current;
      const content = serializeProject(savingProject);
      if (window.squidware) { const result = await window.squidware.saveProject(content, `${cleanFilename(savingProject.title)}.squid`, saveAs || needsSaveAs); if (!result) return; setNeedsSaveAs(false); }
      else download(content, `${cleanFilename(savingProject.title)}.squid`, 'application/json');
      setSavedSignature(JSON.stringify(savingProject)); notify('Project saved');
    } catch (error) { notify(`Could not save: ${(error as Error).message}`); }
  }
  async function openProject() {
    flushSync(() => (document.activeElement as HTMLElement | null)?.blur());
    setMenu(false);
    if (JSON.stringify(projectRef.current) !== savedSignature && !window.confirm('Open another project? Your current work has a local recovery copy. Save a project file first if you need to keep it.')) return;
    if (!window.squidware) { projectInput.current?.click(); return; }
    try { const result = await window.squidware.openProject(); if (!result) return; const next = parseProject(result.content); loadProject(next); setNeedsSaveAs(false); notify('Project opened'); }
    catch (error) { window.squidware.resetProject(); setNeedsSaveAs(true); notify(`Could not open: ${(error as Error).message}`); }
  }
  async function onProjectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try { if (file.size > 10 * 1024 * 1024) throw new Error('Project files must be smaller than 10 MB.'); loadProject(parseProject(await file.text())); setNeedsSaveAs(true); notify('Project imported'); } catch (error) { notify((error as Error).message); }
  }
  async function exportText(kind: 'csv' | 'svg') {
    try {
      const { renderToStaticMarkup } = kind === 'svg' ? await import('react-dom/server') : { renderToStaticMarkup: () => '' };
      const content = kind === 'csv' ? exportCoordinatesCsv(project) : renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" viewBox="-7 -8 114 69.333" width="1392" height="784"><title>{project.title} — {activeSet.name}</title><FieldDrawing project={project} positions={activeSet.positions} showLabels={showLabels} showGrid /></svg>);
      const filename = `${cleanFilename(project.title)}${kind === 'svg' ? `-set-${index + 1}` : '-coordinates'}.${kind}`;
      if (window.squidware) { if (!await window.squidware.exportFile(content, filename, kind)) return; } else download(content, filename, kind === 'csv' ? 'text/csv;charset=utf-8' : 'image/svg+xml');
      notify(`${kind.toUpperCase()} exported`); setDialog(null);
    } catch (error) { notify(`Export failed: ${(error as Error).message}`); }
  }
  async function exportPdf() {
    setPlaying(false); setDialog(null); setPrinting(true);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try { if (window.squidware) { if (await window.squidware.exportPdf()) notify('PDF saved'); } else window.print(); } catch (error) { notify(`PDF export failed: ${(error as Error).message}`); } finally { setPrinting(false); }
  }
  async function onAudioFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    const generation = ++audioDecodeGeneration.current;
    setPlaying(false); setAudioLoading(true);
    let ctx: AudioContext | null = null;
    try {
      if (file.size > 200 * 1024 * 1024) throw new Error('Choose an audio file under 200 MB.');
      ctx = new AudioContext(); const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
      const channel = buffer.getChannelData(0); const bars = 180; const chunk = Math.max(1, Math.floor(channel.length / bars));
      const peaks = Array.from({ length: bars }, (_, i) => { let max = 0; for (let j = i * chunk; j < Math.min(channel.length, (i + 1) * chunk); j += 32) max = Math.max(max, Math.abs(channel[j])); return max; });
      if (generation !== audioDecodeGeneration.current) return;
      setAudioUrl(URL.createObjectURL(file)); setAudioName(file.name); setWaveform(peaks); notify('Audio attached for this session. Set the sync offset in project settings.');
    } catch (error) { if (generation === audioDecodeGeneration.current) notify(`Audio could not be loaded: ${(error as Error).message}`); }
    finally { await ctx?.close(); if (generation === audioDecodeGeneration.current) setAudioLoading(false); }
  }
  useEffect(() => {
    if (!playing) { audioRef.current?.pause(); return; }
    const started = performance.now(); const initialSeconds = countToSeconds(project, playheadRef.current); const totalSeconds = countToSeconds(project, duration); let raf = 0; let lastBeat = -1;
    function frame(now: number) {
      let seconds = initialSeconds + (now - started) / 1000 * speed;
      if (seconds >= totalSeconds && totalSeconds > 0) {
        if (loop) seconds %= totalSeconds;
        else { setCount(duration); setActiveIndex(project.sets.length - 1); setPlaying(false); return; }
      }
      const currentCount = secondsToCount(project, seconds); setCount(currentCount);
      const audio = audioRef.current; const target = seconds + project.audioOffsetSeconds;
      if (audio && audioUrl) {
        audio.playbackRate = speed;
        if (target >= 0 && (!Number.isFinite(audio.duration) || target < audio.duration)) {
          if (Math.abs(audio.currentTime - target) > 0.2) audio.currentTime = target;
          if (audio.paused) audio.play().catch(() => { /* The toast below is reserved for explicit attach failures. */ });
        } else audio.pause();
      }
      const beat = Math.floor(currentCount);
      if (metronome && beat !== lastBeat) {
        lastBeat = beat;
        try { const ctx = audioContext.current || (audioContext.current = new AudioContext()); void ctx.resume(); const oscillator = ctx.createOscillator(); const gain = ctx.createGain(); oscillator.frequency.value = beat % 4 === 0 ? 1100 : 740; gain.gain.setValueAtTime(0.07, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05); oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + 0.06); } catch { /* Audio devices may be unavailable. */ }
      }
      raf = requestAnimationFrame(frame);
    }
    if (totalSeconds > 0) raf = requestAnimationFrame(frame); else setPlaying(false);
    return () => { cancelAnimationFrame(raf); audioRef.current?.pause(); };
  }, [playing, project, duration, speed, loop, metronome, audioUrl]);
  useEffect(() => () => { void audioContext.current?.close(); }, []);
  useEffect(() => { if (playing) setActiveIndex(sample.setIndex); }, [playing, sample.setIndex]);
  function togglePlay() { if (!duration) { notify('Add a second set to rehearse a transition.'); return; } if (count >= duration) setCount(0); setPlaying(p => !p); }
  function scrub(next: number) { setPlaying(false); setCount(next); setActiveIndex(sampleProject(project, next).setIndex); }

  function addCast(performers?: Performer[]) {
    const sectionId = project.sections.some(s => s.id === castSection) ? castSection : project.sections[0].id;
    const existingLabels = new Set(project.performers.map(p => p.label));
    let ordinal = 1;
    const added = performers || Array.from({ length: castAmount }, () => { while (existingLabels.has(`${castPrefix || 'P'}${ordinal}`)) ordinal++; const label = `${castPrefix || 'P'}${ordinal++}`; existingLabels.add(label); return { id: uid(), label, name: '', sectionId }; });
    if (project.performers.length + added.length > 500) { notify('This release supports up to 500 performers.'); return; }
    if (added.some(p => project.performers.some(existing => existing.label === p.label))) { notify('Roster labels must be unique. Rename duplicate labels before importing.'); return; }
    const start = project.performers.length;
    change(p => ({ ...p, performers: [...p.performers, ...added], sets: p.sets.map(set => ({ ...set, positions: { ...set.positions, ...Object.fromEntries(added.map((performer, i) => [performer.id, { x: 5 + ((start + i) % 40) * 2.3, y: Math.max(1, project.field.height - 3 - Math.floor((start + i) / 40) * 2.3) }])) } })) }));
    setSelectedIds(added.map(p => p.id)); setDialog(null); notify(`${added.length} performers added to every set`);
  }
  async function onRosterFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try { if (file.size > 2 * 1024 * 1024) throw new Error('Roster CSV must be under 2 MB.'); addCast(importRosterCsv(await file.text(), project.sections)); } catch (error) { notify((error as Error).message); }
  }
  function removeCast() { change(p => ({ ...p, performers: p.performers.filter(p => !selectedIds.includes(p.id)), sets: p.sets.map(set => ({ ...set, positions: Object.fromEntries(Object.entries(set.positions).filter(([id]) => !selectedIds.includes(id))) })) })); setSelectedIds([]); setDialog(null); }

  const actionsRef = useRef<(action: string) => void>(() => {});
  actionsRef.current = action => {
    const focused = document.activeElement as HTMLElement | null;
    const editing = focused && (/^(INPUT|TEXTAREA)$/.test(focused.tagName) || focused.isContentEditable);
    if (editing && ['undo', 'redo', 'select-all'].includes(action)) { document.execCommand(action === 'select-all' ? 'selectAll' : action); return; }
    if (action === 'select-all') { if (!dialog) setSelectedIds(project.performers.map(p => p.id)); return; }
    if (action === 'new' || action === 'export-pdf') flushSync(() => (document.activeElement as HTMLElement | null)?.blur());
    if (action === 'new') setDialog('new'); else if (action === 'open') void openProject(); else if (action === 'save') void saveProject(); else if (action === 'save-as') void saveProject(true);
    else if (action === 'undo') undoDrill(); else if (action === 'redo') redoDrill();
    else if (action === 'export-pdf') setDialog('export'); else if (action === 'about' || action === 'shortcuts') setDialog('help');
  };
  useEffect(() => window.squidware?.onMenuAction(action => actionsRef.current(action)), []);
  const keyboardRef = useRef<(event: KeyboardEvent) => void>(() => {});
  keyboardRef.current = event => {
    const target = event.target as HTMLElement; const input = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
    if (dialog) return;
    const cmd = event.ctrlKey || event.metaKey;
    if (cmd && ['s', 'o', 'n'].includes(event.key.toLowerCase())) { if (window.squidware) return; event.preventDefault(); actionsRef.current(event.key.toLowerCase() === 's' ? event.shiftKey ? 'save-as' : 'save' : event.key.toLowerCase() === 'o' ? 'open' : 'new'); return; }
    if (input) return;
    if (cmd && event.key.toLowerCase() === 'z') { event.preventDefault(); if (!window.squidware) actionsRef.current(event.shiftKey ? 'redo' : 'undo'); return; }
    if (cmd && event.key.toLowerCase() === 'a') { event.preventDefault(); setSelectedIds(project.performers.map(p => p.id)); }
    else if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
    else if (event.key === 'Escape') { setSelectedIds([]); setMenu(false); }
    else if (event.key === 'v') setTool('select'); else if (event.key === 'h') setTool('pan');
    else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && selectedIds.length) { event.preventDefault(); const step = event.shiftKey ? 2.5 : 0.625; transform({ dx: event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, dy: event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0 }); }
    else if (event.key === '[') selectSet(index - 1); else if (event.key === ']') selectSet(index + 1);
  };
  useEffect(() => { const listener = (e: KeyboardEvent) => keyboardRef.current(e); window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener); }, []);

  const filteredCast = project.performers.filter(p => (sectionFilter === 'all' || p.sectionId === sectionFilter) && `${p.name} ${p.label}`.toLowerCase().includes(castQuery.toLowerCase()));
  const visibleSet = playing ? project.sets[sample.setIndex] : activeSet;
  return <>
    <div className="studio">
      <header className="app-header">
        <div className="brand"><img src="./squid.svg" alt="Squidware logo" /><span>squidware<span className="brand-dot">.</span></span><span className="desktop-tag">STUDIO</span></div>
        <div className="header-divider" />
        <button className="project-title" onClick={() => setDialog('settings')} title="Project settings"><span>{project.title}</span><ChevronDown size={14} /></button>
        <span className="save-state"><span className={`status-dot ${dirty ? 'unsaved' : ''}`} />{saveStatus}</span>
        <div className="header-actions"><Button title="Undo (Ctrl+Z)" onClick={undoDrill} disabled={!canUndo}><Undo2 size={17} /></Button><Button title="Redo (Ctrl+Shift+Z)" onClick={redoDrill} disabled={!canRedo}><Redo2 size={17} /></Button><div className="header-divider" /><button className="button subtle" onClick={() => void saveProject()}><Save size={15} />Save{dirty ? ' •' : ''}</button><button className="button primary" onClick={() => setDialog('export')}><Download size={15} />Export</button><div className="file-menu"><Button title="Project menu" active={menu} onClick={() => setMenu(!menu)}><MoreHorizontal size={20} /></Button>{menu && <><div className="menu-dismiss" onClick={() => setMenu(false)} /><div className="dropdown"><button onClick={() => { setDialog('new'); setMenu(false); }}><FilePlus2 size={16} />New project<span>Ctrl N</span></button><button onClick={() => void openProject()}><FolderOpen size={16} />Open project<span>Ctrl O</span></button><button onClick={() => { void saveProject(true); setMenu(false); }}><Save size={16} />Save as…</button><hr /><button onClick={() => { setDialog('settings'); setMenu(false); }}><Settings2 size={16} />Project settings</button><button onClick={() => { setDialog('help'); setMenu(false); }}><CircleHelp size={16} />Guide & shortcuts</button></div></>}</div></div>
      </header>
      <div className="studio-body">
        <nav className="rail" aria-label="Workspace"><div className="rail-top">{([{ id: 'design', label: 'Design', icon: <MousePointer2 size={21} /> }, { id: 'cast', label: 'Cast', icon: <Users size={21} /> }, { id: 'production', label: 'Show', icon: <ListMusic size={21} /> }] as const).map(item => <button key={item.id} onClick={() => setWorkspace(item.id)} className={`rail-button ${workspace === item.id ? 'active' : ''}`} title={item.label}><span>{item.icon}</span>{item.label}</button>)}</div><div className="rail-bottom"><button className="rail-button" onClick={() => setDialog('settings')} title="Settings"><Settings2 size={21} /></button><button className="rail-button" onClick={() => setDialog('help')} title="Guide & shortcuts"><CircleHelp size={21} /></button><div className="avatar" title="Local workspace">S</div></div></nav>
        <aside className="set-panel"><div className="panel-heading"><div><span className="eyebrow">YOUR PRODUCTION</span><h2>Set list <span className="count-badge">{project.sets.length}</span></h2></div><Button title="Add set" onClick={addSet}><Plus size={18} /></Button></div>
          <div className="set-list">{project.sets.map((set, i) => <button key={set.id} className={`set-card ${index === i ? 'selected' : ''}`} onClick={() => selectSet(i)}><div className="set-card-top"><span className="set-number">{String(i + 1).padStart(2, '0')}</span><span>{set.name}</span>{index === i && <span className="active-marker" />}</div><MiniField project={project} set={set} /><div className="set-card-bottom"><span>{i === 0 ? 'Opening set' : `${set.counts} counts`}</span><span>{set.tempo} BPM</span></div></button>)}</div>
          <div className="set-panel-footer"><button className="button add-set" onClick={addSet}><Plus size={15} />Add set</button><span>{duration} total counts <span>·</span> {Math.floor(countToSeconds(project, duration) / 60)}:{String(Math.round(countToSeconds(project, duration) % 60)).padStart(2, '0')}</span></div>
        </aside>
        <main className="main-workspace">
          <div className="workspace-heading"><div><div className="breadcrumb">{project.ensemble || 'Untitled ensemble'}<ChevronRight size={12} /><span>{workspace === 'design' ? 'Drill editor' : workspace === 'cast' ? 'Cast manager' : 'Production overview'}</span></div><h1>{workspace === 'design' ? visibleSet.name : workspace === 'cast' ? 'Every performer. One ensemble.' : 'The show, at a glance.'}<span>{workspace === 'design' ? `SET ${String((playing ? sample.setIndex : index) + 1).padStart(2, '0')}` : `${project.performers.length} PERFORMERS`}</span></h1></div>{workspace === 'design' ? <div className="view-switch"><button className={view === '2d' ? 'active' : ''} onClick={() => setView('2d')}><Grid2X2 size={15} />2D field</button><button className={view === '3d' ? 'active' : ''} onClick={() => setView('3d')}><Box size={15} />3D preview</button></div> : <button className="button primary" onClick={() => workspace === 'cast' ? setDialog('add-cast') : setDialog('export')}><Plus size={15} />{workspace === 'cast' ? 'Add performers' : 'Export show'}</button>}</div>
          {workspace === 'design' && <><div className="canvas-toolbar"><div className="tool-group"><Button title="Select performers (V)" active={tool === 'select'} onClick={() => setTool('select')}><MousePointer2 size={17} /></Button><Button title="Pan field (H)" active={tool === 'pan'} onClick={() => setTool('pan')}><Hand size={17} /></Button><span className="tool-divider" /><Button title="Select all performers (Ctrl+A)" active={allSelected} onClick={() => setSelectedIds(allSelected ? [] : project.performers.map(p => p.id))}><Square size={16} /></Button><span className="selection-count">{selectedIds.length ? `${selectedIds.length} selected` : 'Select & shape'}</span></div><div className="tool-group"><Button title="Show paths from previous set" active={showPaths} onClick={() => setShowPaths(!showPaths)}><Waves size={17} /></Button><Button title="Snap to 8-to-5 grid" active={snap} onClick={() => setSnap(!snap)}><Magnet size={17} /></Button><Button title="Show field grid" active={showGrid} onClick={() => setShowGrid(!showGrid)}><LayoutGrid size={17} /></Button><Button title="Show performer labels" active={showLabels} onClick={() => setShowLabels(!showLabels)}><span className="text-icon">A₁</span></Button><span className="tool-divider" /><Button title="Zoom out" onClick={() => setZoom(z => Math.max(0.6, z - 0.2))} disabled={view === '3d'}><Minus size={16} /></Button><span className="zoom-value">{Math.round(zoom * 100)}%</span><Button title="Zoom in" onClick={() => setZoom(z => Math.min(3, z + 0.2))} disabled={view === '3d'}><Plus size={16} /></Button><Button title="Fit field" onClick={() => { setZoom(1); setFitVersion(v => v + 1); }} disabled={view === '3d'}><Maximize size={16} /></Button></div></div>
            <div className={`field-container ${view === '3d' ? 'is-3d' : ''}`}><div className="field-topline"><span><span className="live-dot" />{playing ? 'REHEARSING' : 'FIELD VIEW'}</span><span>{project.field.preset === 'college' ? 'COLLEGE' : 'HIGH SCHOOL'} · 100 × 53⅓ YD</span></div>
              {view === '2d' ? <Field2D project={project} positions={positions} previousPositions={index > 0 ? project.sets[index - 1].positions : undefined} selectedIds={selectedIds} onSelect={setSelectedIds} onMove={movePerformers} tool={tool} showLabels={showLabels} showPaths={showPaths} showGrid={showGrid} snap={snap} zoom={zoom} onZoom={setZoom} readOnly={readOnly} fitVersion={fitVersion} /> : <Stage3D project={project} positions={positions} selectedIds={selectedIds} onSelect={setSelectedIds} />}
              <div className="field-bottomline"><span>{view === '2d' ? '' : 'DRAG TO ORBIT · SCROLL TO ZOOM'}</span>{!playing && !atSet && <button onClick={() => selectSet(index)}>Return to set to edit <ArrowRight size={12} /></button>}</div>
            </div><div className="field-legend"><div>{project.sections.map(section => <button key={section.id} className={selectedIds.length && project.performers.filter(p => p.sectionId === section.id).every(p => selectedIds.includes(p.id)) ? 'selected' : ''} onClick={() => setSelectedIds(project.performers.filter(p => p.sectionId === section.id).map(p => p.id))}><i style={{ background: section.color }} />{section.name}<span>{project.performers.filter(p => p.sectionId === section.id).length}</span></button>)}</div><span><Users size={13} />{project.performers.length} on field</span></div></>}
          {workspace === 'cast' && <div className="cast-workspace"><div className="cast-controls"><label className="search-field"><Search size={16} /><input placeholder="Find a performer…" value={castQuery} onChange={e => setCastQuery(e.target.value)} /></label><select aria-label="Filter section" value={sectionFilter} onChange={e => setSectionFilter(e.target.value)}><option value="all">All sections</option>{project.sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><button className="button subtle" onClick={() => rosterInput.current?.click()}><FolderOpen size={15} />Import CSV</button><Button title="Remove selected performers" onClick={() => setDialog('remove-cast')} disabled={!selectedIds.length}><Trash2 size={16} /></Button></div><div className="table-scroll"><table className="cast-table"><thead><tr><th><input type="checkbox" aria-label="Select all visible performers" checked={filteredCast.length > 0 && filteredCast.every(p => selectedIds.includes(p.id))} onChange={e => setSelectedIds(e.target.checked ? filteredCast.map(p => p.id) : [])} /></th><th>Label</th><th>Performer</th><th>Section</th><th>Current coordinate</th></tr></thead><tbody>{filteredCast.map(p => <tr key={p.id} className={selectedIds.includes(p.id) ? 'selected' : ''}><td><input type="checkbox" aria-label={`Select ${p.label}`} checked={selectedIds.includes(p.id)} onChange={e => setSelectedIds(ids => e.target.checked ? [...ids, p.id] : ids.filter(id => id !== p.id))} /></td><td><span className="performer-label" style={{ borderColor: project.sections.find(s => s.id === p.sectionId)?.color }}>{p.label}</span></td><td><input aria-label={`Name for ${p.label}`} placeholder="Add a name" value={p.name} maxLength={100} onChange={e => change(project => ({ ...project, performers: project.performers.map(person => person.id === p.id ? { ...person, name: e.target.value } : person) }))} /></td><td><select aria-label={`Section for ${p.label}`} value={p.sectionId} onChange={e => change(project => ({ ...project, performers: project.performers.map(person => person.id === p.id ? { ...person, sectionId: e.target.value } : person) }))}>{project.sections.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</select></td><td className="coordinate-cell">{coordinateDescription(activeSet.positions[p.id], project.field)}</td></tr>)}</tbody></table>{!filteredCast.length && <div className="empty-state"><Users /><h3>{project.performers.length ? 'No matching performers' : 'Start with your ensemble'}</h3><p>Add performers or import a CSV roster to start designing.</p><button className="button primary" onClick={() => setDialog('add-cast')}>Add performers</button></div>}</div><div className="table-footer">{filteredCast.length} performers shown · {selectedIds.length} selected<span>Names and sections update across every set.</span></div></div>}
          {workspace === 'production' && <div className="production-workspace"><div className="production-stats"><div><span>PERFORMERS</span><strong>{project.performers.length}</strong><small>{project.sections.length} sections</small></div><div><span>SETS</span><strong>{project.sets.length}</strong><small>{duration} counts</small></div><div><span>RUN TIME</span><strong>{Math.floor(countToSeconds(project, duration) / 60)}:{String(Math.round(countToSeconds(project, duration) % 60)).padStart(2, '0')}</strong><small>at written tempos</small></div></div><div className="production-table"><table><thead><tr><th>Set</th><th>Counts</th><th>BPM</th><th>Rehearsal notes</th><th /></tr></thead><tbody>{project.sets.map((set, i) => <tr key={set.id}><td><span className="set-number">{String(i + 1).padStart(2, '0')}</span>{set.name}</td><td>{set.counts}</td><td>{set.tempo}</td><td>{set.notes || '—'}</td><td><Button title={`Edit set ${i + 1}`} onClick={() => { selectSet(i); setWorkspace('design'); }}><ArrowRight size={16} /></Button></td></tr>)}</tbody></table></div><div className="production-note"><ShieldCheck size={21} /><div><h3>Designed for the rehearsal field</h3><p>Review transitions in 3D, check performer spacing, and export field charts and individual coordinate sheets.</p></div><button className="button subtle" onClick={() => setDialog('export')}>Export packet<ArrowRight size={15} /></button></div></div>}
          <section className="timeline" aria-label="Show timeline"><div className="timeline-heading"><h2><ListMusic size={16} />Timeline <span>{project.sets.length} sets</span></h2><button className={`audio-attach ${audioName ? 'attached' : ''}`} onClick={() => audioInput.current?.click()} disabled={audioLoading}>{audioLoading ? <LoaderCircle size={14} className="spin" /> : <Music2 size={14} />}{audioName || 'Attach audio'}{audioName && <span>Replace</span>}</button></div><div className="timeline-tracks"><div className="track-labels"><span>COUNTS</span><span><Flag size={12} />SETS</span><span><AudioLines size={12} />AUDIO</span></div><div className="tracks"><div className="count-ruler">{Array.from({ length: 9 }, (_, i) => <span key={i}>{Math.round(duration * i / 8)}</span>)}</div><div className="set-track">{project.sets.slice(1).map((set, i) => <button key={set.id} style={{ flex: set.counts }} onClick={() => selectSet(i + 1)} className={index === i + 1 ? 'active' : ''}><span>{String(i + 2).padStart(2, '0')}</span>{set.name}</button>)}{project.sets.length === 1 && <button className="empty-track" onClick={addSet}>+ Add another set to create a transition</button>}</div><div className={`audio-track ${waveform.length ? 'has-audio' : ''}`}>{waveform.length ? waveform.map((value, i) => <i key={i} style={{ height: `${Math.max(2, value * 95)}%` }} />) : <span>Bring your drill to life. Add a rehearsal track.</span>}</div><div className="playhead" style={{ left: `${duration ? count / duration * 100 : 0}%` }}><i /></div><input className="timeline-scrubber" type="range" min="0" max={duration || 1} step="0.1" value={count} aria-label="Timeline playhead" onChange={e => scrub(Number(e.target.value))} /></div></div>
            <div className="transport"><div className="transport-options"><Button title="Loop show" active={loop} onClick={() => setLoop(!loop)}><Repeat2 size={17} /></Button><Button title="Metronome" active={metronome} onClick={() => setMetronome(!metronome)}><Music2 size={17} /></Button><select aria-label="Playback speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1">1× speed</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option></select></div><div className="play-controls"><Button title="First set" onClick={() => selectSet(0)}><SkipBack size={17} /></Button><Button title="Previous set ([)" onClick={() => selectSet(index - 1)}><ChevronLeft size={18} /></Button><button className="play-button" title={playing ? 'Pause (Space)' : 'Play (Space)'} aria-label={playing ? 'Pause playback' : 'Play show'} onClick={togglePlay}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button><Button title="Next set (])" onClick={() => selectSet(index + 1)}><ChevronRight size={18} /></Button><Button title="Last set" onClick={() => selectSet(project.sets.length - 1)}><SkipForward size={17} /></Button></div><div className="count-display"><span>COUNT</span><strong>{String(Math.floor(count)).padStart(3, '0')}</strong><small>/ {duration}</small><Button title={muted ? 'Unmute audio' : 'Mute audio'} active={muted} onClick={() => setMuted(!muted)}><>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</></Button></div></div>
          </section>
        </main>
        <aside className="inspector"><div className="inspector-header"><SlidersHorizontal size={16} /><h2>Inspector</h2><span>SET {String(index + 1).padStart(2, '0')}</span></div><div className="inspector-scroll"><section className="inspector-section"><div className="section-title"><h3>Set properties</h3><div><Button title="Duplicate current set" onClick={duplicateSet}><Copy size={14} /></Button><Button title="Delete current set" disabled={project.sets.length <= 1} onClick={() => setDialog('remove-set')}><Trash2 size={14} /></Button></div></div><label className="form-label">Set name<CommitInput onDraftChange={setPendingDraft} value={activeSet.name} maxLength={80} onCommit={name => updateSet({ name })} /></label><div className="form-row"><NumberField label="Counts" value={activeSet.counts} min={index === 0 ? 0 : 1} max={index === 0 ? 0 : 256} onChange={value => { setPlaying(false); updateSet({ counts: Math.round(value) }); }} /><NumberField label="Tempo · BPM" value={activeSet.tempo} min={30} max={300} onChange={value => updateSet({ tempo: value })} /></div><label className="form-label">Transition<select value={activeSet.transition} onChange={e => updateSet({ transition: e.target.value as 'linear' | 'ease' })}><option value="linear">Constant speed</option><option value="ease">Ease in / out</option></select></label><label className="form-label">Rehearsal notes<textarea placeholder="What should the ensemble know?" rows={2} value={activeSet.notes} maxLength={2000} onChange={e => updateSet({ notes: e.target.value })} /></label><div className="reorder-controls"><span>Set order</span><Button title="Move set earlier" disabled={index === 0} onClick={() => reorderSet(-1)}><ArrowUp size={14} /></Button><Button title="Move set later" disabled={index === project.sets.length - 1} onClick={() => reorderSet(1)}><ArrowDown size={14} /></Button></div></section>
          <section className="inspector-section formation-section"><div className="section-title"><h3><Sparkles size={15} />Formation tools</h3></div><p className="section-description">{selectedIds.length ? `Shape ${selectedIds.length} selected performers` : 'Shape the full ensemble or select a section.'}</p><div className="formation-grid">{formations.map(f => <button key={f.kind} className={formation === f.kind ? 'active' : ''} onClick={() => setFormation(f.kind)}>{f.icon}<span>{f.label}</span></button>)}</div><div className="form-row"><NumberField label="Width · yd" value={formationWidth} min={1} max={95} onChange={setFormationWidth} /><NumberField label="Depth · yd" value={formationHeight} min={1} max={48} onChange={setFormationHeight} /></div><div className="form-row"><NumberField label="Rotation · °" value={formationRotation} min={-180} max={180} onChange={setFormationRotation} /><NumberField label="Block columns" value={formationColumns} min={1} max={40} onChange={value => setFormationColumns(Math.round(value))} /></div><button className="button primary apply-formation" onClick={applyFormation} disabled={readOnly || !project.performers.length}>Apply formation<ArrowRight size={15} /></button>{readOnly && <button className="return-to-set" onClick={() => selectSet(index)}>Return to this set to edit</button>}</section>
          {selectedIds.length > 0 && <section className="inspector-section"><div className="section-title"><h3>Selection</h3><span className="count-badge">{selectedIds.length}</span><Button title="Clear selection" onClick={() => setSelectedIds([])}><X size={14} /></Button></div>{selectedPerformers.length === 1 && <div className="selected-performer"><strong>{selectedPerformers[0].label}</strong><span>{selectedPerformers[0].name || project.sections.find(s => s.id === selectedPerformers[0].sectionId)?.name}</span><p>{coordinateDescription(activeSet.positions[selectedPerformers[0].id], project.field)}</p><div className="form-row exact-position"><NumberField label="X · yards from left" value={Number(activeSet.positions[selectedPerformers[0].id].x.toFixed(3))} min={0} max={100} step={0.625} onChange={x => movePerformers({ [selectedPerformers[0].id]: { ...activeSet.positions[selectedPerformers[0].id], x } })} /><NumberField label="Y · yards from back" value={Number(activeSet.positions[selectedPerformers[0].id].y.toFixed(3))} min={0} max={160 / 3} step={0.625} onChange={y => movePerformers({ [selectedPerformers[0].id]: { ...activeSet.positions[selectedPerformers[0].id], y } })} /></div></div>}<div className="transform-buttons"><Button title="Rotate selection 15° counterclockwise" disabled={readOnly} onClick={() => transform({ rotation: -15 })}><RotateCcw size={16} /></Button><Button title="Rotate selection 15° clockwise" disabled={readOnly} onClick={() => transform({ rotation: 15 })}><RotateCw size={16} /></Button><Button title="Compress selection by 10%" disabled={readOnly} onClick={() => transform({ scale: 0.9 })}><Minus size={16} /></Button><Button title="Expand selection by 10%" disabled={readOnly} onClick={() => transform({ scale: 1.1 })}><Plus size={16} /></Button></div><p className="microcopy">Arrow keys move 1 step. Shift moves 4 steps.</p></section>}
          <section className="inspector-section transition-check"><div className="section-title"><h3>{issues.length ? <TriangleAlert size={15} /> : <ShieldCheck size={15} />}Transition check</h3><span className={`check-count ${issues.length ? 'has-issues' : ''}`}>{issues.length || <Check size={12} />}</span></div>{index === 0 ? <p className="section-description">Select the next set to check the transition into it.</p> : issues.length ? <><p className="section-description">Review spacing and step size before rehearsal.</p><div className="issue-list">{issues.slice(0, 12).map((issue, i) => <button key={i} onClick={() => { setSelectedIds(issue.performerIds); setShowPaths(true); setWorkspace('design'); selectSet(index); }}><span className={`issue-dot ${issue.severity}`} /><span>{issue.message}</span><ChevronRight size={12} /></button>)}</div>{issues.length > 12 && <p className="microcopy">+ {issues.length - 12} more issues. Adjust the formation and recheck.</p>}</> : <p className="check-passed"><CheckCheck size={16} />No spacing or stride flags.</p>}<p className="microcopy">Geometric checks are rehearsal aids. Review body clearance and traffic on the field.</p></section>
        </div><div className="inspector-footer"><span className="status-dot" />Local workspace<span>v0.1</span></div></aside>
      </div>
      <footer className="statusbar"><span><span className="status-dot" />{window.squidware ? 'Desktop · working locally' : 'Browser preview · working locally'}</span><span>{selectedIds.length ? `${selectedIds.length} selected` : 'Shift + click to select multiple'}<i />{project.field.preset === 'college' ? 'College' : 'High school'} field<i />8-to-5 step grid</span><button onClick={() => setDialog('help')}>Keyboard shortcuts <span>?</span></button></footer>
    </div>
    <input ref={projectInput} type="file" accept=".squid,.json" hidden onChange={event => void onProjectFile(event)} /><input ref={rosterInput} type="file" accept=".csv" hidden onChange={event => void onRosterFile(event)} /><input ref={audioInput} type="file" accept="audio/*" hidden onChange={event => void onAudioFile(event)} /><audio ref={audioRef} src={audioUrl || undefined} muted={muted} preload="auto" />
    {toast && <div className="toast" role="status"><Check size={17} /><span>{toast}</span><button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={15} /></button></div>}
    {dialog === 'new' && <Modal title="A new beginning" onClose={() => setDialog(null)}><p className="modal-intro">Create your next production. {dirty ? 'Save your current project to a file before replacing it.' : 'Choose a blank field or explore the sample show.'}</p><div className="new-options"><button onClick={() => { loadProject(createBlankProject()); window.squidware?.resetProject(); setNeedsSaveAs(true); setWorkspace('cast'); }}><FilePlus2 size={28} /><strong>Blank production</strong><span>An open field, ready for your ensemble.</span></button><button onClick={() => { loadProject(createDemoProject()); window.squidware?.resetProject(); setNeedsSaveAs(true); }}><Waves size={28} /><strong>Explore the demo</strong><span>64 performers. Six sets. Find your flow.</span></button></div>{dirty && <button className="button subtle" onClick={() => void saveProject()}>Save current project first</button>}</Modal>}
    {dialog === 'settings' && <Modal title="Production settings" onClose={() => setDialog(null)}><label className="form-label">Production title<CommitInput onDraftChange={setPendingDraft} value={project.title} maxLength={120} onCommit={title => change(p => ({ ...p, title }))} /></label><label className="form-label">Ensemble<input value={project.ensemble} maxLength={120} onChange={e => change(p => ({ ...p, ensemble: e.target.value }))} /></label><label className="form-label">Field markings<select value={project.field.preset} onChange={e => change(p => ({ ...p, field: { ...p.field, preset: e.target.value as 'college' | 'high-school' } }))}><option value="college">College · hashes 20 yd from sidelines</option><option value="high-school">High school · hashes 53 ft 4 in from sidelines</option></select></label><NumberField label="Audio sync offset · seconds" value={project.audioOffsetSeconds} min={-3600} max={3600} step={0.1} onChange={value => change(p => ({ ...p, audioOffsetSeconds: value }))} /><p className="microcopy">Positive offset starts the music later in the track; negative offset delays the music. Audio is attached per session and is not embedded in project files.</p><h3 className="modal-subtitle">Ensemble sections</h3>{project.sections.map(section => <div className="section-edit" key={section.id}><input aria-label={`${section.name} color`} type="color" value={section.color} onChange={e => change(p => ({ ...p, sections: p.sections.map(s => s.id === section.id ? { ...s, color: e.target.value } : s) }))} /><CommitInput onDraftChange={setPendingDraft} label="Section name" value={section.name} maxLength={60} onCommit={name => change(p => ({ ...p, sections: p.sections.map(s => s.id === section.id ? { ...s, name } : s) }))} /></div>)}<button className="button subtle" onClick={() => change(p => ({ ...p, sections: [...p.sections, { id: uid(), name: `Section ${p.sections.length + 1}`, color: '#a6cce2' }] }))} disabled={project.sections.length >= 20}><Plus size={14} />Add section</button><div className="modal-actions"><button className="button primary" onClick={() => setDialog(null)}>Done</button></div></Modal>}
    {dialog === 'export' && <Modal title="Take it to the field" onClose={() => setDialog(null)}><p className="modal-intro">Everything your ensemble needs for the next rehearsal.</p><div className="export-options"><label className={printMode === 'charts' ? 'selected' : ''}><input type="radio" name="print" checked={printMode === 'charts'} onChange={() => setPrintMode('charts')} /><Grid2X2 size={23} /><div><strong>Field charts</strong><span>One chart per set, with counts and rehearsal notes.</span></div></label><label className={printMode === 'coordinates' ? 'selected' : ''}><input type="radio" name="print" checked={printMode === 'coordinates'} onChange={() => setPrintMode('coordinates')} /><Users size={23} /><div><strong>Performer coordinate sheets</strong><span>Individual dot books with positions for every set.</span></div></label></div><button className="button primary export-pdf" onClick={() => void exportPdf()}><Download size={16} />{window.squidware ? 'Save PDF' : 'Print / save PDF'}</button><div className="export-secondary"><button className="button subtle" onClick={() => void exportText('csv')}>Coordinates CSV<Download size={14} /></button><button className="button subtle" onClick={() => void exportText('svg')}>Current chart SVG<Download size={14} /></button></div><p className="microcopy">Save the editable .squid project with the Save button. Exports are snapshots of this production.</p></Modal>}
    {dialog === 'add-cast' && <Modal title="Build your ensemble" onClose={() => setDialog(null)}><p className="modal-intro">New performers are added to every set, with starting positions near the front sideline.</p><div className="form-row"><NumberField label="Number of performers" value={castAmount} min={1} max={Math.max(1, 500 - project.performers.length)} onChange={value => setCastAmount(Math.round(value))} /><label className="form-label">Label prefix<input value={castPrefix} maxLength={6} onChange={e => setCastPrefix(e.target.value)} /></label></div><label className="form-label">Section<select value={castSection} onChange={e => setCastSection(e.target.value)}>{project.sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><div className="modal-actions"><button className="button subtle" onClick={() => rosterInput.current?.click()}>Import CSV instead</button><button className="button primary" onClick={() => addCast()}><Plus size={16} />Add performers</button></div><p className="microcopy">CSV headers: label,name,section. Section names must match an existing section. Labels must be unique.</p></Modal>}
    {dialog === 'remove-cast' && <Modal title={`Remove ${selectedIds.length} performers?`} onClose={() => setDialog(null)}><p className="modal-intro">Their positions will be removed from every set. You can undo this change.</p><div className="modal-actions"><button className="button subtle" onClick={() => setDialog(null)}>Cancel</button><button className="button danger" onClick={removeCast}>Remove performers</button></div></Modal>}
    {dialog === 'remove-set' && <Modal title={`Delete “${activeSet.name}”?`} onClose={() => setDialog(null)}><p className="modal-intro">The adjacent sets will connect directly. You can undo this change.</p><div className="modal-actions"><button className="button subtle" onClick={() => setDialog(null)}>Keep set</button><button className="button danger" onClick={removeSet}>Delete set</button></div></Modal>}
    {dialog === 'help' && <Modal title="Find your flow" onClose={() => setDialog(null)} wide><p className="modal-intro">Squidware is an independent desktop drill design studio. Start with a cast, shape each set, then rehearse the transitions.</p><div className="guide-grid"><section><h3>1. Build your production</h3><p>Open the project menu for a blank production, a demo, or a saved .squid file. Add performers in Cast; customize sections in project settings.</p><h3>2. Shape the field</h3><p>Click, Shift-click, or drag a selection box. Drag dots or use formation tools. Click a section in the legend to select its performers. Changes affect the current set.</p><h3>3. Rehearse & export</h3><p>Counts define the move into a set. Set tempo per transition, attach audio, and switch to 3D. Review transition checks, then export your rehearsal packet.</p></section><section><h3>Keyboard shortcuts</h3><dl className="shortcut-list">{[['Play / pause', 'Space'], ['Select / pan', 'V / H'], ['Select all', 'Ctrl / ⌘ A'], ['Nudge 1 / 4 steps', 'Arrow / Shift + Arrow'], ['Previous / next set', '[ / ]'], ['Undo / redo', 'Ctrl / ⌘ Z / Shift Z'], ['Save / save as', 'Ctrl / ⌘ S / Shift S'], ['Open / new', 'Ctrl / ⌘ O / N'], ['Clear selection', 'Esc']].map(([name, key]) => <div key={name}><dt>{name}</dt><dd>{key}</dd></div>)}</dl></section></div><div className="help-note"><ShieldCheck size={18} /><p>Your production stays on this device. Recovery saves automatically; use Save for a portable project file. This release does not import proprietary Pyware files or provide cloud collaboration. 3D figures are rehearsal markers, not uniform or instrument simulations.</p></div></Modal>}
    {printing && <PrintOutput project={project} mode={printMode} />}
  </>;
}
