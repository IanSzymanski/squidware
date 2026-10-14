import { useMemo, useState } from 'react';

import { ArrowRight, LockKeyhole } from 'lucide-react';

import { setTiming,  sampleProject } from '../domain';
import { Field2D } from '../components/Field2D';
import { Stage3DLoader } from '../components/Stage3DLoader';
import type { Stage3DQuality } from '../components/Stage3D';

import { useEditorSelector } from './react';
import type { EditorController } from './useEditorController';

export function EditorField({ controller }: { controller: EditorController }) {
  const { project, activeSet, view, selectedIds, setSelectedIds, playing, tool, zoom, setZoom, fitVersion, showLabels, showPaths, showGrid, snap, index, atSet, readOnly, selectSet, movePerformers } = controller;
  const count = useEditorSelector(state => state.playback.count);
  const [quality, setQuality] = useState<Stage3DQuality>('detailed');
  const sample = useMemo(() => sampleProject(project, count), [project, count]);
  const positions = atSet && !playing ? activeSet.positions : sample.positions;
  const destination = project.sets[sample.setIndex];
  const displayCount = (value: number) => Number(value.toFixed(1));
  return (<div className={`field-container ${view === '3d' ? 'is-3d' : ''}${readOnly ? ' field-container--preview' : ''}`}><div className="field-topline"><span><span className="live-dot" />{playing ? 'REHEARSING' : readOnly ? 'READ-ONLY PREVIEW' : 'FIELD VIEW'}</span><span>{project.field.preset === 'college' ? 'COLLEGE' : 'HIGH SCHOOL'} · 100 × 53⅓ YD</span></div>
              {readOnly && <div className="field-preview-banner"><LockKeyhole size={17} aria-hidden="true" /><div id="field-preview-message"><strong>{sample.setIndex > 0 && sample.progress < 1 ? `Move ${sample.setIndex} → ${sample.setIndex + 1} · ${destination.name}` : `Set ${sample.setIndex + 1} · ${destination.name}`} · Count {displayCount(count)}{sample.setIndex > 0 && sample.progress < 1 ? ` (${displayCount(sample.localCount)} / ${setTiming(project, sample.setIndex).counts})` : ''}</strong><span>{playing ? 'Playback is running. Stop at a set to edit positions.' : 'Between sets: positions are a preview. Go to a set to edit.'}</span></div><button onClick={() => selectSet(sample.setIndex)}>Go to set {sample.setIndex + 1}<ArrowRight size={14} aria-hidden="true" /></button></div>}
              {view === '2d' ? <Field2D project={project} positions={positions} previousPositions={index > 0 ? project.sets[index - 1].positions : undefined} selectedIds={selectedIds} onSelect={setSelectedIds} onMove={movePerformers} tool={tool} showLabels={showLabels} showPaths={showPaths} showGrid={showGrid} snap={snap} zoom={zoom} onZoom={setZoom} readOnly={readOnly} fitVersion={fitVersion} nudgeStep={controller.preferences.value.nudgeStep} fastNudgeStep={controller.preferences.value.fastNudgeStep} coordinateDecimals={controller.preferences.value.coordinateDecimals} /> : <Stage3DLoader project={project} positions={positions} selectedIds={selectedIds} onSelect={setSelectedIds} quality={quality} onQualityChange={setQuality} onReturnTo2D={() => controller.setView('2d')} />}
              <div className="field-bottomline"><span>{view === '2d' ? '' : 'DRAG TO ORBIT · SCROLL TO ZOOM'}</span></div>
            </div>);
}
