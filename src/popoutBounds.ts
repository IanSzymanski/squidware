/** Personal geometry of the separate 3D window. The renderer only stores what main reported;
 * main places it on a currently connected display before every open, so it can never open off-screen. */
export interface PopoutBounds { x: number; y: number; width: number; height: number; displayId?: number }
export interface DisplayArea { id: number; workArea: { x: number; y: number; width: number; height: number } }
export const POPOUT_SIZE = { width: 960, height: 600, minWidth: 480, minHeight: 320 } as const;
const LIMIT = 100000;
const finite = (value: unknown, min: number) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= LIMIT;
/** Electron reports a display's int64 id as a double, so ids above 2^53 (X11 ids derived from a monitor's EDID) are
 * integers but not safe ones. Main compares the same rounded doubles, so any integer is a usable id. */
export const isDisplayId = (value: unknown): value is number => Number.isInteger(value);
/** Window geometry is a convenience: anything unusable is dropped (null), never a reason to reject other preferences.
 * An unusable display id alone drops only the id; placement then uses the display under the window. */
export function validatePopoutBounds(input: unknown): PopoutBounds | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (!finite(value.x, -LIMIT) || !finite(value.y, -LIMIT) || !finite(value.width, 1) || !finite(value.height, 1)) return null;
  const [x, y, width, height] = [value.x, value.y, value.width, value.height].map(n => Math.round(n as number));
  return { x, y, width, height, ...(isDisplayId(value.displayId) ? { displayId: value.displayId } : {}) };
}
/** Restore saved bounds inside the saved display's work area; a missing display (or none saved) centers on the primary display. */
export function placePopoutBounds(saved: PopoutBounds | null, displays: readonly DisplayArea[], primaryId?: number): { x: number; y: number; width: number; height: number } | null {
  const primary = displays.find(display => display.id === primaryId) ?? displays[0];
  if (!primary) return null;
  const center = saved && { x: saved.x + saved.width / 2, y: saved.y + saved.height / 2 };
  const under = ({ workArea: a }: DisplayArea) => center!.x >= a.x && center!.x < a.x + a.width && center!.y >= a.y && center!.y < a.y + a.height;
  // Rounded large ids can collide for identical monitors; prefer the one under the saved window.
  const matching = saved?.displayId === undefined ? [] : displays.filter(display => display.id === saved.displayId);
  const target = !saved ? undefined : saved.displayId !== undefined ? matching.find(under) ?? matching[0] : displays.find(under);
  const area = (target ?? primary).workArea;
  const fit = (size: number, min: number, available: number) => Math.round(Math.max(Math.min(min, available), Math.min(size, available)));
  const width = fit(saved?.width ?? POPOUT_SIZE.width, POPOUT_SIZE.minWidth, area.width), height = fit(saved?.height ?? POPOUT_SIZE.height, POPOUT_SIZE.minHeight, area.height);
  const clamp = (value: number, start: number, span: number, size: number) => Math.round(Math.min(Math.max(value, start), start + span - size));
  return saved && target ? { x: clamp(saved.x, area.x, area.width, width), y: clamp(saved.y, area.y, area.height, height), width, height }
    : { x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2), width, height };
}
