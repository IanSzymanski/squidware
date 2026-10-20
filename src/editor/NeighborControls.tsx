import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { Button } from './EditorControls';
import type { EditorController } from './useEditorController';

export function NeighborControls({ controller: c }: { controller: EditorController }) {
  const common = c.view !== '2d' ? 'Switch to 2D to review neighboring sets.' : c.readOnly ? 'Pause playback and return to a set to review its neighbors.' : '';
  return <>
    <Button command="display.paths" title="Show paths from previous set" description="Show the previous set as hollow circles with dashed incoming paths. Uses the selected performers and current section filter." active={c.showPaths} disabled={!!common || c.index === 0} disabledReason={common || 'The opening set has no previous set.'} onClick={() => c.dispatch('display.paths')}><ArrowDownLeft size={17} /></Button>
    <Button title="Show paths to next set" description="Show the next set as hollow diamonds with dotted outgoing paths. Uses the selected performers and current section filter." active={c.showNextPaths} disabled={!!common || c.index === c.project.sets.length - 1} disabledReason={common || 'The final set has no next set.'} onClick={() => c.setShowNextPaths(!c.showNextPaths)}><ArrowUpRight size={17} /></Button>
  </>;
}
