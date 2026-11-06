type FrameWindow = Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'>;
const sources = new Set<FrameWindow>();
/** A visible 3D window keeps playback frames coming while the editor window is minimized or covered (#181). */
export function addFrameSource(view: FrameWindow): () => void {
  sources.add(view);
  return () => { sources.delete(view); };
}
/** Request one frame from the editor window and every added source; the first to paint runs it once. Returns a cancel function. */
export function requestFrame(callback: () => void, primary: FrameWindow = window): () => void {
  let done = false;
  const run = () => { if (done) return; cancel(); callback(); };
  // A closing 3D window can refuse frame calls; the editor window still delivers the frame.
  const handles = [primary, ...sources].flatMap(view => { try { return [[view, view.requestAnimationFrame(run)] as const]; } catch { return []; } });
  function cancel() { done = true; for (const [view, handle] of handles) try { view.cancelAnimationFrame(handle); } catch { /* closed window */ } }
  return cancel;
}
