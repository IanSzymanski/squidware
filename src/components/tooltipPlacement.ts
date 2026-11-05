/** Client-pixel geometry: getBoundingClientRect and documentElement.clientWidth/Height. */
export interface Size { width: number; height: number }
export interface AnchorRect extends Size { left: number; top: number; right: number; bottom: number }
export type TooltipSide = 'below' | 'above' | 'right' | 'left';
export interface TooltipPlacement { left: number; top: number; side: TooltipSide; maxHeight?: number }
export interface PlacementOptions { margin?: number; gap?: number; scale?: number; minHeight?: number }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/** Places help without leaving the viewport or covering its anchor: centered
 * below, else above, else the roomier vertical side when at least `minHeight`
 * fits there (height capped and scrolled), else beside the anchor, else that
 * capped vertical side anyway. Inputs are client pixels; the result is divided
 * by `scale` because html zoom applies to fixed offsets and max-height after
 * layout. */
export function placeTooltip(anchor: AnchorRect, box: Size, viewport: Size, { margin = 8, gap = 8, scale = 1, minHeight = 64 }: PlacementOptions = {}): TooltipPlacement {
  const result = (left: number, top: number, side: TooltipSide, maxHeight?: number): TooltipPlacement =>
    ({ left: left / scale, top: top / scale, side, ...(maxHeight === undefined ? {} : { maxHeight: Math.max(0, maxHeight) / scale }) });
  const centered = clamp(anchor.left + (anchor.width - box.width) / 2, margin, viewport.width - box.width - margin);
  const roomBelow = viewport.height - margin - anchor.bottom - gap, roomAbove = anchor.top - gap - margin;
  if (box.height <= roomBelow) return result(centered, anchor.bottom + gap, 'below');
  if (box.height <= roomAbove) return result(centered, anchor.top - gap - box.height, 'above');
  const capped = () => roomBelow >= roomAbove ? result(centered, anchor.bottom + gap, 'below', roomBelow) : result(centered, margin, 'above', roomAbove);
  if (Math.max(roomBelow, roomAbove) >= minHeight) return capped();
  const roomRight = viewport.width - margin - anchor.right - gap, roomLeft = anchor.left - gap - margin;
  if (Math.max(roomRight, roomLeft) < box.width) return capped();
  const fullHeight = viewport.height - 2 * margin;
  const top = clamp(anchor.top + (anchor.height - box.height) / 2, margin, viewport.height - box.height - margin);
  return roomRight >= box.width
    ? result(anchor.right + gap, top, 'right', box.height > fullHeight ? fullHeight : undefined)
    : result(anchor.left - gap - box.width, top, 'left', box.height > fullHeight ? fullHeight : undefined);
}
