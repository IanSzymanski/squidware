type FrameWindow = Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'>;
const sources = new Set<FrameWindow>();
/** A 3D window takes over playback frames once it has painted this many frames, over at least this long, since the
 * editor window last painted one: the editor is minimized, covered or throttled. A merely slow editor keeps the clock. */
export const HANDOVER_FRAMES = 8, EDITOR_STALL_MS = 50;
/** A throttled editor that still paints (about once a second) hands over to a slow 3D window too: after fewer frames over a
 * longer wait, and the 3D window keeps the clock while it paints at least KEEP_FRAMES per throttled editor frame. A heavy
 * show paints the editor more often than this, and a 3D window nearly as slow leaves it the clock. */
export const THROTTLED_FRAMES = 4, KEEP_FRAMES = 2, EDITOR_THROTTLED_MS = 500;
let sourceFrames = 0, sourceDrives = false, editorFrame = -Infinity, sourceRun = -Infinity, looping = false;
/** The 3D window painted enough frames while the editor painted none for this long to take (or keep) the clock. */
const stalled = (wait: number, frames: number) => sourceFrames >= HANDOVER_FRAMES && wait >= EDITOR_STALL_MS || sourceFrames >= frames && wait >= EDITOR_THROTTLED_MS;
/** A visible 3D window keeps playback frames coming while the editor window is minimized or covered (#181). */
export function addFrameSource(view: FrameWindow): () => void {
  sources.add(view);
  return () => { sources.delete(view); };
}
/** Run one playback frame per painted editor frame. Each window paints in its own frame of the same vsync, so the
 * editor window is the clock; an added source runs frames only while the editor has stopped delivering them.
 * Returns a cancel function. */
export function requestFrame(callback: () => void, primary: FrameWindow = window): () => void {
  let done = false; const handles = new Map<FrameWindow, number>();
  // A new frame loop (playback starts or resumes) begins with the editor as the clock: history from before a pause would
  // count the pause as a stalled editor.
  if (!looping) { sourceFrames = 0; sourceDrives = false; editorFrame = performance.now(); }
  // A closing 3D window can refuse frame calls; the editor window still delivers the frame.
  const ask = (view: FrameWindow, frame: () => void) => { try { handles.set(view, view.requestAnimationFrame(frame)); } catch { handles.delete(view); } };
  const run = () => { cancel(); looping = true; try { callback(); } finally { looping = false; } };
  const fromEditor = () => {
    if (done) return;
    const previous = editorFrame; editorFrame = performance.now();
    // Painting at a rate comparable to the 3D window again, the editor takes the clock back; a throttled editor frame does not.
    if (!stalled(editorFrame - previous, KEEP_FRAMES)) sourceDrives = false;
    sourceFrames = 0;
    // While a 3D window drives (or ran since the editor's last frame), the editor paints that result instead of running again.
    if (sourceDrives || sourceRun > previous) ask(primary, fromEditor); else run();
  };
  const fromSource = (view: FrameWindow) => function frame() {
    if (done) return;
    const now = performance.now(); sourceFrames++;
    sourceDrives ||= stalled(now - editorFrame, THROTTLED_FRAMES);
    if (sourceDrives) { sourceRun = now; run(); } else if (sources.has(view)) ask(view, frame);
  };
  ask(primary, fromEditor);
  for (const view of sources) ask(view, fromSource(view));
  function cancel() { done = true; for (const [view, handle] of handles) try { view.cancelAnimationFrame(handle); } catch { /* closed window */ } handles.clear(); }
  return cancel;
}
