import { Component, lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import type { Stage3DProps } from './Stage3D';

const LazyStage3D = lazy(() => import('./Stage3D').then(module => ({ default: module.Stage3D })));

class PreviewBoundary extends Component<{ children: ReactNode; onReturnTo2D: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="stage-three"><div className="stage-three__fallback" role="alert"><strong>3D preview could not load</strong><p>Return to the field to keep editing. You can try opening 3D again.</p><button onClick={this.props.onReturnTo2D}>Return to 2D field</button></div></div> : this.props.children;
  }
}

export function Stage3DLoader(props: Stage3DProps) {
  return <PreviewBoundary onReturnTo2D={props.onReturnTo2D}><Suspense fallback={<div className="stage-three"><div className="stage-three__fallback" role="status"><strong>Loading 3D preview…</strong></div></div>}><LazyStage3D {...props} /></Suspense></PreviewBoundary>;
}
