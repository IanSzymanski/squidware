/** Coalesce invalidations and continue only while camera damping needs another frame. */
export function createDemandFrames(render: () => boolean, onError: (error: unknown) => void) {
  let frame: number | null = null;
  let disposed = false;
  function invalidate() {
    if (disposed || frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (disposed) return;
      try { if (render()) invalidate(); }
      catch (error) { dispose(); onError(error); }
    });
  }
  function dispose() {
    disposed = true;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  }
  return { invalidate, dispose };
}
