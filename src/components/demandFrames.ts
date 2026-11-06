/** The window whose compositor draws the canvas: the editor's, or the separate 3D window's. */
export interface FrameHost {
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
  document: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
}
/** Coalesce invalidations and continue only while camera damping needs another frame.
 * With a host, frames use that window's clock and wait while its document is hidden or minimized. */
export function createDemandFrames(render: () => boolean, onError: (error: unknown) => void, host?: FrameHost) {
  let frame: number | null = null;
  let disposed = false;
  let deferred = false;
  const hidden = () => host?.document.visibilityState === 'hidden';
  const request = (callback: FrameRequestCallback) => host ? host.requestAnimationFrame(callback) : requestAnimationFrame(callback);
  const cancel = (handle: number) => host ? host.cancelAnimationFrame(handle) : cancelAnimationFrame(handle);
  function invalidate() {
    if (disposed || frame !== null) return;
    if (hidden()) { deferred = true; return; }
    frame = request(() => {
      frame = null;
      if (disposed) return;
      try { if (render()) invalidate(); }
      catch (error) { dispose(); onError(error); }
    });
  }
  function visibility() {
    if (hidden()) { if (frame !== null) { cancel(frame); frame = null; deferred = true; } }
    else if (deferred) { deferred = false; invalidate(); }
  }
  host?.document.addEventListener('visibilitychange', visibility);
  function dispose() {
    disposed = true;
    if (frame !== null) cancel(frame);
    frame = null;
    host?.document.removeEventListener('visibilitychange', visibility);
  }
  return { invalidate, dispose };
}
