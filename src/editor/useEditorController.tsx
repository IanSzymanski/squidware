import { useCallback, useEffect, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import type { ChangeEvent } from 'react';

import type { SetPropertyUpdate, Performer, Point, Project } from '../types';
import { analyzeTransition, exportCoordinatesCsv, importRosterCsv, parseProject, serializeProject, totalCounts, uid, PROJECT_LIMITS } from '../domain';
import { FieldDrawing } from '../components/Field2D';

import { useProject } from '../useProject';

import { useEditorSelector, useEditorStore, useEditorValue } from './react';
import type { Dialog } from './state';
import { selectionMembership } from '../selection';
import { createThumbnailRosterSelector, sectionMemberships } from './thumbnailRoster';
import { formations } from './formations';
import { usePlaybackController } from './usePlaybackController';
import { useCommandController } from './useCommandController';
import { createDraftTracker } from './drafts';
import { usePreferencesController } from './usePreferencesController';
import { useRecoveryController } from './useRecoveryController';
import { canEditPositions } from './editMode';
import { assertCanReplace, assertUnchangedSince, fileStatusText, hasUnsavedWork, markFileOpened, saveProjectRevision } from './fileSession';
const cleanFilename = (title: string) => (title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/[. ]+$/, '').trim().slice(0, 100) || 'Squidware project').replace(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i, '$1-project');
function download(content: string, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useEditorController() {
  const { project, history, recoveryError, dispatch, canUndo, canRedo } = useProject();
  const store = useEditorStore();
  const preferences = usePreferencesController();
  const [activeIndex, setActiveIndex] = useEditorValue('selection', 'activeIndex');
  const [workspace, setWorkspace] = useEditorValue('ui', 'workspace');
  const projectEpoch = useEditorSelector(state => state.ui.projectEpoch);
  const [view, setView] = useEditorValue('ui', 'view');
  const [selectedIds, setSelectedIds] = useEditorValue('selection', 'selectedIds');
  const setCount = useCallback((value: number | ((previous: number) => number)) => store.setValue('playback', 'count', value), [store]);
  const [playing, setPlaying] = useEditorValue('playback', 'playing');
  const [loop, setLoop] = useEditorValue('playback', 'loop');
  const [speed, setSpeed] = useEditorValue('playback', 'speed');
  const [metronome, setMetronome] = useEditorValue('playback', 'metronome');
  const [tool, setTool] = useEditorValue('ui', 'tool');
  const [zoom, setZoom] = useEditorValue('ui', 'zoom');
  const [fitVersion, setFitVersion] = useEditorValue('ui', 'fitVersion');
  const [showLabels, setShowLabels] = useEditorValue('ui', 'showLabels');
  const [showPaths, setShowPaths] = useEditorValue('ui', 'showPaths');
  const [showGrid, setShowGrid] = useEditorValue('ui', 'showGrid');
  const [snap, setSnap] = useEditorValue('ui', 'snap');
  const [dialog] = useEditorValue('ui', 'dialog');
  function setDialog(next: Dialog) { flushSync(() => (document.activeElement as HTMLElement | null)?.blur()); dispatch('dialog.open', { dialog: next }); }
  const [pendingDraft, setPendingDraftState] = useEditorValue('ui', 'pendingDraft');
  const draftTracker = useRef(createDraftTracker());
  const setPendingDraft = useCallback((pending: boolean, fieldId?: string) => {
    setPendingDraftState(draftTracker.current.update(pending, fieldId));
  }, [setPendingDraftState]);
  const [menu, setMenu] = useEditorValue('ui', 'menu');
  const [toast, setToast] = useEditorValue('ui', 'toast');
  const [savedRevision, setSavedRevision] = useEditorValue('fileSession', 'savedRevision');
  const [needsSaveAs, setNeedsSaveAs] = useEditorValue('fileSession', 'needsSaveAs');
  const [saveStatus, setSaveStatus] = useEditorValue('fileSession', 'saveStatus');
  const fileOperation = useEditorSelector(state => state.fileSession.fileOperation);
  const fileStatus = useEditorSelector(fileStatusText);
  const [formation, setFormation] = useEditorValue('ui', 'formation');
  const [formationWidth, setFormationWidth] = useEditorValue('ui', 'formationWidth');
  const [formationHeight, setFormationHeight] = useEditorValue('ui', 'formationHeight');
  const [formationRotation, setFormationRotation] = useEditorValue('ui', 'formationRotation');
  const [formationColumns, setFormationColumns] = useEditorValue('ui', 'formationColumns');
  const [castQuery, setCastQuery] = useEditorValue('ui', 'castQuery');
  const [sectionFilter, setSectionFilter] = useEditorValue('ui', 'sectionFilter');
  const [castAmount, setCastAmount] = useEditorValue('ui', 'castAmount');
  const [castSection, setCastSection] = useEditorValue('ui', 'castSection');
  const [castPrefix, setCastPrefix] = useEditorValue('ui', 'castPrefix');
  const [printMode, setPrintMode] = useEditorValue('ui', 'printMode');
  const [printing, setPrinting] = useEditorValue('ui', 'printing');
  const [audioName, setAudioName] = useEditorValue('fileSession', 'audioName');
  const [audioUrl, setAudioUrl] = useEditorValue('fileSession', 'audioUrl');
  const [waveform, setWaveform] = useEditorValue('fileSession', 'waveform');
  const [audioLoading, setAudioLoading] = useEditorValue('fileSession', 'audioLoading');
  const [muted, setMuted] = useEditorValue('playback', 'muted');
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const rosterInput = useRef<HTMLInputElement>(null);
  const audioDecodeGeneration = useRef(0);
  const index = Math.min(activeIndex, project.sets.length - 1);
  const activeSet = project.sets[index];
  const duration = useMemo(() => totalCounts(project), [project.moves]);
  const readOnly = !useEditorSelector(canEditPositions);
  const issues = useMemo(() => analyzeTransition(project, index, preferences.value), [project, index, preferences.value.minimumSpacing, preferences.value.maximumStride]);
  const dirty = history.revision !== savedRevision || pendingDraft;
  const selectedSet = useMemo(() => selectionMembership(selectedIds), [selectedIds]);
  const allSelected = useMemo(() => project.performers.length > 0 && project.performers.every(p => selectedSet.has(p.id)), [project.performers, selectedSet]);
  const selectedPerformers = useMemo(() => project.performers.filter(p => selectedSet.has(p.id)), [project.performers, selectedSet]);
  const sectionMembers = useMemo(() => sectionMemberships(project.performers, project.sections), [project.performers, project.sections]);
  const thumbnailRoster = useMemo(() => createThumbnailRosterSelector(), []);
  const thumbnailDots = useMemo(() => thumbnailRoster(project.performers, project.sections), [thumbnailRoster, project.performers, project.sections]);
  const selectionCenter = useMemo(() => selectedIds.length ? selectedIds.reduce((point, id) => ({ x: point.x + (activeSet.positions[id]?.x || 0) / selectedIds.length, y: point.y + (activeSet.positions[id]?.y || 0) / selectedIds.length }), { x: 0, y: 0 }) : { x: 50, y: 26.667 }, [selectedIds, activeSet.positions]);

  const notify = useCallback((message: string) => { setToast(message); }, []);
  useEffect(() => { if (!toast) return; const timeout = setTimeout(() => setToast(''), 5000); return () => clearTimeout(timeout); }, [toast]);
  const recovery = useRecoveryController(loadProject);
  useEffect(() => {
    const update = () => window.squidware?.setDirty(hasUnsavedWork(store.getState()));
    update();
    return store.subscribeSelector(hasUnsavedWork, update);
  }, [store]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => { if (hasUnsavedWork(store.getState()) && !window.squidware) e.preventDefault(); };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [store]);
  useEffect(() => { if (!audioUrl) return; return () => URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  function selectSet(next: number) { dispatch('set.select', { index: next }); }
  function undoDrill() { dispatch('history.undo'); }
  function redoDrill() { dispatch('history.redo'); }
  function updateSet(update: SetPropertyUpdate) { dispatch('set.update', { index, update }); }
  function movePerformers(updates: Record<string, Point>) { dispatch('positions.move', { index, updates }); }
  function transform(options: { dx?: number; dy?: number; rotation?: number; scale?: number }) { dispatch('selection.transform', { index, ids: selectedIds, options }); }
  function addSet() {
    if (project.sets.length >= PROJECT_LIMITS.sets) { notify(`This release supports up to ${PROJECT_LIMITS.sets} sets per production.`); return; }
    dispatch('set.add', { index }); notify('New set added. Shape the next moment.');
  }
  function duplicateSet() { addSet(); }
  function removeSet() { dispatch('set.remove', { index }); }
  function reorderSet(direction: -1 | 1) { dispatch('set.reorder', { index, direction }); }
  function applyFormation() {
    if (document.querySelector('.formation-section input[aria-invalid="true"]')) { notify('Correct the formation values before applying.'); return; }
    if (readOnly) return;
    const ids = selectedIds.length ? project.performers.filter(p => selectedSet.has(p.id)).map(p => p.id) : project.performers.map(p => p.id);
    if (dispatch('formation.apply', { index, ids, kind: formation, options: { center: selectionCenter, width: formationWidth, height: formationHeight, rotation: formationRotation, columns: formationColumns } })) notify(`${formations.find(f => f.kind === formation)?.label} applied to ${ids.length} performers`);
  }
  function loadProject(next: Project) {
    draftTracker.current.clear();
    dispatch('project.load', { project: next }); setPendingDraft(false); setActiveIndex(0); setCount(0); setPlaying(false); setSelectedIds([]); setDialog(null); setAudioUrl(''); setAudioName(''); setWaveform([]); audioDecodeGeneration.current += 1; setAudioLoading(false); setWorkspace('design'); setCastSection(next.sections[0]?.id || ''); setFitVersion(v => v + 1);
  }
  function replaceProduction(next: Project, cast = false) {
    try {
      flushSync(() => (document.activeElement as HTMLElement | null)?.blur());
      assertCanReplace(store.getState());
      if (hasUnsavedWork(store.getState()) && !window.confirm('Replace this production? Your unsaved changes will be discarded. Save a project file first to keep them.')) return;
      loadProject(next); window.squidware?.resetProject();
      if (cast) setWorkspace('cast');
    } catch (error) { notify((error as Error).message); }
  }
  async function saveProjectFile(saveAs = false) {
    try {
      flushSync(() => (document.activeElement as HTMLElement | null)?.blur());
      if (document.querySelector('[aria-invalid="true"]')) { notify('Correct the invalid field before saving.'); return; }
      const result = await saveProjectRevision(store, async (savingProject, forceSaveAs) => {
        const content = serializeProject(savingProject);
        if (window.squidware) return !!await window.squidware.saveProject(content, `${cleanFilename(savingProject.title)}.squid`, forceSaveAs);
        download(content, `${cleanFilename(savingProject.title)}.squid`, 'application/json');
        return true;
      }, saveAs);
      if (result === 'busy') notify('Finish the current file operation before saving.');
      if (result === 'saved') {
        if (!window.squidware) setSaveStatus('Project download requested');
        notify(hasUnsavedWork(store.getState()) ? 'Earlier revision saved. Your latest changes still need saving.' : window.squidware ? 'Project saved' : 'Project download requested');
      }
    } catch (error) { notify(`Could not save: ${(error as Error).message}`); }
  }
  async function openProjectFile() {
    flushSync(() => (document.activeElement as HTMLElement | null)?.blur());
    setMenu(false);
    try {
      assertCanReplace(store.getState());
      if (document.querySelector('[aria-invalid="true"]')) throw new Error('Finish or cancel the pending field before opening another production.');
      if (hasUnsavedWork(store.getState()) && !window.confirm('Open another project? Save a project file first to keep your latest edits.')) return;
      if (!window.squidware) { projectInput.current?.click(); return; }
      const before = store.getState();
      store.setValue('fileSession', 'fileOperation', 'opening');
      try {
        const result = await window.squidware.openProject(); if (!result) return;
        assertUnchangedSince(before, store.getState());
        loadProject(parseProject(result.content));
        markFileOpened(store, !result.path.toLowerCase().endsWith('.squid'));
        notify('Project opened');
      } catch (error) { window.squidware.resetProject(); setNeedsSaveAs(true); throw error; }
      finally { store.setValue('fileSession', 'fileOperation', null); }
    } catch (error) { notify(`Could not open: ${(error as Error).message}`); }
  }
  async function onProjectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try {
      assertCanReplace(store.getState());
      if (file.size > PROJECT_LIMITS.projectBytes) throw new Error(`Project files must be no larger than ${PROJECT_LIMITS.projectBytes / 1024 / 1024} MiB.`);
      const before = store.getState(); store.setValue('fileSession', 'fileOperation', 'opening');
      try { const next = parseProject(await file.text()); assertUnchangedSince(before, store.getState()); loadProject(next); markFileOpened(store, true); notify('Project imported'); }
      finally { store.setValue('fileSession', 'fileOperation', null); }
    } catch (error) { notify((error as Error).message); }
  }
  async function exportText(kind: 'csv' | 'svg') {
    try {
      const { renderToStaticMarkup } = kind === 'svg' ? await import('react-dom/server') : { renderToStaticMarkup: () => '' };
      const content = kind === 'csv' ? exportCoordinatesCsv(project, preferences.value.coordinateDecimals) : renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" viewBox="-7 -8 114 69.333" width="1392" height="784"><title>{project.title} — {activeSet.name}</title><FieldDrawing project={project} positions={activeSet.positions} showLabels={showLabels} showGrid coordinateDecimals={preferences.value.coordinateDecimals} /></svg>);
      const filename = `${cleanFilename(project.title)}${kind === 'svg' ? `-set-${index + 1}` : '-coordinates'}.${kind}`;
      if (window.squidware) { if (!await window.squidware.exportFile(content, filename, kind)) return; } else download(content, filename, kind === 'csv' ? 'text/csv;charset=utf-8' : 'image/svg+xml');
      notify(`${kind.toUpperCase()} exported`); setDialog(null);
    } catch (error) { notify(`Export failed: ${(error as Error).message}`); }
  }
  async function exportPdf() {
    setPlaying(false); setDialog(null); setPrinting(true);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try { if (window.squidware) { if (await window.squidware.exportPdf(preferences.value.paperSize)) notify('PDF saved'); } else window.print(); } catch (error) { notify(`PDF export failed: ${(error as Error).message}`); } finally { setPrinting(false); }
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
  usePlaybackController(audioRef, audioUrl);
  function togglePlay() { if (!duration) { notify('Add a second set to rehearse a transition.'); return; } dispatch('playback.toggle'); }
  function scrub(next: number) { dispatch('playback.scrub', { count: next }); }
  function addCast(performers?: Performer[]) {
    if (!performers && document.querySelector('.modal input[aria-invalid="true"]')) { notify('Correct the performer count before adding performers.'); return; }
    const sectionId = project.sections.some(s => s.id === castSection) ? castSection : project.sections[0].id;
    const existingLabels = new Set(project.performers.map(p => p.label));
    let ordinal = 1;
    const added = performers || Array.from({ length: castAmount }, () => { while (existingLabels.has(`${castPrefix || 'P'}${ordinal}`)) ordinal++; const label = `${castPrefix || 'P'}${ordinal++}`; existingLabels.add(label); return { id: uid(), label, name: '', sectionId }; });
    if (project.performers.length + added.length > PROJECT_LIMITS.performers) { notify(`This release supports up to ${PROJECT_LIMITS.performers} performers.`); return; }
    if (added.some(p => project.performers.some(existing => existing.label === p.label))) { notify('Roster labels must be unique. Rename duplicate labels before importing.'); return; }
    if (dispatch('performers.add', { performers: added }) === true) notify(`${added.length} performers added to every set`);
  }
  async function onRosterFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try { if (file.size > 2 * 1024 * 1024) throw new Error('Roster CSV must be under 2 MB.'); addCast(importRosterCsv(await file.text(), project.sections)); } catch (error) { notify((error as Error).message); }
  }
  function removeCast() { dispatch('performers.remove', { ids: selectedIds }); }

  const fileHandlers = useRef({ saveProjectFile, openProjectFile });
  fileHandlers.current = { saveProjectFile, openProjectFile };
  useEffect(() => {
    const unregister = [store.registerExternal('file.save', () => fileHandlers.current.saveProjectFile()), store.registerExternal('file.save-as', () => fileHandlers.current.saveProjectFile(true)), store.registerExternal('file.open', () => fileHandlers.current.openProjectFile())];
    return () => unregister.forEach(remove => remove());
  }, [store]);
  function saveProject(saveAs = false) { return dispatch(saveAs ? 'file.save-as' : 'file.save'); }
  function openProject() { return dispatch('file.open'); }
  useCommandController();

  const filteredCast = useMemo(() => { const query = castQuery.toLowerCase(); return project.performers.filter(p => (sectionFilter === 'all' || p.sectionId === sectionFilter) && `${p.name} ${p.label}`.toLowerCase().includes(query)); }, [project.performers, sectionFilter, castQuery]);
  const visibleSet = activeSet;
  return { selectedSet, sectionMembers, thumbnailDots, preferences, fileStatus, fileOperation, replaceProduction, project, history, recoveryError, recovery, dispatch, canUndo, canRedo, store, activeIndex, setActiveIndex, workspace, setWorkspace, view, setView, selectedIds, setSelectedIds, setCount, playing, setPlaying, loop, setLoop, speed, setSpeed, metronome, setMetronome, tool, setTool, zoom, setZoom, fitVersion, setFitVersion, showLabels, setShowLabels, showPaths, setShowPaths, showGrid, setShowGrid, snap, setSnap, dialog, setDialog, pendingDraft, setPendingDraft, menu, setMenu, toast, setToast, savedRevision, setSavedRevision, needsSaveAs, setNeedsSaveAs, saveStatus, setSaveStatus, formation, setFormation, formationWidth, setFormationWidth, formationHeight, setFormationHeight, formationRotation, setFormationRotation, formationColumns, setFormationColumns, castQuery, setCastQuery, sectionFilter, setSectionFilter, castAmount, setCastAmount, castSection, setCastSection, castPrefix, setCastPrefix, printMode, setPrintMode, printing, setPrinting, audioName, setAudioName, audioUrl, setAudioUrl, waveform, setWaveform, audioLoading, setAudioLoading, muted, setMuted, audioRef, audioInput, projectInput, rosterInput, audioDecodeGeneration, index, activeSet, duration, readOnly, issues, dirty, allSelected, selectedPerformers, selectionCenter, notify, selectSet, undoDrill, redoDrill, updateSet, movePerformers, transform, addSet, duplicateSet, removeSet, reorderSet, applyFormation, loadProject, saveProject, openProject, onProjectFile, exportText, exportPdf, onAudioFile, togglePlay, scrub, addCast, onRosterFile, removeCast, projectEpoch, filteredCast, visibleSet };
}
export type EditorController = ReturnType<typeof useEditorController>;
