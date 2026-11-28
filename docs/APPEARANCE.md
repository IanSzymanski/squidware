# Themes, accent, field appearance and UI scale

Issue [#43](https://github.com/IanSzymanski/squidware/issues/43).

Open **Project menu → Preferences…** and use its **Appearance** section to choose **Match system**, **Dark**, **Light** or **High contrast**, an accent color, a field appearance and the background behind the field, and **100%, 110%, 125% or 150% UI scale**. Changes apply immediately and persist on this device. Dark at 100% is the default, including when an older preferences file is missing the new fields. Reset defaults restores these choices. Invalid themes/scales cannot replace the canonical preferences.

Chrome uses shared neutral surface/text/border tokens, a personal accent (squid green by default) for the primary action, the current item and focus, and separate success/warning/error colors. Values, headings, counts, button labels and active or selected states use the full-strength text token; the muted token is reserved for labels, hints and secondary metadata, so a value stands out from its label in every theme. Counts, tempos and coordinate readouts use tabular numerals; compact chrome defaults to 12–13 px. Theme changes apply without color interpolation so text and backgrounds do not briefly use incompatible palettes. Selected dots have a white circular ring with a dark halo; keyboard focus has a separate square outline. Check marks, pressed borders, dashed disabled controls and error text reinforce state.

New productions use gold Brass dots. Opening an existing production preserves its exact section colors, including the original lime Brass default. Other section defaults are unchanged. Theme, accent, field appearance, field background and UI scale remain personal preferences, outside `.squid` data and edit history. The field look and independent dot/label pixel preferences are independent of the chrome theme. Print media resets UI scaling; existing print typography and geometry are retained.

Scaling uses Chromium CSS zoom in both the desktop renderer and browser fallback. Tooltip placement, coordinate readouts, layout popovers and panel dragging convert screen coordinates to scaled layout coordinates. Layout breakpoints use the effective window size (window size ÷ UI scale). Small windows and large scales keep a one-row top bar, tool strip and transport, fold tool groups into **Shape** and **Arrange** menus and playback options into **More playback options**, and open the side panel over the field; see [Small windows and UI scale](WORKSPACE_LAYOUT.md#small-windows-and-ui-scale). Short fields suppress secondary metadata and show the keyboard hint when the field has focus.

## Match system

**Match system** follows the computer: the light or dark setting chooses Light or Dark, and a request for more contrast (macOS Increase contrast, Windows contrast themes, or forced colors) chooses High contrast. Squidware follows changes to those settings while it runs, in the main window and the 3D window alike. The Appearance section names the theme the system currently gives. Dark stays the default for new and older preference files.

## Accent color

The accent marks the primary action in view, the current set and tool, and keyboard focus. Choose **Green** (the default squid green: `#0EEDB5` on Dark and High contrast, `#006B50` on Light), **Blue**, **Violet** or **Pink**, or pick any color with the always-visible **Custom** color picker; picking a color makes it the accent. The picker starts from the accent in use.

Each preset is defined separately for Dark, Light and High contrast in [`tokens.css`](../src/ui/tokens.css). A custom color keeps its hue and saturation and is lightened (Dark, High contrast) or darkened (Light) only as far as needed: accent text reaches 4.5:1 on every chrome surface, labels on accent buttons reach 4.5:1 in every state, and the focus ring reaches 3:1. When the color is changed for the current theme, Preferences says which color it shows as. High contrast keeps its white focus ring. The dark canvas chips over the field use the accent's dark-theme value in every theme. Status colors (success, warning, error, info) never follow the accent.

Preferences saved with the earlier **Lime** or **Teal** accent open as Green.

**The squid mark** in the top bar and on the welcome screen is drawn in the accent, so it follows the theme and accent choice. In the browser, the tab icon follows the accent too. The packaged desktop icon (`public/icon512.png`, `build/icon.ico`) is the dark glyph on a squid-green tile and does not change with the accent.

## Field appearance

The field look is a personal display choice; the production stores no field colors.

| Look | Field | Overlays |
| --- | --- | --- |
| **Turf** (default) | Dark green turf, soft white lines. The existing standard field. | Light paths, previews and handles, white selection ring |
| **Grass** | Brighter striped grass with painted white lines | Light, a little brighter than Turf |
| **Classic chart** | Black lines, hashes and numbers on a white field, like a printed drill chart | Dark: blue previews and previous paths, brown next paths, dark selection and focus rings, dark labels with white halos, field-specific problem red |
| **Night chart** | White lines on a black field | As Turf, with gray dot outlines so dark section colors stay visible |

The look paints the 2D field in both renderers (SVG and canvas), its neighbor paths, previews, guides, handles, selection candidates, lasso and marquee, on-field problems, and the set thumbnails. Section colors are never recolored. Every look keeps overlay ink at 3:1 or better against its field and labels at 4.5:1 against field and halo; [`fieldPalette.test.ts`](../src/components/fieldPalette.test.ts) checks each.

**Printed drill books** use Classic chart when it is the chosen look, and the standard Turf otherwise, so dark fields never go to paper. The Export dialog's first-page preview shows the field the PDF will use. SVG export, panel previews (assignment, transitions, templates, surface settings) and the 3D view keep the standard Turf.

**Background behind the field** sets the space around the 2D field and behind set thumbnails. It starts as the look's own background (light gray for Classic chart) and **Match field look** returns to it. The sideline captions, the status line and the hint below the chart switch to dark or light ink to stay at 4.5:1 on any background. The 3D view keeps its own scene background.

## Design review

Applies [shared design guidance](DESIGN_GUIDANCE.md) sections 1–5. Reuses the existing Preferences dialog, versioned preference codec/controller, native preference service, shared controls/tooltips and workspace fitting/overlays. The project codec and engine geometry are unchanged.

Before/after captures at 1366 × 768, per-theme controls, 1000 × 700 at 125%, 850 × 650 at 150%, real transition warnings and a restarted desktop process are in [the evidence directory](evidence/themes/README.md). The default field height is recorded in the measurements; enlarged layouts intentionally trade field area for larger controls while preserving access through pane collapse and scrolling. No default-size deviation from the approximately 470 px field-height target is required.

## Validation

Build, then run `node scripts/themes-qa.mjs` under the platform display (on Linux, `xvfb-run --auto-servernum node scripts/themes-qa.mjs`). The themes suite is also included in the shared desktop regression matrix. It uses an isolated real Electron profile and native pointer/keyboard events to exercise theme/scale controls, focus, legacy Brass selection, Cast, sheet, Export, invalid preferences, scaled field hit testing, native save/reopen and fresh-process persistence. Rendered contrast checks include disabled controls and placeholders, with the 4.5:1 threshold retained.

The source, format/release contracts, native bridge/storage tests and existing accessibility, field, preference, tooltip, workspace and PDF suites provide additional regression evidence. Supplementary native PDF inspection compares the same six pages across dark/100%, light/125% and high-contrast/150%: text, character boxes, page dimensions and drawing streams are identical.

These are bounded Chromium/Linux checks. Windows/macOS certification remains a CI gate; actual writer/assistive-technology and representative hardware acceptance remain tracked by #64/#3.
