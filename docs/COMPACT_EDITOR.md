# Compact editor chrome

Implements [#16](https://github.com/IanSzymanski/squidware/issues/16) using sections 1–5 of [DESIGN_GUIDANCE.md](DESIGN_GUIDANCE.md).

## Layout and behavior

The chrome this issue introduced has since been rebuilt. The [design system](DESIGN_SYSTEM.md) and [workspace layout](WORKSPACE_LAYOUT.md) are the current references. In the current shell:

- A 44 px top bar combines the Project menu, the production title and file status, the **Write**, **Plan** and **Rehearse** modes, undo and redo, the problems badge, command search and **Export**.
- A 44 px tool strip above the field holds the tools. The current set's name is in the transport's **Find set** control, and the 2D / 3D / Split control floats over the field's margin with the other view controls.
- Section selection is a row of chips at the top of the Inspector instead of a row floating inside the field. While performers are selected the chips fold to their colors.
- The show strip combines a 44 px transport, the timeline (ruler, set track and problem markers) and the set strip. Attach or replace audio sits with the playback options. No audio track is rendered until a decoded track is attached.
- Enlarged and narrow layouts keep the top bar, tool strip and transport on one row and fold controls into menus instead of wrapping (see [Small windows and UI scale](WORKSPACE_LAYOUT.md#small-windows-and-ui-scale)).

No production schema, coordinate, timing, preference or file-save semantics changed.

## Evidence and acceptance

The captures and measurements below record the earlier compact chrome (a 48 px header, a legend floating in the field and a left set list). They have not been repeated for the rebuilt shell.

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
