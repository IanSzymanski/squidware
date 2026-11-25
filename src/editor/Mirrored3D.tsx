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
  splitReview?: boolean;
  onReturnTo2D?: () => void;
  recovery?: Stage3DProps['recovery'];
}

/** The editor's current scene in 3D: set, playhead, playback, selection, previews and live 2D drags.
 * One component serves the inline 3D view and the separate 3D window (#181), and the split review. */
export function Mirrored3D({ controller, quality, onQualityChange, interactive, splitReview, onReturnTo2D, recovery }: Mirrored3DProps) {
  const camera=useEditorSelector(s=>s.ui.camera),focus=useEditorSelector(s=>s.ui.focusMode);
  const scene = useFieldScene(controller);
  const drafts = useMemo(() => moveDrafts(controller.store), [controller.store]);
  const draft = useSyncExternalStore(drafts.subscribe, drafts.get, drafts.get);
  const editable = scene.atSet && !controller.playing;
  const spatialPreview = controller.pathOperations || controller.movementEditor || controller.routeEditor || controller.selectionPreview
    || controller.formationPreview || controller.spacingPreview || controller.transformPreview || controller.coordinatePreview;
  const canSelect = interactive && (!splitReview || !spatialPreview);
  const positions = useMemo(() => overlayDraft(scene.positions, draft, controller.index, editable), [scene.positions, draft, controller.index, editable]);
  return <Stage3DLoader project={scene.rehearsalProject} facings={scene.facings} staging={scene.staging} cueTiming={scene.sample} positions={positions as Stage3DProps['positions']} selectedIds={controller.selectedIds} onSelect={canSelect ? controller.setSelectedIds : undefined}
    cameraLibrary={interactive && !spatialPreview ? {
      views: controller.project.cameraViews ?? [],
      open: controller.dialog === 'saved-cameras',
      show: () => { void controller.dispatch('dialog.open', { dialog: 'saved-cameras' }); },
      close: () => controller.setDialog(null),
      activate: view => controller.store.setValue('ui', 'camera', current => ({ preset: null, savedId: view.id, version: current.version })),
      save: view => controller.dispatch('view.camera-save', { view }) === true,
      remove: id => controller.dispatch('view.camera-remove', { id }) === true,
    } : undefined}
    activeCamera={interactive ? controller.project.cameraViews?.find(view => view.id === camera.savedId) : undefined}
    cameraRequest={interactive?camera:undefined} splitReview={splitReview} hideCameraPresets={interactive&&!focus&&!splitReview} onCameraPreset={interactive ? preset => {
      const current = controller.store.getState().ui.camera;
      if (current.preset !== preset || current.savedId) controller.store.setValue('ui', 'camera', { preset, version: current.version });
    } : undefined}
    quality={quality} onQualityChange={onQualityChange} onReturnTo2D={onReturnTo2D ?? (() => controller.setView('2d'))} recovery={recovery} />;
}
