import { nudgeLabel } from '../editIncrements';
import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { ArrowRight, LockKeyhole } from 'lucide-react';

import { setTiming,  sampleProject } from '../domain';
import { Field2D } from '../components/Field2D';
import { Stage3DLoader } from '../components/Stage3DLoader';
import type { Stage3DQuality } from '../components/Stage3D';

import { useEditorSelector } from './react';
import { isAtActiveSet } from './editMode';
import type { EditorController } from './useEditorController';
import { neighborOverlays } from '../neighborPaths';

export function EditorField({ controller, children }: { controller: EditorController; children?: ReactNode }) {
  const { project, activeSet, view, selectedIds, setSelectedIds, playing, tool, zoom, setZoom, fitVersion, showLabels, showPaths, showGrid, snap, index, readOnly, selectSet, movePerformers } = controller;
  const atSet = useEditorSelector(isAtActiveSet);
  const count = useEditorSelector(state => state.playback.count);
  const [quality, setQuality] = useState<Stage3DQuality>('detailed');
  const fieldRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (view !== '3d' || !field) return;
    const observed = new WeakSet<Element>();
    const resize = new ResizeObserver(placeCamera);
    function placeCamera() {
      const camera = field!.querySelector<HTMLElement>('.stage-three__controls');
      if (!camera) { field!.style.removeProperty('--camera-min-height'); return; }
      const overlays = [...field!.querySelectorAll<HTMLElement>('.field-legend, .field-preview-banner')];
      for (const node of [camera, ...overlays]) if (!observed.has(node)) { observed.add(node); resize.observe(node); }
      const top = Math.max(56, ...overlays.map(node => node.offsetTop + node.offsetHeight)) + 8;
      field!.style.setProperty('--camera-top', `${top}px`);
      // The minimum top offset leaves the focus restore action reachable.
      // Reserve room for wrapped controls, field status and orbit help.
      field!.style.setProperty('--camera-min-height', `${top + camera.offsetHeight + 80}px`);
    }
    // The lazy 3D renderer adds camera controls after the field has mounted.
    const mounted = new MutationObserver(placeCamera);
    mounted.observe(field, { childList: true, subtree: true });
    resize.observe(field); placeCamera();
    return () => { resize.disconnect(); mounted.disconnect(); field.style.removeProperty('--camera-top'); field.style.removeProperty('--camera-min-height'); };
  }, [view, readOnly]);
  const sample = useMemo(() => sampleProject(project, count), [project, count]);
  const positions = controller.coordinateResult?.positions ?? controller.spacingResult?.positions ?? controller.formationResult?.positions ?? controller.transformResult?.positions ?? (atSet && !playing ? activeSet.positions : sample.positions);
  const neighbors = useMemo(() => neighborOverlays(project, index, {
    previous: showPaths, next: controller.showNextPaths, selectedIds,
    sectionFilter: controller.sectionFilter, preview: readOnly,
  }), [project, index, showPaths, controller.showNextPaths, selectedIds, controller.sectionFilter, readOnly]);
  const reviewing = !readOnly && (showPaths && index > 0 || controller.showNextPaths && index < project.sets.length - 1);
  const destination = project.sets[sample.setIndex];
  const displayCount = (value: number) => Number(value.toFixed(1));
  return (<div ref={fieldRef} className={`field-container ${view === '3d' ? 'is-3d' : ''}${readOnly ? ' field-container--preview' : ''}`}><div className="field-topline"><span><span className="live-dot" />{controller.coordinatePreview ? 'COORDINATE PREVIEW' : controller.spacingPreview ? 'SPACING PREVIEW' : controller.formationPreview ? 'FORMATION PREVIEW' : controller.transformPreview ? 'TRANSFORM PREVIEW' : playing ? 'REHEARSING' : readOnly ? 'READ-ONLY PREVIEW' : 'FIELD VIEW'}{view === '2d' && <> · AUDIENCE {controller.preferences.value.fieldOrientation === 'audience-top' ? 'TOP' : 'BOTTOM'}</>}</span><span>{project.field.preset === 'college' ? 'COLLEGE' : 'HIGH SCHOOL'} · 100 × 53⅓ YD</span></div>
              {readOnly && !controller.transformPreview && !controller.formationPreview && !controller.spacingPreview && !controller.coordinatePreview && <div className="field-preview-banner"><LockKeyhole size={17} aria-hidden="true" /><div id="field-preview-message"><strong>{sample.setIndex > 0 && sample.progress < 1 ? `Move ${sample.setIndex} → ${sample.setIndex + 1} · ${destination.name}` : `Set ${sample.setIndex + 1} · ${destination.name}`} · Count {displayCount(count)}{sample.setIndex > 0 && sample.progress < 1 ? ` (${displayCount(sample.localCount)} / ${setTiming(project, sample.setIndex).counts})` : ''}</strong><span>{playing ? 'Playback is running. Stop at a set to edit positions.' : 'Between sets: positions are a preview. Go to a set to edit.'}</span></div><button onClick={() => selectSet(sample.setIndex)}>Go to set {sample.setIndex + 1}<ArrowRight size={14} aria-hidden="true" /></button></div>}
              {controller.transformPreview && <div className={`field-preview-banner transform-preview-banner${controller.transformResult?.error ? ' transform-preview-banner--error' : ''}`} id="field-preview-message" role="status"><strong>Transform preview · {selectedIds.length} selected{controller.transformResult?.error ? ' · outside field' : ''}</strong></div>}
              {controller.formationPreview && <div className={`field-preview-banner transform-preview-banner${controller.formationResult?.error ? ' transform-preview-banner--error' : ''}`} id="field-preview-message" role="status"><strong>Formation preview · {selectedIds.length} selected{controller.formationResult?.error ? ' · outside field' : ''}</strong></div>}
              {controller.spacingPreview && <div className={`field-preview-banner transform-preview-banner${controller.spacingResult?.error ? ' transform-preview-banner--error' : ''}`} id="field-preview-message" role="status"><strong>Spacing preview · {selectedIds.length} selected{controller.spacingResult?.error ? ' · review error' : ''}</strong></div>}
              {controller.coordinatePreview && <div className={`field-preview-banner transform-preview-banner${controller.coordinateResult?.error && controller.coordinatePreview.options.text.trim() ? ' transform-preview-banner--error' : ''}`} id="field-preview-message" role="status"><strong>Coordinate preview · {selectedIds.length} selected{controller.coordinateResult?.error && controller.coordinatePreview.options.text.trim() ? ' · review input' : ''}</strong></div>}
              {view === '2d' ? <Field2D project={project} positions={positions} neighbors={neighbors} selectedIds={selectedIds} onSelect={controller.transformPreview || controller.formationPreview || controller.spacingPreview || controller.coordinatePreview ? () => {} : setSelectedIds} onMove={movePerformers} coordinatePreview={controller.coordinatePreview && controller.coordinateResult ? { session: controller.coordinatePreview, result: controller.coordinateResult, original: activeSet.positions, onApply: () => { controller.dispatch('coordinates.apply'); }, onCancel: () => { controller.dispatch('coordinates.cancel'); } } : undefined} spacingPreview={controller.spacingPreview && controller.spacingResult ? { session: controller.spacingPreview, result: controller.spacingResult, original: activeSet.positions, invalidInput: controller.pendingDraft, onUpdate: options => { controller.dispatch('spacing.update', { options }); }, onApply: () => { controller.dispatch('spacing.apply'); }, onCancel: () => { controller.dispatch('spacing.cancel'); } } : undefined} formationPreview={controller.formationPreview && controller.formationResult ? { session: controller.formationPreview, result: controller.formationResult, original: activeSet.positions, invalidInput: controller.pendingDraft, onUpdate: options => { controller.dispatch('formation.update', { options }); }, onCancel: () => { controller.dispatch('formation.cancel'); }, onApply: () => { controller.dispatch('formation.apply'); } } : undefined} transformPreview={controller.transformPreview && controller.transformResult ? { session: controller.transformPreview, result: controller.transformResult, original: activeSet.positions, invalidInput: controller.pendingDraft, onUpdate: options => { controller.dispatch('transform.update', { options }); }, onCancel: () => { controller.dispatch('transform.cancel'); } } : undefined} tool={tool} orientation={controller.preferences.value.fieldOrientation} presentation={{ labelMode: controller.selectionLabelsOnly ? 'selected' : 'all', dotRadiusPx: controller.preferences.value.fieldDotRadiusPx, labelSizePx: controller.preferences.value.fieldLabelSizePx, colorMode: controller.preferences.value.fieldColorMode, customColor: controller.preferences.value.fieldCustomColor }} showLabels={showLabels} showGrid={showGrid} snap={snap} zoom={zoom} onZoom={setZoom} readOnly={readOnly} fitVersion={fitVersion} onNudge={(key, fast) => { controller.dispatch('selection.nudge', { key, fast }); }} nudgeHelp={`Alt+arrows: ${nudgeLabel(controller.preferences.value, project)} · Shift+Alt: ${nudgeLabel(controller.preferences.value, project, true)}`} coordinateFormat={controller.coordinateFormat} /> : <Stage3DLoader project={project} positions={positions} selectedIds={selectedIds} onSelect={setSelectedIds} quality={quality} onQualityChange={setQuality} onReturnTo2D={() => controller.setView('2d')} />}
              <div className="field-bottomline"><span>{view === '2d' ? '' : 'DRAG TO ORBIT · SCROLL TO ZOOM'}</span></div>
              {view === '2d' && reviewing && <div className="neighbor-legend" role="note" aria-label="Neighboring sets">
                {neighbors.map(neighbor => <span key={neighbor.direction} data-neighbor-legend={neighbor.direction}>
                  <svg width="32" height="14" viewBox="0 0 32 14" aria-hidden="true"><path d="M 1 7 H 30" />{neighbor.direction === 'previous' ? <circle cx="8" cy="7" r="4" /> : <path className="neighbor-legend__dot" d="M 8 2 L 13 7 L 8 12 L 3 7 Z" />}</svg>
                  {neighbor.direction === 'previous' ? 'From' : 'To'} set {neighbor.setIndex + 1} · {neighbor.setName}
                </span>)}
                <span className="neighbor-legend__scope">{!neighbors.length ? 'No performers match this review scope.' : <>{neighbors[0].paths.length} {selectedIds.length ? 'selected' : 'performers'}{controller.sectionFilter !== 'all' ? ` · ${project.sections.find(section => section.id === controller.sectionFilter)?.name ?? 'Section filter'}` : ''}</>}</span>
              </div>}
              {children}
            </div>);
}
