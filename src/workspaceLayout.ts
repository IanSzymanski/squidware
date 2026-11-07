import { FIELD_RESERVE, fieldReserve } from './editor/breakpoints';
export type WorkspacePreset = 'write' | 'review' | 'rehearse';
export type PaneId = 'sets' | 'inspector' | 'cast';
export interface WorkspaceLayout {
  preset: WorkspacePreset | 'custom';
  setsWidth: number; inspectorWidth: number; castWidth: number;
  setsCollapsed: boolean; inspectorCollapsed: boolean; castCollapsed: boolean;
}
export const paneLimits = { sets: [160, 360], inspector: [235, 420], cast: [280, 480] } as const;
export const paneNames = { sets: 'Set list', inspector: 'Inspector', cast: 'Cast' } as const;
export function workspacePreset(preset: WorkspacePreset): WorkspaceLayout {
  return { preset, setsWidth: 216, inspectorWidth: 258, castWidth: 300,
    setsCollapsed: preset === 'rehearse', inspectorCollapsed: preset !== 'write', castCollapsed: false };
}
/** Layout corruption recovers locally, without discarding unrelated personal preferences. */
export function validateWorkspaceLayout(input: unknown): WorkspaceLayout {
  const result = workspacePreset('write');
  if (!input || typeof input !== 'object' || Array.isArray(input)) return result;
  const value = input as Record<string, unknown>;
  if (['write', 'review', 'rehearse', 'custom'].includes(value.preset as string)) result.preset = value.preset as WorkspaceLayout['preset'];
  for (const pane of Object.keys(paneLimits) as PaneId[]) {
    const width = value[`${pane}Width`]; const [min, max] = paneLimits[pane];
    if (typeof width === 'number' && Number.isFinite(width)) result[`${pane}Width`] = Math.round(Math.max(min, Math.min(max, width)));
    if (typeof value[`${pane}Collapsed`] === 'boolean') result[`${pane}Collapsed`] = value[`${pane}Collapsed`] as boolean;
  }
  return result;
}
/** Favor the field over panel widths: open panels shrink toward their minimums, then the set list and finally the
 * side panel tuck away until the field keeps FIELD_RESERVE. A side panel the writer `demanded` (Cast shown, or the
 * Inspector a preview needs) stays docked down to the smaller DEMANDED_FIELD_RESERVE. Tucking is temporary; the saved
 * layout is never changed. */
export function fitWorkspaceLayout(layout: WorkspaceLayout, available: number, side: 'inspector' | 'cast', demanded = false) {
  let setsHidden = layout.setsCollapsed; let sideHidden = layout[`${side}Collapsed`];
  const attempt = () => {
    const widths = { sets: layout.setsWidth, inspector: layout.inspectorWidth, cast: layout.castWidth };
    const used = (reserve: number = FIELD_RESERVE) => (setsHidden ? 30 : widths.sets + 6) + (sideHidden ? 30 : widths[side] + 6) + reserve;
    for (const pane of ['sets', side] as const) {
      if (!(pane === 'sets' ? setsHidden : sideHidden)) widths[pane] = Math.max(paneLimits[pane][0], widths[pane] - Math.max(0, used() - available));
    }
    return { widths, fits: used() <= available, sideFits: used(fieldReserve(demanded)) <= available };
  };
  let fitted = attempt();
  if (!fitted.fits && !setsHidden) { setsHidden = true; fitted = attempt(); }
  if (!fitted.sideFits && !sideHidden) { sideHidden = true; fitted = attempt(); }
  return { widths: fitted.widths, setsHidden, sideHidden };
}
/** Docking a demanded panel beside a narrower field wraps the field toolbar, which can make a short window's workspace
 * scroll. A probe records, for the measured situation (`key`: window size, panel, 2D/3D view and workspace), how far
 * the workspace content overflows with the panel docked and, once measured, without it; a negative value is room to
 * spare. Docking is crowded when its overflow exceeds the overflow without the panel by more than 1 px. */
export interface CrowdingProbe { key: string; docked: number; idle: number | null }
export const isCrowded = (probe: CrowdingProbe | null, key: string) => probe?.key === key && (probe.idle === null || Math.max(0, probe.docked) > Math.max(0, probe.idle) + 1);
/** The probe after measuring `need` with the panel docked or not; the same probe when nothing changed. A docked panel
 * is probed when the workspace scrolls, and again whenever it needs more room; while it does not dock, the measurement
 * without it follows the content, so it docks again once docking no longer adds overflow. Docked measurements only
 * grow, so content that settles a frame late (the 3D view's camera controls) cannot make the panel alternate. */
export function nextCrowdingProbe(probe: CrowdingProbe | null, key: string, docked: boolean, need: number): CrowdingProbe | null {
  const current = probe?.key === key ? probe : null;
  if (docked) return need > 1 && (!current || need > current.docked + 1) ? { key, docked: need, idle: null } : probe;
  return current && (current.idle === null || Math.abs(current.idle - need) > 1) ? { ...current, idle: need } : probe;
}
