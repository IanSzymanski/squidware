import { describe, expect, it } from 'vitest';
import { placePopoutBounds, POPOUT_SIZE, validatePopoutBounds } from './popoutBounds';

const laptop = { id: 1, workArea: { x: 0, y: 25, width: 1440, height: 875 } };
const monitor = { id: 2, workArea: { x: 1440, y: 0, width: 1920, height: 1040 } };
const inside = (bounds: { x: number; y: number; width: number; height: number }, area: typeof laptop.workArea) =>
  bounds.x >= area.x && bounds.y >= area.y && bounds.x + bounds.width <= area.x + area.width && bounds.y + bounds.height <= area.y + area.height;

describe('3D window bounds', () => {
  it('keeps usable geometry, rounds it and drops anything else without throwing', () => {
    expect(validatePopoutBounds({ x: 1500.4, y: 20, width: 900, height: 560.6, displayId: 2 })).toEqual({ x: 1500, y: 20, width: 900, height: 561, displayId: 2 });
    expect(validatePopoutBounds({ x: -40, y: 0, width: 600, height: 400 })).toEqual({ x: -40, y: 0, width: 600, height: 400 });
    for (const input of [null, undefined, [], 'x', { x: 0, y: 0, width: 0, height: 400 }, { x: NaN, y: 0, width: 600, height: 400 }, { x: 0, y: 0, width: 600, height: 4e6 }, { x: '0', y: 0, width: 600, height: 400 }])
      expect(validatePopoutBounds(input)).toBeNull();
    // An unusable display id alone drops only the id, so the window still reopens where it was.
    for (const displayId of [1.5, '2', NaN, Infinity, null]) expect(validatePopoutBounds({ x: 0, y: 0, width: 600, height: 400, displayId })).toEqual({ x: 0, y: 0, width: 600, height: 400 });
  });
  it('keeps X11 display ids above 2^53 that Electron reports for EDID monitors', () => {
    // Electron 44 on X11 with a Samsung EDID: (manufacturer << 40 | hash << 8 | output), rounded to a double.
    const samsung = 21442280834799420;
    expect(Number.isSafeInteger(samsung)).toBe(false);
    const saved = validatePopoutBounds(JSON.parse(JSON.stringify({ x: 2000, y: 100, width: 900, height: 600, displayId: samsung })));
    expect(saved).toEqual({ x: 2000, y: 100, width: 900, height: 600, displayId: samsung });
    const external = { id: samsung, workArea: { x: 1920, y: 0, width: 2560, height: 1440 } };
    expect(placePopoutBounds(saved, [{ ...laptop, id: 4693420208887612 }, external], 4693420208887612)).toEqual({ x: 2000, y: 100, width: 900, height: 600 });
  });
  it('prefers the display under the saved window when identical monitors share a rounded id', () => {
    const left = { id: 2 ** 54, workArea: { x: 0, y: 0, width: 1920, height: 1080 } }, right = { id: 2 ** 54 + 1, workArea: { x: 1920, y: 0, width: 1920, height: 1080 } };
    expect(left.id).toBe(right.id);
    expect(placePopoutBounds({ x: 2400, y: 200, width: 800, height: 500, displayId: right.id }, [left, right], left.id)).toEqual({ x: 2400, y: 200, width: 800, height: 500 });
    expect(placePopoutBounds({ x: 300, y: 200, width: 800, height: 500, displayId: left.id }, [left, right], left.id)).toEqual({ x: 300, y: 200, width: 800, height: 500 });
    // Off every matching display: the first match still holds the window, clamped onto it.
    expect(placePopoutBounds({ x: 9000, y: 200, width: 800, height: 500, displayId: left.id }, [left, right], left.id)).toEqual({ x: 1120, y: 200, width: 800, height: 500 });
  });
  it('restores saved bounds on the saved display, clamped inside its work area', () => {
    expect(placePopoutBounds({ x: 1600, y: 100, width: 1000, height: 700, displayId: 2 }, [laptop, monitor], 1)).toEqual({ x: 1600, y: 100, width: 1000, height: 700 });
    const offscreen = placePopoutBounds({ x: 5000, y: -900, width: 1000, height: 700, displayId: 2 }, [laptop, monitor], 1)!;
    expect(offscreen).toEqual({ x: 2360, y: 0, width: 1000, height: 700 }); expect(inside(offscreen, monitor.workArea)).toBe(true);
    const oversized = placePopoutBounds({ x: 1500, y: 0, width: 5000, height: 3000, displayId: 2 }, [laptop, monitor], 1)!;
    expect(oversized).toEqual({ x: 1440, y: 0, width: 1920, height: 1040 });
  });
  it('falls back to the centered primary display when the saved display is missing', () => {
    const placed = placePopoutBounds({ x: 1600, y: 100, width: 1000, height: 700, displayId: 2 }, [laptop], 1)!;
    expect(placed).toEqual({ x: 220, y: 113, width: 1000, height: 700 }); expect(inside(placed, laptop.workArea)).toBe(true);
    expect(placePopoutBounds({ x: 1600, y: 100, width: 1000, height: 700, displayId: 9 }, [monitor, laptop], 1)).toEqual({ x: 220, y: 113, width: 1000, height: 700 });
  });
  it('centers the default size on the primary display and shrinks it to small screens', () => {
    expect(placePopoutBounds(null, [laptop, monitor], 2)).toEqual({ x: 1440 + (1920 - POPOUT_SIZE.width) / 2, y: (1040 - POPOUT_SIZE.height) / 2, width: POPOUT_SIZE.width, height: POPOUT_SIZE.height });
    const tiny = { id: 3, workArea: { x: 0, y: 0, width: 400, height: 300 } };
    expect(placePopoutBounds({ x: 0, y: 0, width: 200, height: 100, displayId: 3 }, [tiny], 3)).toEqual({ x: 0, y: 0, width: 400, height: 300 });
    expect(placePopoutBounds(null, [], 1)).toBeNull();
  });
  it('uses the display under an older record without a display id', () => {
    expect(placePopoutBounds({ x: 1700, y: 200, width: 800, height: 500 }, [laptop, monitor], 1)).toEqual({ x: 1700, y: 200, width: 800, height: 500 });
    expect(placePopoutBounds({ x: -3000, y: 200, width: 800, height: 500 }, [laptop, monitor], 1)).toEqual({ x: 320, y: 213, width: 800, height: 500 });
  });
});
