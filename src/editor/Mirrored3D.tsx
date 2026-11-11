import { useMemo, useSyncExternalStore } from 'react';
import { Stage3DLoader } from '../components/Stage3DLoader';
import type { Stage3DProps, Stage3DQuality } from '../components/Stage3D';
import { moveDrafts, overlayDraft, useFieldScene } from './mirroredScene';
import type { EditorController } from './useEditorController';
import { useEditorSelector } from './react';

export interface Mirrored3DProps {
  controller: EditorController;
  quality: Stage3DQuality;
  onQualityChange: (quality: Stage3DQuality) => void;
  /** The inline view selects on click; the separate 3D window is read-only. */
  interactive: boolean;
  recovery?: Stage3DProps['recovery'];
}

/** The editor's current scene in 3D: set, playhead, playback, selection, previews and live 2D drags.
 * One component serves the inline 3D view and the separate 3D window (#181), and later a split view (#41). */
export function Mirrored3D({ controller, quality, onQualityChange, interactive, recovery }: Mirrored3DProps) {
  const camera=useEditorSelector(s=>s.ui.camera),focus=useEditorSelector(s=>s.ui.focusMode);
  const scene = useFieldScene(controller);
  const drafts = useMemo(() => moveDrafts(controller.store), [controller.store]);
  const draft = useSyncExternalStore(drafts.subscribe, drafts.get, drafts.get);
  const editable = scene.atSet && !controller.playing;
  const positions = useMemo(() => overlayDraft(scene.positions, draft, controller.index, editable), [scene.positions, draft, controller.index, editable]);
  return <Stage3DLoader project={scene.rehearsalProject} positions={positions as Stage3DProps['positions']} selectedIds={controller.selectedIds} onSelect={interactive ? controller.setSelectedIds : undefined}
    cameraRequest={interactive?camera:undefined} hideCameraPresets={interactive&&!focus} onCameraPreset={interactive?preset=>{const current=controller.store.getState().ui.camera;if(current.preset!==preset)controller.store.setValue('ui','camera',{...current,preset});}:undefined}
    quality={quality} onQualityChange={onQualityChange} onReturnTo2D={() => controller.setView('2d')} recovery={recovery} />;
}
