import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage3D, type PreviewCamera, type RenderStats, type Stage3DQuality } from '../components/Stage3D';
import { frontEnsembleModels, type AssetPlacement } from '../components/3d/assetModels';
import { createBlankProject, sampleProject } from '../domain';
import { guardCatalog, instrumentCatalog, type CarriedEquipment } from '../equipment';
import { frontEnsembleCatalog, type FrontEnsembleModel } from '../frontEnsemble';
import type { Project } from '../types';
import { createLegMotionFixture } from './legMotionFixture';
import './legMotionPreview.css';

const carriedCatalog = { ...instrumentCatalog, ...guardCatalog };
const carriedIds = Object.keys(carriedCatalog) as CarriedEquipment[];
const emptyPit: AssetPlacement[] = [];
const selection: string[] = [];
const modes = { carried: 'Carried equipment', pit: 'Front ensemble', mixed: 'Mixed cast · 64', stress: 'Stress cast · 500' };
type Mode = keyof typeof modes;

const viewNames = { front: 'Front', side: 'Side', press: 'Press box', overhead: 'Overhead' };
type View = keyof typeof viewNames;
const itemViews: Record<View, PreviewCamera> = {
  front: { position: [0, 1.5, 3.6], target: [.12, 1.21, .18] },
  side: { position: [3.35, 1.6, .28], target: [0, 1.17, .32] },
  press: { position: [1.75, 2.63, 3.8], target: [.10, 1.14, .25] },
  overhead: { position: [0, 4.45, .011], target: [0, .15, 0] },
};
const pitViews: Record<View, PreviewCamera> = {
  front: { position: [0, 1.66, 3.7], target: [0, .63, 0] },
  side: { position: [3.52, 1.72, .45], target: [0, .63, 0] },
  press: { position: [1.75, 2.38, 3.8], target: [0, .63, 0] },
  overhead: itemViews.overhead,
};
const ensembleViews: Record<View, PreviewCamera> = {
  front: { position: [0, 32, 113], target: [0, 0, 0] },
  side: { position: [108, 38, 6], target: [0, 0, 0] },
  press: { position: [18, 68, 94], target: [0, 0, 0] },
  overhead: { position: [0, 95, .01], target: [0, 0, 0] },
};

function singleProject(equipment?: CarriedEquipment): Project {
  const project = createBlankProject();
  if (!equipment) return project;
  return {
    ...project,
    sections: project.sections.map((section, i) => i === 0 ? { ...section, color: '#7396ad' } : section),
    performers: [{ id: 'model', name: carriedCatalog[equipment], label: '1', sectionId: project.sections[0].id, appearance: { equipment } }],
    sets: [{ ...project.sets[0], facings: { model: 0 }, positions: { model: { x: project.field.width / 2, y: project.field.height / 2 } } }],
  };
}

function ensembleProject(size: 64 | 500): Project {
  const project = createLegMotionFixture(size, 'forward');
  return {
    ...project,
    performers: project.performers.map((person, index) => ({ ...person, appearance: { equipment: carriedIds[index % carriedIds.length] } })),
    sets: project.sets.map((set, index) => ({
      ...set,
      facings: Object.fromEntries(project.performers.map(({ id }, performer) => [id, (performer % 4) * 45 + index * 96])),
    })),
  };
}

