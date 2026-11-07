type FrameWindow = Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'>;
const sources = new Set<FrameWindow>();
/** The editor counts as throttled while its smoothed frame interval is at least this long, while it has painted nothing
 * for four smoothed intervals (67 ms at 60 Hz), and after such an interval (a stop) until it paints one shorter than this.
 * Chromium gives a minimized, covered or hidden editor about one frame a second, unevenly, or none. A shown editor
 * painting faster than this keeps the clock however fast a 3D window paints, also through its occasional slow frames:
 * on a slow host a heavy show paints every 250-300 ms with stalls of 700 ms, and filling those in from the 3D window
 * would render both windows more often than the editor paints. One painting slower cannot show smooth playback, and the
 * 3D window can. */
export const EDITOR_THROTTLED_MS = 400;
/** The window whose frame ran the latest playback frame; the editor's latest frame time, its smoothed frame interval
 * (each interval, capped at twice the threshold, moves it a quarter of the way, or half while stopped) and whether it
 * stopped. */
let last: FrameWindow | null = null, editorAt = 0, editorGap = EDITOR_THROTTLED_MS / 4, editorStopped = false, looping = false;
const throttled = (now: number) => editorGap >= EDITOR_THROTTLED_MS || editorStopped || now - editorAt >= 4 * editorGap;
/** A visible 3D window keeps playback frames coming while the editor window is minimized or covered (#181). */
export function addFrameSource(view: FrameWindow): () => void {
  sources.add(view);
  return () => { sources.delete(view); };
}
/** Run one playback frame per painted frame of the clock window (#181). A window's frame runs it only when no other
 * window ran one since that window's previous frame, so two windows painting in the same vsync, or alternately, never
 * run two; a 3D window's frame also needs a throttled editor. The editor is the clock while it paints normally; a 3D
 * window drives at its own rate while the editor is throttled or stopped, through uneven editor frames, and the editor
 * takes the clock back once it paints normally again. With no 3D window this is requestAnimationFrame. Returns a cancel
 * function. */
export function requestFrame(callback: () => void, primary: FrameWindow = window): () => void {
  if (!sources.size) { const handle = primary.requestAnimationFrame(callback); return () => primary.cancelAnimationFrame(handle); }
  // A new loop (play, resume, or a restart after an edit) leaves a driving 3D window driving. If the editor ran the last
  // frame, its silence counts from now, so a pause never looks like a throttled editor.
  if (!looping && !(last && sources.has(last))) editorAt = performance.now();
  let done = false; const handles = new Map<FrameWindow, number>(), waited = new Set<FrameWindow>();
  // A closing 3D window can refuse frame calls; the editor window still delivers the frame.
  const ask = (view: FrameWindow, frame: () => void) => { try { handles.set(view, view.requestAnimationFrame(frame)); } catch { handles.delete(view); } };
  const from = (view: FrameWindow) => function frame() {
    if (done) return;
    if (view !== primary && !sources.has(view)) { handles.delete(view); return; }
    const now = performance.now();
    if (view === primary) {
      const gap = Math.min(now - editorAt, 2 * EDITOR_THROTTLED_MS);
      editorStopped = gap >= 4 * editorGap || editorStopped && gap >= EDITOR_THROTTLED_MS; editorGap += (gap - editorGap) / (editorStopped ? 2 : 4); editorAt = now;
    }
    // No other window ran a frame since this window's previous one: that frame waited in this request, or ran the last.
    const fresh = waited.has(view) || (view === primary ? !(last && sources.has(last)) : last === view);
    if (!fresh || view !== primary && !throttled(now)) { waited.add(view); ask(view, frame); return; }
    cancel(); last = view; looping = true;
    try { callback(); } finally { looping = false; }
  };
  ask(primary, from(primary));
  for (const view of sources) ask(view, from(view));
  function cancel() { done = true; for (const [view, handle] of handles) try { view.cancelAnimationFrame(handle); } catch { /* closed window */ } handles.clear(); }
  return cancel;
}
