# Neighboring sets and travel paths

Issue [#30](https://github.com/IanSzymanski/squidware/issues/30) adds two independent toolbar controls to the 2D field. **Show paths from previous set** draws hollow circles and dashed incoming arrows. **Show paths to next set** draws hollow diamonds and dotted outgoing arrows. A concise field legend names the neighbor sets and review scope. Shapes, dash patterns and text distinguish directions without relying on color.

Both overlays can be shown while editing a middle set. No selection reviews the roster; a selection limits review to its members. The current Cast section filter intersects that scope. An empty intersection draws no ghosts. Ghost geometry has no pointer events, keyboard stops or editable performer roles, and sits behind current dots. A current performer remains selectable when a ghost occupies the same position.

The opening set disables the previous control; the final set disables the next. A single-set production has neither neighbor. Playback, between-set scrubbing, 3D and uncommitted drag previews hide the overlays; returning to an editable set restores the chosen controls. Disabled controls explain their state through the shared help component. A hold retains its endpoint symbol without inventing a direction arrow.

## Geometry and preferences

Both playback and neighbor review use `moveEndpoints` from the shared domain engine. Validated v2 paths currently support one full-count line segment; ease changes time sampling along that line. Review draws the same ordered endpoints. Curved paths and multi-segment path editing remain with their owning future work. Overlay generation never edits production data, coordinates, move timing, history or print/SVG output.

The existing personal `showPaths` preference continues to control the previous overlay. The additive `showNextPaths` preference defaults to false in older version-1 preference files. Both choices persist independently through the existing validated preference controller, IPC and storage, and appear as Previous paths / Next paths in Preferences. No project format change is required.

## Validation and design evidence

Applies [shared design guidance](DESIGN_GUIDANCE.md) sections 2–5: existing control/tooltip styles, Lucide direction icons, screen-sized dots and paths, readable 11 px legend text, non-color distinctions, keyboard activation, preview suppression, and personal settings separate from production data. The current supported visual theme is reused. Broader workspace layout, themes and orientation remain #16/#40/#43/#42; this change does not introduce a competing style system.

- Four focused source cases cover ordered/eased/hold endpoints against the shared sampler, independent toggles, first/last/single/empty sets, section/selection intersection, project immutability, noninteractive geometry and hold arrows.
- The existing **field** production suite owns the new integration cases. Native pointer input toggles both neighbors and selects a real performer underneath a ghost. Real Tab/Enter toggles the next neighbor independently. Checks cover missing neighbors, preview/3D suppression, drag previews and unchanged project/history.
- The existing **preferences** restart suite now toggles both controls and checks their saved values after fresh desktop processes. Playback/native/format checks retain their existing owners; no parallel end-to-end launcher is added.
- Screenshots in [evidence/neighbor-sets](evidence/neighbor-sets/) capture the same middle-set fixture before/after at 1366 × 768, enlarged UI at 125%, and the 1120 × 768 desktop minimum. New controls and legend stay usable; the existing enlarged layout scrolls vertically to retain access. The compact-field space target remains separately owned by #16.

These are software and rendered-window checks. Physical writer/device and representative school-hardware qualification remain #64/#3.
