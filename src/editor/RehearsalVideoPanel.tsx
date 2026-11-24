import { useEffect, useRef, useState } from 'react';
import { Modal } from '../components/Modal';
import { Stage3D, type Stage3DQuality, type StageCapture } from '../components/Stage3D';
import { renderRehearsalVideo, VIDEO_FRAME_RATES, VIDEO_LIMITS, VIDEO_RESOLUTIONS, videoTiming } from '../rehearsalVideo';
import type { EditorController } from './useEditorController';

const emptySelection: string[] = [];
const noAction = () => {};

export default function RehearsalVideoPanel({ controller }: { controller: EditorController }) {
  const { project, recording, setDialog } = controller;
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(project.sets.length - 1);
  const [cameraId, setCameraId] = useState('');
  const [resolution, setResolution] = useState<keyof typeof VIDEO_RESOLUTIONS>('720p');
  const [fps, setFps] = useState<typeof VIDEO_FRAME_RATES[number]>(24);
  const [quality, setQuality] = useState<Stage3DQuality>('lightweight');
  const [includeAudio, setIncludeAudio] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [capture, setCapture] = useState<StageCapture | null>(null);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [saving, setSaving] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  const timing = videoTiming(project, from, to, fps);
  const tooLong = timing.duration > VIDEO_LIMITS.seconds;
  const canRender = timing.duration > 0 && !tooLong;
  const camera = project.cameraViews?.find(view => view.id === cameraId);
  const busy = !!capture || saving;

  function cancelOrClose() {
    if (active.current) active.current.abort();
    else if (!saving) setDialog(null);
  }

  async function render() {
    if (!canRender || active.current || saving) return;
    setError(''); setNotice(''); setBytes(null); setProgress(0);
    const abort = new AbortController();
    active.current = abort;
    const source = includeAudio ? recording.current ?? undefined : undefined;
    let cancelReady = noAction;
    try {
      const draw = await new Promise<Parameters<StageCapture['ready']>[0]>((ready, reject) => {
        cancelReady = () => reject(abort.signal.reason);
        abort.signal.addEventListener('abort', cancelReady, { once: true });
        const { width, height } = VIDEO_RESOLUTIONS[resolution];
        setCapture({ width, height, camera, ready, failed: cause => abort.abort(cause) });
      });
      const result = await renderRehearsalVideo({ project, timing, resolution, fps, recording: source, draw,
        signal: abort.signal, onProgress: setProgress });
      setBytes(result);
      setNotice('Video ready to save.');
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') setNotice('Video export canceled.');
      else setError(cause instanceof Error ? cause.message : 'The video could not be rendered.');
    } finally {
      abort.signal.removeEventListener('abort', cancelReady);
      active.current = null;
      setCapture(null);
    }
  }

  async function save() {
    if (!bytes || saving) return;
    setError(''); setSaving(true);
    try {
      if (await controller.saveVideo(bytes, project.title)) setDialog(null);
      else setNotice('Save canceled. The rendered video is still ready to save.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The video could not be saved.');
    } finally { setSaving(false); }
  }

  const setOptions = project.sets.map((set, index) => <option key={set.id} value={index}>Set {index + 1} · {set.name}</option>);
  return <Modal title="Rehearsal video" onClose={cancelOrClose}>
    <p className="modal-intro">Export a 3D view of the full cast as a WebM video.</p>
    <fieldset disabled={busy} onChange={() => { setBytes(null); setNotice(''); setError(''); }} className="video-export-options">
      <div className="form-row">
        <label className="form-label">Start set<select value={from} onChange={event => setFrom(Number(event.currentTarget.value))}>{setOptions}</select></label>
        <label className="form-label">End set<select value={to} onChange={event => setTo(Number(event.currentTarget.value))}>{setOptions}</select></label>
      </div>
      <label className="form-label">Camera view<select value={camera?.id ?? ''} onChange={event => setCameraId(event.currentTarget.value)}>
        <option value="">Perspective · fit to field</option>
        {project.cameraViews?.map(view => <option value={view.id} key={view.id}>{view.name}</option>)}
      </select></label>
      <div className="form-row">
        <label className="form-label">Resolution<select value={resolution} onChange={event => setResolution(event.currentTarget.value as typeof resolution)}>
          {Object.keys(VIDEO_RESOLUTIONS).map(key => <option key={key}>{key}</option>)}
        </select></label>
        <label className="form-label">Frame rate<select value={fps} onChange={event => setFps(Number(event.currentTarget.value) as typeof fps)}>
          {VIDEO_FRAME_RATES.map(rate => <option value={rate} key={rate}>{rate} fps</option>)}
        </select></label>
      </div>
      <label className="form-label">Rendering quality<select value={quality} onChange={event => setQuality(event.currentTarget.value as Stage3DQuality)}>
        <option value="lightweight">Lightweight · no shadows</option><option value="detailed">Detailed · equipment and shadows</option>
      </select></label>
      <label className="video-export-audio"><input type="checkbox" checked={includeAudio} disabled={!recording.current || controller.audioLoading}
        onChange={event => setIncludeAudio(event.currentTarget.checked)} /> Include attached recording</label>
      {includeAudio && <p className="microcopy">The recording will be embedded in the video. Share it only with its intended recipients.</p>}
    </fieldset>
    <p className="microcopy" aria-live="polite">{tooLong ? `This range is ${Math.ceil(timing.duration)} seconds. Choose up to ${VIDEO_LIMITS.seconds} seconds.`
      : canRender ? `${timing.duration.toFixed(1)} seconds of drill · ${timing.frames} frames` : 'Choose an end set after the start set.'}</p>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {capture && <>
      <label className="form-label video-export-progress">Rendering video<progress value={progress} max={timing.frames} /></label>
      <Stage3D project={project} positions={project.sets[0].positions} selectedIds={emptySelection} quality={quality} onQualityChange={noAction} onReturnTo2D={noAction} capture={capture} />
    </>}
    <div className="modal-actions">
      {capture ? <button className="button subtle" onClick={cancelOrClose}>Cancel export</button> :
        <button className="button subtle" disabled={saving} onClick={() => setDialog('export')}>Back to Export</button>}
      {bytes ? <button className="button primary" disabled={busy} onClick={() => void save()}>{saving ? 'Saving…' : 'Save WebM'}</button> :
        <button className="button primary" disabled={busy || !canRender} onClick={() => void render()}>Render video</button>}
    </div>
  </Modal>;
}
