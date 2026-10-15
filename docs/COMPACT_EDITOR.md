# Compact editor chrome

Implements [#16](https://github.com/IanSzymanski/squidware/issues/16) using sections 1–5 of [DESIGN_GUIDANCE.md](DESIGN_GUIDANCE.md).

## Layout and behavior

The 48 px header combines file status, workspace navigation and the existing history/file/help commands. Design, Cast and Sheet keep their accessible names and current-workspace state. Set name and 2D/3D controls share the canvas toolbar. Cast and Production sheet retain concise headings and their workspace actions.

Section selection floats inside the field. Its horizontal scroller supports the maximum 64 sections without growing the chrome vertically; native keyboard focus scrolls each chip into view. Field coordinates and neighboring-set/preview overlays remain separate from the chip row. Selection count remains visible at narrow sizes.

The timeline combines the count ruler, set track and transport. Attach/Replace audio lives beside playback options. No audio track or label is rendered until an actual decoded track is attached. An attached waveform adds one 31 px lane. Enlarged/narrow layouts wrap tool and transport groups; no required action is hidden. Existing sidebars retain their scroll regions, with workspace overflow available at sizes below the supported desktop minimum.

This change reuses HelpButton, Button, tooltips, Lucide icons, the current palette/focus styles and shared editor commands. No production schema, coordinate, timing, preference or file-save semantics change. Resizable panels and workspace presets remain owned by #40; Inspector reorganization remains owned by #18. Theme switching remains #43.

## Evidence and acceptance

Before/after captures and measured regions are in [evidence/compact-editor](evidence/compact-editor). Measurements use CSS pixels; native screenshot capture briefly widens the window by one pixel to refresh the hidden compositor surface.

At 1366 × 768 and default scale, the baseline screenshot has a 66 px header, 89 px workspace heading, 44 px toolbar, 276 px field, 55 px legend and 208 px timeline/transport. The implementation removes the separate Design heading/rail, overlays the legend and removes the unused audio lane. Exact after measurements for 1366/1120 px and 100/125% scale are stored in `measurements.json`.

The default no-track field exceeds the approximately 470 px target, with a 48 px header and approximately 120 px timeline/transport. Attaching audio reserves 31 px for its waveform. Narrow/enlarged layouts spend additional height on wrapping controls; the measured field reductions preserve readable text and reachable actions. These are content-dependent layout costs, not changes to physical drill geometry.

| Window / UI scale | Header | Field, no audio | Field, attached audio | Timeline, no audio |
| --- | ---: | ---: | ---: | ---: |
| 1366 × 768 / 100% | 48 | 485 | 454 | 117 |
| 1366 × 768 / 125% | 48 | 332.2 | 301.2 | 116.8 |
| 1120 × 768 / 100% | 48 | 485 | 454 | 117 |
| 1120 × 768 / 125% | 48 | 305.4 | 274.4 | 143.6 |

At 125%, the effective viewport is 1093 × 614 or 896 × 614 CSS pixels. The approximately 120 px timeline target applies to the default layout; the narrowest enlarged transport wraps to 143.6 px so playback options remain usable. Attached-audio height is 31 px greater in every case. The default field gains 209 px (76%) over the baseline, and 69 px of horizontal rail space is returned to the workspace.

The existing editor regression now measures the layout, checks that required controls are visible and unobstructed, and creates a demo production, adds/renames a set, edits counts, plays/pauses and saves through the real native file handler at all four viewport/scale combinations. It also decodes a real WAV file, verifies the conditional audio lane and confirms attachment does not dirty the production. Existing native pointer section selection, keyboard workspace/field navigation, undo/redo, preview locks, coordinate precision, dense-field/DPI selection, preference restart, thumbnail invalidation, tooltips and playback subscription checks remain in their owning suites.

Rendered screenshots are inspected at default, narrow and enlarged scale, including the combined 1120 px / 125% case and attached audio. Source/build, native and targeted desktop checks are recorded in the PR. Actual writer and school-hardware sessions remain tracked by #64 and #3; these automated and visual checks do not claim those sessions occurred.
