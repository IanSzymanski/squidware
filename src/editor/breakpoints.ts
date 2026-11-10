/**
 * UI-scale-aware workspace breakpoints (#178), shared by the header, side panels, transport and field sizing.
 * Every length is in effective CSS px: window px divided by the UI scale, the space of --viewport-width and
 * --viewport-height. A 1366 px window at 150% UI scale is laid out like a 911 px window. The editor exposes the
 * result once, as data-header, data-transport and data-height on .studio; CSS and later layout work read those.
 */
export const BREAKPOINTS = {
  /** Header: below this width Layout, Focus field, Help and History fold into Menu, and Menu drops its label. */
  headerCompact: 1200,
  /** Header: below this width the workspace tabs and Save also become icon-only. */
  headerNarrow: 800,
  /** Transport (main workspace width): below this, loop, metronome and speed move into More playback options. */
  transportCompact: 800,
  /** Transport: below this, rehearsal passages and audio also move into that menu; play, set navigation and the show count stay. */
  transportNarrow: 520,
  /** Height: below this, editor chrome tightens its spacing so the field keeps its share. */
  short: 620,
} as const;

/** The smallest field container the workspace protects. When space is short, open side panels shrink to their
 * minimum widths and then tuck away (set list first) before the field container narrows below `width`, which keeps
 * the drawn field at least 480 px wide at 100% UI scale. `height` is the container's floor on short windows. */
export const FIELD_MIN = { width: 520, height: 150 } as const;
/** Field container margins inside the main workspace (12 px each side). */
export const FIELD_GUTTER = 24;
/** Main workspace width kept for the field before side panels give way. */
export const FIELD_RESERVE = FIELD_MIN.width + FIELD_GUTTER;
/** Main workspace width kept for the field beside a side panel the writer asked for: Cast shown from the header tab,
 * Dock Cast or the palette, or the Inspector a preview needs for its controls. Such a panel docks beside a narrower
 * field down to this pre-#178 reserve, so it docks wherever it did before; the set list still tucks first, at
 * FIELD_RESERVE. Below it Cast opens over the field, and a preview's Inspector opens over it without hiding the field;
 * so do they where docking would add scrolling to a short window's workspace. The timeline beside such a panel is narrower
 * too, so the transport tier can change while it is docked (docs/WORKSPACE_LAYOUT.md). */
export const DEMANDED_FIELD_RESERVE = 360;
/** The main workspace width a side panel must leave the field before it tucks. */
export const fieldReserve = (demanded: boolean) => demanded ? DEMANDED_FIELD_RESERVE : FIELD_RESERVE;

export type HeaderMode = 'full' | 'compact' | 'narrow';
export type TransportMode = 'full' | 'compact' | 'narrow';
export interface Viewport { width: number; height: number }
export interface WorkspaceBreakpoints extends Viewport { header: HeaderMode; transport: TransportMode; short: boolean }

/** The effective viewport for a window size in CSS px and the UI scale preference. */
export function effectiveViewport(windowWidth: number, windowHeight: number, uiScale: number): Viewport {
  const scale = Number.isFinite(uiScale) && uiScale > 0 ? uiScale : 1;
  return { width: windowWidth / scale, height: windowHeight / scale };
}

const tier = (width: number, compact: number, narrow: number) => width < narrow ? 'narrow' : width < compact ? 'compact' : 'full';

/** Breakpoints for an effective viewport. `mainWidth` is the main workspace (timeline) width left beside docked side panels. */
export function workspaceBreakpoints(viewport: Viewport, mainWidth = viewport.width): WorkspaceBreakpoints {
  return { width: viewport.width, height: viewport.height,
    header: tier(viewport.width, BREAKPOINTS.headerCompact, BREAKPOINTS.headerNarrow),
    transport: tier(mainWidth, BREAKPOINTS.transportCompact, BREAKPOINTS.transportNarrow),
    short: viewport.height < BREAKPOINTS.short };
}