export function AssetPreview() {
  const [mode, setMode] = useState<Mode>('carried');
  const [equipment, setEquipment] = useState<CarriedEquipment>('trumpet');
  const [pitItem, setPitItem] = useState<FrontEnsembleModel>('marimba');
  const [view, setView] = useState<View>('front');
  const [quality, setQuality] = useState<Stage3DQuality>('lightweight');
  const [showEquipment, setShowEquipment] = useState(true);
  const [showPit, setShowPit] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [count, setCount] = useState(0);
  const [mounted, setMounted] = useState(true);
  const stats = useRef<HTMLDivElement>(null);
  const currentCount = useRef(count);
  currentCount.current = count;
  const project = useMemo(() => {
    if (mode === 'stress') return ensembleProject(500);
    if (mode === 'mixed') return ensembleProject(64);
    return singleProject(mode === 'carried' ? equipment : undefined);
  }, [mode, equipment]);
  const ensemble = mode === 'mixed' || mode === 'stress';
  const sample = useMemo(() => sampleProject(project, count), [project, count]);
  const pit = useMemo(() => {
    if (mode === 'pit') return [{ parts: frontEnsembleModels[pitItem], at: [0, 0, 0] } satisfies AssetPlacement];
    if (!ensemble || !showPit) return emptyPit;
    return Object.values(frontEnsembleModels).map((parts, i): AssetPlacement => ({
      parts, at: [(i - 2.5) * 3, 0, project.field.height / 2 + 1.65],
    }));
  }, [mode, ensemble, pitItem, project.field.height, showPit]);

  useEffect(() => {
    if (!playing || !ensemble || !mounted) return;
    const start = performance.now() - currentCount.current * 500;
    let frame = requestAnimationFrame(tick);
    function tick(now: number) {
      setCount(((now - start) / 500) % 8);
      frame = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(frame);
  }, [playing, ensemble, mounted]);

  function onFrame(report: RenderStats) {
    if (stats.current) {
      stats.current.dataset.stageStats = JSON.stringify(report);
      stats.current.dataset.frames = String(Number(stats.current.dataset.frames ?? 0) + 1);
    }
  }

  return <main className="leg-motion-example">
    <header className="leg-motion-example__bar">
      <h1>3D asset preview</h1>
      <label>Scene <select value={mode} onChange={event => {
        setPlaying(false);
        setCount(0);
        setMode(event.target.value as Mode);
      }}>
        {Object.entries(modes).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select></label>
      {mode === 'carried' && <label>Equipment <select value={equipment} onChange={event => setEquipment(event.target.value as CarriedEquipment)}>
        {Object.entries(carriedCatalog).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select></label>}
      {mode === 'pit' && <label>Equipment <select value={pitItem} onChange={event => setPitItem(event.target.value as FrontEnsembleModel)}>
        {Object.entries(frontEnsembleCatalog).map(([key, { name }]) => <option key={key} value={key}>{name}</option>)}
      </select></label>}
      <label>Camera view <select value={view} onChange={event => setView(event.target.value as View)}>
        {Object.entries(viewNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select></label>
      <label><input type="checkbox" checked={showEquipment} onChange={event => setShowEquipment(event.target.checked)} /> Equipment models</label>
      {ensemble && <label><input type="checkbox" checked={showPit} onChange={event => setShowPit(event.target.checked)} /> Front ensemble</label>}
    </header>
    <div className="leg-motion-example__stage" ref={stats}>
      {mounted && <Stage3D project={project} positions={sample.positions} facings={sample.facings} selectedIds={selection}
        previewCamera={(ensemble ? ensembleViews : mode === 'pit' ? pitViews : itemViews)[view]}
        assetReview={{ showEquipment, pit, onFrame }} quality={quality} onQualityChange={setQuality}
        hideCameraPresets onReturnTo2D={() => setMounted(false)}
        recovery={{ contextLost: 'The graphics context was interrupted.', unavailable: 'WebGL is required to display the equipment.',
          actions: <button type="button" className="button subtle" onClick={() => setMounted(false)}>Close 3D</button> }} />}
    </div>
    <div className="leg-motion-example__bar leg-motion-example__transport" role="group" aria-label="Playback">
      <button type="button" className="button subtle" onClick={() => setMounted(!mounted)}>{mounted ? 'Close 3D' : 'Open 3D'}</button>
      {ensemble && <><button type="button" className="button primary" onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button>
        <label className="leg-motion-example__count">Count
          <input type="range" min="0" max="8" step="0.125" value={count} onChange={event => {
            setPlaying(false);
            setCount(Number(event.target.value));
          }} />
          <output aria-hidden="true">{count.toFixed(2)}</output>
        </label></>}
    </div>
  </main>;
}
