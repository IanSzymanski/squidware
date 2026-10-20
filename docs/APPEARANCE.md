# Themes and UI scale

Issue [#43](https://github.com/IanSzymanski/squidware/issues/43).

Open **Menu → Preferences** to choose **Dark**, **Light** or **High contrast**, and **100%, 110%, 125% or 150% UI scale**. Changes apply immediately and persist on this device. Dark at 100% is the default, including when an older preferences file is missing the new fields. Reset defaults restores these choices. Invalid themes/scales cannot replace the canonical preferences.

Chrome uses shared neutral surface/text/border tokens, blue selection/focus, and separate success/warning/error colors. Counts, tempos and coordinate readouts use tabular numerals; compact chrome defaults to 12–13 px. Theme changes apply without color interpolation so text and backgrounds do not briefly use incompatible palettes. Selected dots have a blue circular ring with a dark halo; keyboard focus has a separate square outline. Check marks, pressed borders, dashed disabled controls and error text reinforce state.

New productions use gold Brass dots. Opening an existing production preserves its exact section colors, including the original lime Brass default. Other section defaults are unchanged. Theme and UI scale remain personal preferences, outside `.squid` data and edit history. The dark field artwork and independent dot/label pixel preferences remain stable across chrome themes. Print media resets UI scaling; existing print typography and geometry are retained.

Scaling uses Chromium CSS zoom in both the desktop renderer and browser fallback. Tooltip placement, coordinate readouts, layout popovers and panel dragging convert screen coordinates to scaled layout coordinates. Small windows keep primary actions in a wrapping header, expose collapsed panes through their Show controls and scroll the workspace when necessary. Short fields suppress secondary metadata and show the keyboard hint when the field has focus.

## Design review

Applies [shared design guidance](DESIGN_GUIDANCE.md) sections 1–5. Reuses the existing Preferences dialog, versioned preference codec/controller, native preference service, shared controls/tooltips and workspace fitting/overlays. The project codec and engine geometry are unchanged.

Before/after captures at 1366 × 768, per-theme controls, 1000 × 700 at 125%, 850 × 650 at 150%, real transition warnings and a restarted desktop process are in [the evidence directory](evidence/themes/README.md). The default field height is recorded in the measurements; enlarged layouts intentionally trade field area for larger controls while preserving access through pane collapse and scrolling. No default-size deviation from the approximately 470 px field-height target is required.

## Validation

Build, then run `node scripts/themes-qa.mjs` under the platform display (on Linux, `xvfb-run --auto-servernum node scripts/themes-qa.mjs`). The themes suite is also included in the shared desktop regression matrix. It uses an isolated real Electron profile and native pointer/keyboard events to exercise theme/scale controls, focus, legacy Brass selection, Cast, sheet, Export, invalid preferences, scaled field hit testing, native save/reopen and fresh-process persistence. Rendered contrast checks include disabled controls and placeholders, with the 4.5:1 threshold retained.

The source, format/release contracts, native bridge/storage tests and existing accessibility, field, preference, tooltip, workspace and PDF suites provide additional regression evidence. Supplementary native PDF inspection compares the same six pages across dark/100%, light/125% and high-contrast/150%: text, character boxes, page dimensions and drawing streams are identical.

These are bounded Chromium/Linux checks. Windows/macOS certification remains a CI gate; actual writer/assistive-technology and representative hardware acceptance remain tracked by #64/#3.
