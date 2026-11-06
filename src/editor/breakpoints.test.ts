import { describe, expect, it } from 'vitest';
import { BREAKPOINTS, FIELD_MIN, FIELD_RESERVE, effectiveViewport, workspaceBreakpoints } from './breakpoints';
import { fitWorkspaceLayout, paneLimits, workspacePreset } from '../workspaceLayout';

/** The issue's screenshot matrix: window sizes × UI scales, through the same fit the workspace renders. */
function resolve(width: number, height: number, scale: number, layout = workspacePreset('write')) {
  const viewport = effectiveViewport(width, height, scale);
  const fit = fitWorkspaceLayout(layout, viewport.width, 'inspector');
  const main = viewport.width - (fit.setsHidden ? 30 : fit.widths.sets + 6) - (fit.sideHidden ? 30 : fit.widths.inspector + 6);
  return { viewport, fit, main, ...workspaceBreakpoints(viewport, main) };
}

describe('UI-scale-aware breakpoints', () => {
  it('divides window pixels by the UI scale and ignores an invalid scale', () => {
    expect(effectiveViewport(1366, 768, 1.5)).toEqual({ width: 1366 / 1.5, height: 512 });
    for (const scale of [0, -1, NaN, Infinity]) expect(effectiveViewport(900, 650, scale)).toEqual({ width: 900, height: 650 });
  });
  it('orders thresholds so the header and transport degrade one step at a time', () => {
    expect(BREAKPOINTS.headerNarrow).toBeLessThan(BREAKPOINTS.headerCompact);
    expect(BREAKPOINTS.transportNarrow).toBeLessThan(BREAKPOINTS.transportCompact);
    expect(FIELD_RESERVE).toBe(FIELD_MIN.width + 24);
    expect(workspaceBreakpoints({ width: BREAKPOINTS.headerCompact, height: BREAKPOINTS.short }).header).toBe('full');
    expect(workspaceBreakpoints({ width: BREAKPOINTS.headerCompact - 1, height: BREAKPOINTS.short }).header).toBe('compact');
    expect(workspaceBreakpoints({ width: BREAKPOINTS.headerNarrow - 1, height: BREAKPOINTS.short - 1 }, BREAKPOINTS.transportNarrow - 1)).toMatchObject({ header: 'narrow', transport: 'narrow', short: true });
    expect(workspaceBreakpoints({ width: 1920, height: 1080 }, BREAKPOINTS.transportCompact - 1).transport).toBe('compact');
  });
  it('resolves the 900–1920 px × 100–150% matrix from effective pixels, not raw window pixels', () => {
    const expected: Record<string, [string, string, boolean, boolean, boolean]> = {
      // header, transport, short, set list tucked, Inspector tucked
      '900x650@1': ['compact', 'compact', false, true, false], '900x650@1.25': ['narrow', 'compact', true, true, true], '900x650@1.5': ['narrow', 'compact', true, true, true],
      '1024x700@1': ['compact', 'compact', false, false, false], '1024x700@1.25': ['compact', 'compact', true, true, false], '1024x700@1.5': ['narrow', 'compact', true, true, true],
      '1366x768@1': ['full', 'full', false, false, false], '1366x768@1.25': ['compact', 'compact', true, false, false], '1366x768@1.5': ['compact', 'compact', true, true, false],
      '1920x1080@1': ['full', 'full', false, false, false], '1920x1080@1.25': ['full', 'full', false, false, false], '1920x1080@1.5': ['full', 'compact', false, false, false],
    };
    for (const [key, tiers] of Object.entries(expected)) {
      const [size, scale] = key.split('@'); const [width, height] = size.split('x').map(Number);
      const r = resolve(width, height, Number(scale));
      expect([r.header, r.transport, r.short, r.fit.setsHidden, r.fit.sideHidden], key).toEqual(tiers);
      // Whenever a panel stays docked, the field keeps its reserve; with both tucked it takes everything left.
      if (!r.fit.setsHidden || !r.fit.sideHidden) expect(r.main, key).toBeGreaterThanOrEqual(FIELD_RESERVE);
      else expect(r.main, key).toBe(r.viewport.width - 60);
    }
  });
  it('favors the field over panel widths, tucks the set list first and restores saved widths when space returns', () => {
    const layout = { ...workspacePreset('write'), setsWidth: 300, inspectorWidth: 400 };
    const before = structuredClone(layout);
    // Wide: saved widths. Slightly short: panels shrink toward their minimums before anything tucks.
    expect(fitWorkspaceLayout(layout, 1500, 'inspector')).toEqual({ widths: { sets: 300, inspector: 400, cast: 300 }, setsHidden: false, sideHidden: false });
    const shrunk = fitWorkspaceLayout(layout, 1100, 'inspector');
    expect(shrunk).toMatchObject({ setsHidden: false, sideHidden: false });
    expect(shrunk.widths.sets).toBe(paneLimits.sets[0]); expect(1100 - shrunk.widths.sets - 6 - shrunk.widths.inspector - 6).toBe(FIELD_RESERVE);
    // Tucking the set list returns the Inspector to its saved width rather than leaving it squeezed.
    const write = { ...layout, inspectorWidth: 258 };
    expect(fitWorkspaceLayout(write, 940, 'inspector')).toEqual({ widths: { sets: 300, inspector: 258, cast: 300 }, setsHidden: true, sideHidden: false });
    expect(fitWorkspaceLayout(layout, 700, 'inspector')).toMatchObject({ setsHidden: true, sideHidden: true });
    expect(fitWorkspaceLayout(layout, 1500, 'inspector')).toMatchObject({ setsHidden: false, sideHidden: false });
    expect(layout).toEqual(before);
  });
});
