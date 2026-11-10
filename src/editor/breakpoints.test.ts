import { describe, expect, it } from 'vitest';
import { BREAKPOINTS, DEMANDED_FIELD_RESERVE, FIELD_MIN, FIELD_RESERVE, effectiveViewport, fieldReserve, workspaceBreakpoints } from './breakpoints';
import { fitWorkspaceLayout, paneLimits, workspacePreset, type WorkspaceLayout } from '../workspaceLayout';

/** The issue's screenshot matrix: window sizes × UI scales, through the same fit the workspace renders. */
function resolve(width: number, height: number, scale: number, layout = workspacePreset('write'), side: 'inspector' | 'cast' = 'inspector', demanded = false) {
  const viewport = effectiveViewport(width, height, scale);
  const fit = fitWorkspaceLayout(layout, viewport.width, side, demanded);
  const main = viewport.width - (fit.setsHidden ? 30 : fit.widths.sets + 6) - (fit.sideHidden ? 30 : fit.widths[side] + 6);
  return { viewport, fit, main, ...workspaceBreakpoints(viewport, main) };
}
/** The fit before #178 (a53139b): one 360 px reserve for every panel. A demanded side panel must dock wherever this did. */
function preBreakpointFit(layout: WorkspaceLayout, available: number, side: 'inspector' | 'cast') {
  const widths = { sets: layout.setsWidth, inspector: layout.inspectorWidth, cast: layout.castWidth };
  let setsHidden = layout.setsCollapsed; let sideHidden = layout[`${side}Collapsed`];
  const used = () => (setsHidden ? 30 : widths.sets + 6) + (sideHidden ? 30 : widths[side] + 6) + 360;
  for (const pane of ['sets', side] as const) if (!(pane === 'sets' ? setsHidden : sideHidden)) widths[pane] = Math.max(paneLimits[pane][0], widths[pane] - Math.max(0, used() - available));
  if (used() > available && !setsHidden) setsHidden = true;
  if (used() > available && !sideHidden) sideHidden = true;
  return { setsHidden, sideHidden };
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
  it('docks a side panel the writer asked for beside a narrower field wherever it docked before #178', () => {
    expect(DEMANDED_FIELD_RESERVE).toBeLessThan(FIELD_RESERVE);
    expect([fieldReserve(false), fieldReserve(true)]).toEqual([FIELD_RESERVE, DEMANDED_FIELD_RESERVE]);
    const layouts = [workspacePreset('write'), { ...workspacePreset('write'), setsWidth: 300, inspectorWidth: 400, castWidth: 420 }, { ...workspacePreset('rehearse'), inspectorCollapsed: false }];
    for (const layout of layouts) for (const side of ['inspector', 'cast'] as const) for (let available = 400; available <= 1500; available += 7) {
      const demanded = fitWorkspaceLayout(layout, available, side, true), idle = fitWorkspaceLayout(layout, available, side);
      const context = `${side} at ${available} ${JSON.stringify(layout)}`;
      expect(demanded.sideHidden, context).toBe(preBreakpointFit(layout, available, side).sideHidden);
      // The set list still tucks first and at the full reserve; the demand only keeps the side panel docked.
      expect(demanded.setsHidden, context).toBe(idle.setsHidden);
      if (!idle.sideHidden) expect(demanded, context).toEqual(idle);
      // The panel shrinks to its minimum before the field gives way, and the field keeps the smaller reserve.
      const field = available - (demanded.setsHidden ? 30 : demanded.widths.sets + 6) - (demanded.sideHidden ? 30 : demanded.widths[side] + 6);
      if (!demanded.sideHidden && field < FIELD_RESERVE) expect(demanded.widths[side], context).toBe(paneLimits[side][0]);
      if (!demanded.sideHidden) expect(field, context).toBeGreaterThanOrEqual(DEMANDED_FIELD_RESERVE);
    }
  });
  it('docks Cast and a preview\'s Inspector at matrix points where the field reserve alone would tuck them', () => {
    // [window, scale] → tucked as [Cast, Cast shown, Inspector, Inspector for a preview]. Demanded panels dock down to
    // 676 (Cast) and 631 (Inspector) effective px, as before #178.
    const expected: Record<string, [boolean, boolean, boolean, boolean]> = {
      '1024x700@1.25': [true, false, false, false], '900x650@1.25': [true, false, true, false], '800x600@1': [true, false, true, false],
      '1280x720@1.5': [true, false, false, false], '1024x700@1.5': [true, false, true, false], '800x600@1.25': [true, true, true, false],
      '900x650@1.5': [true, true, true, true], '800x600@1.5': [true, true, true, true],
    };
    for (const [key, tucked] of Object.entries(expected)) {
      const [size, scale] = key.split('@'); const [width, height] = size.split('x').map(Number);
      const runs = [['cast', false], ['cast', true], ['inspector', false], ['inspector', true]] as const;
      const results = runs.map(([side, demanded]) => resolve(width, height, Number(scale), workspacePreset('write'), side, demanded));
      expect(results.map(r => r.fit.sideHidden), key).toEqual(tucked);
      // The set list tucks either way; a docked demanded panel leaves the field at least the smaller reserve.
      for (const r of results) { expect(r.fit.setsHidden, key).toBe(true); if (!r.fit.sideHidden) expect(r.main, key).toBeGreaterThanOrEqual(DEMANDED_FIELD_RESERVE); }
    }
  });
});
