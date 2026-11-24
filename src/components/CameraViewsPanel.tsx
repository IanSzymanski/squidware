import { useState } from 'react';
import { CAMERA_VIEW_LIMITS, type CameraView, type SavedCameraView } from '../cameraViews';
import { uid } from '../domain';
import { Modal } from './Modal';

export interface CameraLibrary {
  views: readonly SavedCameraView[];
  open: boolean;
  show: () => void;
  close: () => void;
  activate: (view: SavedCameraView) => void;
  save: (view: SavedCameraView) => boolean;
  remove: (id: string) => boolean;
}

export function CameraViewsPanel({ library, current, onApply, onClose }: {
  library: CameraLibrary;
  current: CameraView;
  onApply: (view: SavedCameraView) => void;
  onClose: () => void;
}) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const selected = library.views.find(view => view.id === id);
  function save() {
    const viewName = name.trim();
    if (library.views.some(view => view.id !== selected?.id && view.name.toLowerCase() === viewName.toLowerCase())) {
      setError('A camera with this name already exists.');
      return;
    }
    const next = { ...(selected ?? current), id: selected?.id ?? uid(), name: viewName };
    if (library.save(next)) onClose();
    else setError('The camera could not be saved. Pause playback or finish the current edit.');
  }
  return <Modal title="Saved camera views" onClose={onClose}>
    <label className="form-label">Camera view<select data-autofocus value={selected?.id ?? ''} onChange={event => {
      const next = library.views.find(view => view.id === event.currentTarget.value);
      setId(next?.id ?? '');
      setName(next?.name ?? '');
      setError('');
    }}><option value="">Current angle · new view</option>{library.views.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}</select></label>
    <form onSubmit={event => { event.preventDefault(); save(); }}>
      <label className="form-label">View name<input value={name} maxLength={CAMERA_VIEW_LIMITS.name} onChange={event => setName(event.currentTarget.value)} /></label>
      {error && <p role="alert">{error}</p>}
      {!selected && library.views.length >= CAMERA_VIEW_LIMITS.count && <p>Delete a view to save another. This production has 32 saved views.</p>}
      <div className="modal-actions">
        {selected && <button type="button" className="button subtle" onClick={() => {
          if (library.remove(selected.id)) onClose();
          else setError('The camera could not be deleted. Pause playback or finish the current edit.');
        }}>Delete view</button>}
        {selected && <button type="button" className="button subtle" onClick={() => { onApply(selected); onClose(); }}>Use view</button>}
        <button type="submit" className="button primary" disabled={!name.trim() || (selected ? name.trim() === selected.name : library.views.length >= CAMERA_VIEW_LIMITS.count)}>
          {selected ? 'Rename view' : 'Save current angle'}
        </button>
      </div>
    </form>
  </Modal>;
}
