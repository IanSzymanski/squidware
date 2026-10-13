import { useMemo } from 'react';

import { ArrowRight } from 'lucide-react';

import { sampleProject } from '../domain';
import { Field2D } from '../components/Field2D';
import { Stage3D } from '../components/Stage3D';

import { useEditorSelector } from './react';
import type { EditorController } from './useEditorController';

export function EditorField({ controller }: { controller: EditorController }) {
  const { project, activeSet, view, selectedIds, setSelectedIds, playing, tool, zoom, setZoom, fitVersion, showLabels, showPaths, showGrid, snap, index, atSet, readOnly, selectSet, movePerformers } = controller;
  const count = useEditorSelector(state => state.playback.count);
  const positions = useMemo(() => atSet && !playing ? activeSet.positions : sampleProject(project, count).positions, [project, count, atSet, playing, activeSet]);
  return (<div className={`field-container ${view === '3d' ? 'is-3d' : ''}`}><div className="field-topline"><span><span className="live-dot" />{playing ? 'REHEARSING' : 'FIELD VIEW'}</span><span>{project.field.preset === 'college' ? 'COLLEGE' : 'HIGH SCHOOL'} · 100 × 53⅓ YD</span></div>
              {view === '2d' ? <Field2D project={project} positions={positions} previousPositions={index > 0 ? project.sets[index - 1].positions : undefined} selectedIds={selectedIds} onSelect={setSelectedIds} onMove={movePerformers} tool={tool} showLabels={showLabels} showPaths={showPaths} showGrid={showGrid} snap={snap} zoom={zoom} onZoom={setZoom} readOnly={readOnly} fitVersion={fitVersion} /> : <Stage3D project={project} positions={positions} selectedIds={selectedIds} onSelect={setSelectedIds} />}
              <div className="field-bottomline"><span>{view === '2d' ? '' : 'DRAG TO ORBIT · SCROLL TO ZOOM'}</span>{!playing && !atSet && <button onClick={() => selectSet(index)}>Return to set to edit <ArrowRight size={12} /></button>}</div>
            </div>);
}
