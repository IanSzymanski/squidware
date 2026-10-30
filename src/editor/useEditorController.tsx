import { useCallback, useEffect, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import type { ChangeEvent } from 'react';

import type { AudioAttachment, SetPropertyUpdate, Performer, Point, Project } from '../types';
import { exportCoordinatesCsv, importRosterCsv, parseProject, serializeProject, totalCounts, uid, PROJECT_LIMITS } from '../domain';
import { FieldDrawing } from '../components/Field2D';

import { useProject } from '../useProject';

import { useEditorSelector, useEditorStore, useEditorValue } from './react';
import type { Dialog } from './state';
import { selectionMembership } from '../selection';
import { filterCast } from './castSelection';
import { createThumbnailRosterSelector, sectionMemberships } from './thumbnailRoster';
import { previewFormation } from '../formationPreview';
import { usePlaybackController } from './usePlaybackController';
import { useCommandController } from './useCommandController';
import { createDraftTracker } from './drafts';
import { usePreferencesController } from './usePreferencesController';
import { useTemplateLibrary } from './useTemplateLibrary';
import { useRecoveryController } from './useRecoveryController';
import { canEditPositions } from './editMode';
import { previewExactTransform } from '../transforms';
import type { TransformOperation } from '../transforms';
import { previewSpacing } from '../spacing';
import { previewCoordinateEntry } from '../drillEntry';
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
  const templates = useTemplateLibrary();
  const coordinateFormat = useMemo(() => ({ coordinatePrecision: preferences.value.coordinatePrecision, coordinateDecimals: preferences.value.coordinateDecimals }), [preferences.value.coordinatePrecision, preferences.value.coordinateDecimals]);
  const [activeIndex, setActiveIndex] = useEditorValue('selection', 'activeIndex');
  const [workspace, setWorkspace] = useEditorValue('ui', 'workspace');
  const castPanelOpen = useEditorSelector(state => state.ui.castPanelOpen);
  function showCast(mode: 'panel' | 'table' | 'closed') {
    flushSync(() => (document.activeElement as HTMLElement | null)?.blur());
    if (dispatch('cast.show', { mode }) === true) requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(mode === 'closed' ? '.selection-bar button' : '[aria-label="Find a performer"]')?.focus();
    });
  }
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
  const [selectionLabelsOnly, setSelectionLabelsOnly] = useEditorValue('ui', 'selectionLabelsOnly');
  const [showPaths, setShowPaths] = useEditorValue('ui', 'showPaths');
  const [showNextPaths, setShowNextPaths] = useEditorValue('ui', 'showNextPaths');
  const [showGrid, setShowGrid] = useEditorValue('ui', 'showGrid');
  const [snap, setSnap] = useEditorValue('ui', 'snap');
  const transformPreview = useEditorSelector(state => state.ui.transformPreview);
  const spacingPreview = useEditorSelector(state => state.ui.spacingPreview);
  const coordinatePreview = useEditorSelector(state => state.ui.coordinatePreview);
  const selectionPreview = useEditorSelector(state => state.ui.selectionPreview);
  const formationPreview = useEditorSelector(state => state.ui.formationPreview);
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
  const portableAudio = useEditorSelector(s => s.fileSession);
  function patchAudio(values: Partial<typeof portableAudio>) {
    for (const key of Object.keys(values) as (keyof typeof portableAudio)[]) {
      store.setValue('fileSession', key, values[key]!);
    }
  }
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
  const transformResult = useMemo(() => transformPreview ? previewExactTransform(activeSet.positions, transformPreview.ids, transformPreview.options, project.field) : null, [transformPreview, activeSet.positions, project.field]);
  const spacingResult = useMemo(() => spacingPreview ? previewSpacing(activeSet.positions, spacingPreview.ids, spacingPreview.options, project.field, project) : null, [spacingPreview, activeSet.positions, project.field, project.snapping]);
  function openTransform(operation: TransformOperation = 'rotate-scale', angle = 0, scale = 1) { dispatch('transform.preview', { operation, angle, scale }); }
  const formationResult = useMemo(() => formationPreview ? previewFormation(activeSet.positions, formationPreview.ids, formationPreview.kind, formationPreview.options, project.field, formationPreview.order) : null, [formationPreview, activeSet.positions, project.field]);
  const coordinateResult = useMemo(() => coordinatePreview ? previewCoordinateEntry(activeSet.positions, coordinatePreview.ids, coordinatePreview.options, project) : null, [coordinatePreview, activeSet.positions, project.field, project.snapping]);
  const duration = useMemo(() => totalCounts(project), [project.moves]);
  const readOnly = !useEditorSelector(canEditPositions);
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
  function addSet() { dispatch('set.new'); }
  function duplicateSet() { dispatch('set.duplicate'); }
  function removeSet() { dispatch('set.remove', { index }); }
  function reorderSet(direction: -1 | 1) { dispatch('set.reorder', { index, direction }); }
  function applyFormation() { if (dispatch('formation.apply')) notify('Formation applied to the selection.'); }
  function loadProject(next: Project) {
    draftTracker.current.clear();
    patchAudio({ audioDuration: 0, audioToken: '', audioSize: 0, audioReferenceAvailable: false, audioWarning: '' });
    dispatch('project.load', { project: next }); setPendingDraft(false); setActiveIndex(0); setCount(0); setPlaying(false); setSelectedIds([]); setDialog(null); setAudioUrl(''); setAudioName(''); setWaveform([]); audioDecodeGeneration.current += 1; setAudioLoading(false); setWorkspace('design'); setCastSection(next.sections[0]?.id || ''); setFitVersion(v => v + 1);
  }
  function replaceProduction(next: Project, cast = false) {
    try {
      flushSync(() => (document.activeElement as HTMLElement | null)?.blur());
      assertCanReplace(store.getState());
      if (hasUnsavedWork(store.getState()) && !window.confirm('Replace this production? Your unsaved changes will be discarded. Save a project file first to keep them.')) return;
      loadProject({ ...next, analysisRules: { defaults: { minimumSpacing: preferences.value.minimumSpacing, maximumStride: preferences.value.maximumStride } }, snapping: { ...preferences.value.snapDefaults } }); window.squidware?.resetProject();
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
        if (result.audio) await attachAudio(result.audio);
        if (result.audioWarning) store.setValue('fileSession', 'audioWarning', result.audioWarning);
        notify(result.audioWarning || 'Project opened');
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
      const content = kind === 'csv' ? exportCoordinatesCsv(project, coordinateFormat) : renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" viewBox="-7 -8 114 69.333" width="1392" height="784"><title>{project.title} — {activeSet.name}</title><FieldDrawing project={project} positions={activeSet.positions} showLabels showGrid coordinateFormat={coordinateFormat} /></svg>);
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
  async function attachAudio(attachment: AudioAttachment | File) {
    const generation = ++audioDecodeGeneration.current;
    setPlaying(false); setAudioLoading(true);
    let ctx: AudioContext | null = null;
    try {
      const bytes = attachment instanceof File ? new Uint8Array(await attachment.arrayBuffer()) : attachment.bytes;
      if (bytes.byteLength > 200 * 1024 * 1024) throw new Error('Choose an audio file up to 200 MiB.');
      ctx = new AudioContext(); const buffer = await ctx.decodeAudioData(new Uint8Array(bytes).buffer);
      const channel = buffer.getChannelData(0), bars = 180, chunk = Math.max(1, Math.floor(channel.length / bars));
      const peaks = Array.from({ length: bars }, (_, i) => { let max = 0; for (let j = i * chunk; j < Math.min(channel.length, (i + 1) * chunk); j += 32) max = Math.max(max, Math.abs(channel[j])); return max; });
      if (generation !== audioDecodeGeneration.current) return;
      const native = attachment instanceof File ? await window.squidware?.stageAudio(attachment.name, bytes) : attachment;
      if (generation !== audioDecodeGeneration.current) return;
      if (native) await window.squidware?.useAudio(native.token);
      if (generation !== audioDecodeGeneration.current) return;
      const blob = new Blob([new Uint8Array(bytes)], { type: native?.type || (attachment as File).type });
      setAudioUrl(URL.createObjectURL(blob)); setAudioName(attachment.name); setWaveform(peaks);
      patchAudio({ audioDuration: buffer.duration, audioToken: native?.token || '', audioSize: bytes.length, audioReferenceAvailable: native?.referenceAvailable || false, audioWarning: '' });
      notify('Audio attached. Export a portable package to transfer it with this production.');
    } catch (error) {
      if (generation === audioDecodeGeneration.current) {
        const message = `Audio could not be loaded: ${(error as Error).message}. Attach or relink a supported recording; drill and offset are intact.`;
        store.setValue('fileSession', 'audioWarning', message); notify(message);
      }
    } finally { await ctx?.close(); if (generation === audioDecodeGeneration.current) setAudioLoading(false); }
  }
  async function chooseAudio() {
    if (!window.squidware) { audioInput.current?.click(); return; }
    if (store.getState().fileSession.fileOperation || store.getState().fileSession.audioLoading) return;
    const epoch = store.getState().ui.projectEpoch;
    setAudioLoading(true);
    try { const result = await window.squidware.pickAudio(); if (result && epoch === store.getState().ui.projectEpoch) await attachAudio(result); }
    catch (error) { notify(`Could not attach audio: ${(error as Error).message}`); }
    finally { if (epoch === store.getState().ui.projectEpoch) setAudioLoading(false); }
  }
  async function onAudioFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    if (file.size > 200 * 1024 * 1024) { notify('Choose an audio file up to 200 MiB.'); return; }
    await attachAudio(file);
  }
  async function exportPackage(mode: 'bundle' | 'reference') {
    try {
      flushSync(() => (document.activeElement as HTMLElement | null)?.blur());
      const before = store.getState();
      assertCanReplace(before);
      if (before.fileSession.audioLoading || !before.fileSession.audioToken) throw new Error('Attach audio before exporting a portable package.');
      if (!window.squidware) throw new Error('Portable packages are available in the desktop app.');
      store.setValue('fileSession', 'fileOperation', 'exporting');
      try {
        const result = await window.squidware.exportPackage(serializeProject(before.project.present), `${cleanFilename(before.project.present.title)}.squidpack`, before.fileSession.audioToken, mode);
        if (result && before.ui.projectEpoch === store.getState().ui.projectEpoch) {
          if (store.getState().ui.dialog === 'package') setDialog(null);
          notify(before.project.revision === store.getState().project.revision ? 'Portable package exported. Save keeps using your .squid project destination.' : 'Earlier revision exported. Export another package to include your latest edits.');
        }
      } finally { store.setValue('fileSession', 'fileOperation', null); }
    } catch (error) { notify(`Package export failed: ${(error as Error).message}`); }
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

  const filteredCast = useMemo(() => filterCast(project.performers, castQuery, sectionFilter), [project.performers, sectionFilter, castQuery]);
  const visibleSet = activeSet;
  return { templates, portableAudio, chooseAudio, exportPackage, selectionPreview, coordinatePreview, coordinateResult, spacingPreview, spacingResult, castPanelOpen, showCast, formationPreview, formationResult, transformPreview, transformResult, openTransform, coordinateFormat, selectedSet, sectionMembers, thumbnailDots, preferences, fileStatus, fileOperation, replaceProduction, project, history, recoveryError, recovery, dispatch, canUndo, canRedo, store, activeIndex, setActiveIndex, workspace, setWorkspace, view, setView, selectedIds, setSelectedIds, setCount, playing, setPlaying, loop, setLoop, speed, setSpeed, metronome, setMetronome, tool, setTool, zoom, setZoom, fitVersion, setFitVersion, showLabels, setShowLabels, selectionLabelsOnly, setSelectionLabelsOnly, showPaths, setShowPaths, showNextPaths, setShowNextPaths, showGrid, setShowGrid, snap, setSnap, dialog, setDialog, pendingDraft, setPendingDraft, menu, setMenu, toast, setToast, savedRevision, setSavedRevision, needsSaveAs, setNeedsSaveAs, saveStatus, setSaveStatus, formation, setFormation, formationWidth, setFormationWidth, formationHeight, setFormationHeight, formationRotation, setFormationRotation, formationColumns, setFormationColumns, castQuery, setCastQuery, sectionFilter, setSectionFilter, castAmount, setCastAmount, castSection, setCastSection, castPrefix, setCastPrefix, printMode, setPrintMode, printing, setPrinting, audioName, setAudioName, audioUrl, setAudioUrl, waveform, setWaveform, audioLoading, setAudioLoading, muted, setMuted, audioRef, audioInput, projectInput, rosterInput, audioDecodeGeneration, index, activeSet, duration, readOnly, dirty, allSelected, selectedPerformers, selectionCenter, notify, selectSet, undoDrill, redoDrill, updateSet, movePerformers, transform, addSet, duplicateSet, removeSet, reorderSet, applyFormation, loadProject, saveProject, openProject, onProjectFile, exportText, exportPdf, onAudioFile, togglePlay, scrub, addCast, onRosterFile, removeCast, projectEpoch, filteredCast, visibleSet };
}
export type EditorController = ReturnType<typeof useEditorController>;
