import { describe, expect, it } from 'vitest';
import { placeTooltip } from './tooltipPlacement';
import type { AnchorRect, Size, TooltipPlacement } from './tooltipPlacement';

const rect = (left: number, top: number, width: number, height: number): AnchorRect => ({ left, top, width, height, right: left + width, bottom: top + height });
const viewport = { width: 1366, height: 768 };
const box = { width: 320, height: 110 };
/** Client-pixel box the panel occupies once its max-height applies. */
const shown = (p: TooltipPlacement, size: Size, scale = 1) => {
  const height = Math.min(size.height, p.maxHeight === undefined ? Infinity : p.maxHeight * scale);
  return { left: p.left * scale, top: p.top * scale, right: p.left * scale + size.width, bottom: p.top * scale + height };
};
const overlaps = (a: { left: number; top: number; right: number; bottom: number }, b: AnchorRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

describe('tooltip placement', () => {
  it('centers below the anchor and clamps to the left and right edges', () => {
    expect(placeTooltip(rect(600, 100, 40, 30), box, viewport)).toEqual({ left: 460, top: 138, side: 'below' });
    expect(placeTooltip(rect(2, 600, 30, 20), { width: 320, height: 100 }, viewport)).toEqual({ left: 8, top: 628, side: 'below' });
    expect(placeTooltip(rect(1350, 100, 14, 14), box, viewport).left).toBe(1366 - 320 - 8);
  });

  it('flips above when below does not fit and keeps the gap from the anchor', () => {
    expect(placeTooltip(rect(600, 720, 40, 30), box, viewport)).toEqual({ left: 460, top: 720 - 8 - 110, side: 'above' });
    expect(placeTooltip(rect(600, 768 - 8 - 8 - 110 - 30, 40, 30), box, viewport).side).toBe('below');
    expect(placeTooltip(rect(600, 768 - 8 - 8 - 110 - 29, 40, 30), box, viewport).side).toBe('above');
  });

  it('uses the roomier side with a max height when neither fits, never covering the anchor', () => {
    const tall = { width: 320, height: 500 };
    const lower = placeTooltip(rect(600, 300, 40, 30), tall, viewport);
    expect(lower).toEqual({ left: 460, top: 338, side: 'below', maxHeight: 768 - 8 - 338 });
    const upper = placeTooltip(rect(600, 420, 40, 30), tall, viewport);
    expect(upper).toEqual({ left: 460, top: 8, side: 'above', maxHeight: 420 - 8 - 8 });
    for (const [p, anchor] of [[lower, rect(600, 300, 40, 30)], [upper, rect(600, 420, 40, 30)]] as const) expect(overlaps(shown(p, tall), anchor)).toBe(false);
  });

  it('moves beside a tall anchor when neither vertical side has a usable height', () => {
    const anchor = rect(100, 40, 200, 690);
    expect(placeTooltip(anchor, box, viewport)).toEqual({ left: 308, top: 40 + (690 - 110) / 2, side: 'right' });
    const right = rect(1000, 40, 300, 690);
    expect(placeTooltip(right, box, viewport)).toEqual({ left: 1000 - 8 - 320, top: 40 + (690 - 110) / 2, side: 'left' });
    // No room on either side: fall back to the roomier vertical side, capped.
    const wide = rect(100, 40, 1200, 690);
    expect(placeTooltip(wide, box, viewport)).toEqual({ left: 100 + (1200 - 320) / 2, top: 8, side: 'above', maxHeight: 24 });
  });

  it('divides client pixels by the UI scale, including max height', () => {
    const scaled = placeTooltip(rect(600, 300, 40, 30), { width: 320, height: 500 }, viewport, { scale: 1.25 });
    expect(scaled.left).toBeCloseTo(460 / 1.25); expect(scaled.top).toBeCloseTo(338 / 1.25); expect(scaled.maxHeight).toBeCloseTo((768 - 8 - 338) / 1.25);
    const plain = placeTooltip(rect(2, 700, 30, 20), box, viewport, { scale: 1.5 });
    expect(plain).toEqual({ left: 8 / 1.5, top: (700 - 8 - 110) / 1.5, side: 'above' });
  });

  it('keeps every panel inside the viewport and off its anchor across edges, sizes and scales', () => {
    const failures: object[] = []; let checked = 0;
    for (const scale of [1, 1.25, 1.5]) for (const view of [viewport, { width: 900, height: 650 }, { width: 600, height: 400 }])
      for (const size of [{ width: 180, height: 60 }, { width: 320, height: 140 }, { width: 320, height: 380 }])
        for (let x = 0; x <= view.width - 24; x += 37) for (let y = 0; y <= view.height - 24; y += 29) {
          const anchor = rect(x, y, 24, 24), r = shown(placeTooltip(anchor, size, view, { scale }), size, scale), e = 1e-9; checked++;
          if (r.left < 8 - e || r.right > view.width - 8 + e || r.top < 8 - e || r.bottom > view.height - 8 + e || overlaps(r, anchor)) failures.push({ scale, view, size, anchor, r });
        }
    expect(failures).toEqual([]); expect(checked).toBeGreaterThan(10000);
  });
});
