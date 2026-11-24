import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { Stage3D, type PreviewCamera, type RenderStats, type Stage3DQuality } from '../components/Stage3D';
import { Tooltip } from '../components/Tooltip';
import { countToSeconds, sampleProject, secondsToCount, totalCounts } from '../domain';
import { createLegMotionFixture, legMotionFrame, motionScenarios, type MotionScenario, type PreviewCastSize } from './legMotionFixture';
import './legMotionPreview.css';

const cameras = {
  front: { label: 'Front', position: [0, 1.83, 5.2], target: [0, 0.88, 0] },
  side: { label: 'Side', position: [5.2, 1.83, 0], target: [0, 0.88, 0] },
  press: { label: 'Press box', position: [4.7, 6.5, 9], target: [-0.9, 0.45, -0.8] },
  ensemble: { label: 'Whole ensemble', position: [8, 35, 31], target: [-15, 0, -14] },
} satisfies Record<string, PreviewCamera & { label: string }>;
const noSelection: string[] = [];
const noPit: never[] = [];

export function LegMotionPreview() {
  const [scenario, setScenario] = useState<MotionScenario>('forward');
  const [size, setSize] = useState<PreviewCastSize>(64);
  const [view, setView] = useState<keyof typeof cameras>('side');
  const [quality, setQuality] = useState<Stage3DQuality>('lightweight');
  const [animated, setAnimated] = useState(true);
  const [count, setCount] = useState(3.25);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [retry, setRetry] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const currentCount = useRef(count);
  currentCount.current = count;
  const project = useMemo(() => createLegMotionFixture(size, scenario), [size, scenario]);
  const duration = countToSeconds(project, totalCounts(project));
  const markTime = useMemo(() => scenario === 'mark' ? new Set(project.performers.map(({ id }) => id)) : undefined, [scenario, project]);
  const sample = useMemo(() => sampleProject(project, count), [project, count]);
  const authored = scenario === 'choreography';
  const frame = useMemo(() => animated && !authored ? legMotionFrame(project, count, markTime) : undefined, [animated, authored, project, count, markTime]);
  function reportFrame(report: RenderStats) {
    if (stageRef.current) stageRef.current.dataset.stageStats = JSON.stringify(report);
  }

  useEffect(() => {
    if (!playing) return;
    const origin = countToSeconds(project, currentCount.current);
    const start = performance.now();
    let request = requestAnimationFrame(tick);
    function tick(now: number) {
      const seconds = origin + (now - start) * speed / 1000;
      setCount(secondsToCount(project, loop ? seconds % duration : seconds));
      if (loop || seconds < duration) request = requestAnimationFrame(tick);
      else setPlaying(false);
    }
    return () => cancelAnimationFrame(request);
  }, [playing, loop, speed, project, duration]);

  function togglePlayback() {
    if (!playing && count === totalCounts(project)) setCount(0);
    setPlaying(!playing);
  }

  function resetPreview() {
    setAnimated(false);
    setRetry(value => value + 1);
  }

  return <main className="leg-motion-example">
    <header className="leg-motion-example__bar">
      <h1>3D leg motion prototype</h1>
      <label>Motion <select value={scenario} onChange={event => setScenario(event.target.value as MotionScenario)}>
        {Object.entries(motionScenarios).map(([id, motion]) => <option key={id} value={id}>{motion.label}</option>)}
      </select></label>
      <label>Cast <select value={size} onChange={event => setSize(Number(event.target.value) as PreviewCastSize)}>
        <option value={64}>64 performers</option><option value={500}>500 performers</option>
      </select></label>
      <label>Camera view <select value={view} onChange={event => setView(event.target.value as keyof typeof cameras)}>
        {Object.entries(cameras).map(([id, camera]) => <option key={id} value={id}>{camera.label}</option>)}
      </select></label>
      <label>
        <Tooltip name={authored ? 'Animate cues' : 'Animate legs'} description="Turn off articulation to return to the standard static 3D markers.">
          <input type="checkbox" checked={animated} onChange={event => setAnimated(event.target.checked)} />
        </Tooltip>
        {authored ? 'Animate cues' : 'Animate legs'}
      </label>
    </header>
    <div className="leg-motion-example__stage" ref={stageRef}>
      <Stage3D key={retry} project={project} positions={sample.positions} facings={sample.facings} selectedIds={noSelection}
        previewCamera={cameras[view]} legMotion={frame} cueTiming={authored && animated ? sample : undefined}
        assetReview={authored ? { showEquipment: true, pit: noPit, onFrame: reportFrame } : undefined}
        quality={quality} onQualityChange={setQuality} hideCameraPresets onReturnTo2D={resetPreview}
        recovery={{ contextLost: 'The graphics context was interrupted.', unavailable: 'WebGL is required to display the 3D markers.',
          actions: <button className="button subtle" type="button" onClick={resetPreview}>Retry with static markers</button> }} />
    </div>
    <div className="leg-motion-example__bar leg-motion-example__transport" role="group" aria-label="Playback">
      <button className="button primary" type="button" onClick={togglePlayback}>{playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}{playing ? 'Pause' : 'Play'}</button>
      <label>Speed <select value={speed} onChange={event => setSpeed(Number(event.target.value))}>
        <option value={0.25}>0.25×</option><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option>
      </select></label>
      <label><input type="checkbox" checked={loop} onChange={event => setLoop(event.target.checked)} /> Loop</label>
      <label className="leg-motion-example__count">Count
        <input type="range" min="0" max={totalCounts(project)} step="0.125" value={count} onChange={event => {
          setPlaying(false);
          setCount(Number(event.target.value));
        }} />
        <output aria-hidden="true">{count.toFixed(2)}</output>
      </label>
    </div>
  </main>;
}
