import { useState } from 'react';
import { Modal } from '../components/Modal';
import { serializeProject } from '../domain';
import type { EditorController } from './useEditorController';

export function AudioPackagePanel({ controller: c }: { controller: EditorController }) {
  const [mode, setMode] = useState<'bundle' | 'reference'>('bundle');
  const audio = c.portableAudio;
  const projectBytes = new TextEncoder().encode(serializeProject(c.project)).length;
  const estimated = projectBytes + (mode === 'bundle' ? audio.audioSize : 0) + 1024;
  const reason = !window.squidware ? 'Open the desktop app to export a portable package.' : c.audioLoading ? 'Wait for the recording to finish loading.' : !audio.audioToken ? 'Attach a supported recording first.' : c.pendingDraft ? 'Finish or cancel the pending edit first.' : mode === 'reference' && !audio.audioReferenceAvailable ? 'Choose the recording with Attach audio to use a relative reference.' : '';
  return <Modal title="Portable production" onClose={() => c.setDialog(null)}>
    <p className="modal-intro">Transfer the editable drill, sync offset and rehearsal recording in a .squidpack file.</p>
    <label className="form-label">Audio storage<select aria-label="Audio storage" value={mode} disabled={!!c.fileOperation} onChange={e => setMode(e.target.value as typeof mode)}><option value="bundle">Bundle recording in the package</option><option value="reference">Reference recording in the package folder</option></select></label>
    <p>{mode === 'bundle' ? 'The recording travels inside the package. Share it only with the intended recipients.' : 'Choose a destination folder containing the recording. Transfer that folder together; the reference can use subfolders.'}</p>
    <dl className="shortcut-list"><div><dt>Drill</dt><dd>{c.project.title} · {c.project.sets.length} sets</dd></div><div><dt>Recording</dt><dd>{c.audioName || 'None attached'} · {(audio.audioSize / 1048576).toFixed(2)} MiB</dd></div><div><dt>Offset</dt><dd>{c.project.audioOffsetSeconds} seconds</dd></div><div><dt>Estimated package</dt><dd>{(estimated / 1048576).toFixed(2)} MiB</dd></div></dl>
    <p className="microcopy">WAV, MP3, OGG, M4A or FLAC, up to 200 MiB. The final size and relative path appear before export. Files stay local. Plain Save continues to write drill and offset to .squid; export this package again after edits. Recovery retains drill data; keep the package to retain the recording.</p>
    {reason && <p role="status">{reason}</p>}
    <div className="modal-actions"><button className="button subtle" disabled={!!c.fileOperation || c.audioLoading} onClick={() => void c.chooseAudio()}>Attach audio</button><button className="button subtle" disabled={!!c.fileOperation} onClick={() => c.setDialog(null)}>Cancel</button><button className="button primary" disabled={!!reason || !!c.fileOperation} onClick={() => void c.exportPackage(mode)}>{c.fileOperation === 'exporting' ? 'Exporting…' : 'Export package…'}</button></div>
  </Modal>;
}
