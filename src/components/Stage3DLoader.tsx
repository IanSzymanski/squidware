import { Component, lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import type { Stage3DProps } from './Stage3D';
import { HelpButton } from '../editor/ControlHelp';

const LazyStage3D = lazy(() => import('./Stage3D').then(module => ({ default: module.Stage3D })));

class PreviewBoundary extends Component<{ children: ReactNode; onReturnTo2D: () => void; recovery?: Stage3DProps['recovery'] }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    const { recovery } = this.props;
    return this.state.failed ? <div className="stage-three"><div className="stage-three__fallback" role="alert"><strong>3D preview could not load</strong><p>{recovery ? '2D editing continues in the main window. Reload to try again.' : 'Return to the field to keep editing. You can try opening 3D again.'}</p>{recovery ? recovery.actions : <HelpButton title="Return to 2D field" description="Return to the editable field view." onClick={this.props.onReturnTo2D}>Return to 2D field</HelpButton>}</div></div> : this.props.children;
  }
}

export function Stage3DLoader(props: Stage3DProps) {
  return <PreviewBoundary onReturnTo2D={props.onReturnTo2D} recovery={props.recovery}><Suspense fallback={<div className="stage-three"><div className="stage-three__fallback" role="status"><strong>Loading 3D preview…</strong></div></div>}><LazyStage3D {...props} /></Suspense></PreviewBoundary>;
}
