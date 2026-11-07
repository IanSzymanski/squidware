/** Personal geometry of the separate 3D window. The renderer only stores what main reported;
 * main places it on a currently connected display before every open, so it can never open off-screen. */
export interface PopoutBounds { x: number; y: number; width: number; height: number; displayId?: number }
export interface DisplayArea { id: number; workArea: { x: number; y: number; width: number; height: number } }
export const POPOUT_SIZE = { width: 960, height: 600, minWidth: 480, minHeight: 320 } as const;
const LIMIT = 100000;
const finite = (value: unknown, min: number) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= LIMIT;
/** Window geometry is a convenience: anything unusable is dropped (null), never a reason to reject other preferences. */
export function validatePopoutBounds(input: unknown): PopoutBounds | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (!finite(value.x, -LIMIT) || !finite(value.y, -LIMIT) || !finite(value.width, 1) || !finite(value.height, 1)) return null;
  if (value.displayId !== undefined && !(typeof value.displayId === 'number' && Number.isSafeInteger(value.displayId))) return null;
  const [x, y, width, height] = [value.x, value.y, value.width, value.height].map(n => Math.round(n as number));
  return { x, y, width, height, ...(value.displayId === undefined ? {} : { displayId: value.displayId as number }) };
}
/** Restore saved bounds inside the saved display's work area; a missing display (or none saved) centers on the primary display. */
export function placePopoutBounds(saved: PopoutBounds | null, displays: readonly DisplayArea[], primaryId?: number): { x: number; y: number; width: number; height: number } | null {
  const primary = displays.find(display => display.id === primaryId) ?? displays[0];
  if (!primary) return null;
  const center = saved && { x: saved.x + saved.width / 2, y: saved.y + saved.height / 2 };
  const target = !saved ? undefined : saved.displayId !== undefined ? displays.find(display => display.id === saved.displayId)
    : displays.find(({ workArea: a }) => center!.x >= a.x && center!.x < a.x + a.width && center!.y >= a.y && center!.y < a.y + a.height);
  const area = (target ?? primary).workArea;
  const fit = (size: number, min: number, available: number) => Math.round(Math.max(Math.min(min, available), Math.min(size, available)));
  const width = fit(saved?.width ?? POPOUT_SIZE.width, POPOUT_SIZE.minWidth, area.width), height = fit(saved?.height ?? POPOUT_SIZE.height, POPOUT_SIZE.minHeight, area.height);
  const clamp = (value: number, start: number, span: number, size: number) => Math.round(Math.min(Math.max(value, start), start + span - size));
  return saved && target ? { x: clamp(saved.x, area.x, area.width, width), y: clamp(saved.y, area.y, area.height, height), width, height }
    : { x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2), width, height };
}
