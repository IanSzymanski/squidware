# Grid and group snapping

Implements [#21](https://github.com/IanSzymanski/squidware/issues/21) for v0.6. Open **Grid and snapping** beside the magnet in the 2D field toolbar. Choose 8-to-5, 6-to-5 or 12-to-5, with whole, half or quarter steps, or snap to 5-yard lines and the current field's hashes/sidelines. Apply rules saves the choices with the production without moving performers; Cancel discards the dialog changes. Rule changes have one named undo entry.

Grid intersections start at the left goal line and back sideline, in physical yards. One interval is `5 / steps / subdivision` yards. Marking targets are every 5 yd horizontally and college/high-school hashes and sidelines vertically. Targets are exclusive. Equal-distance ties choose the lower physical coordinate. Flipping the view does not change physical targets.

**Keep spacing** snaps the grabbed dot and translates the group rigidly. Keyboard and Inspector nudges anchor to the leftmost selected dot, breaking ties toward the back sideline, then by stable identity. **Individual dots** quantizes each dot and can change intervals or create coincident dots. The field and Inspector show the active mode and spacing warning. Dragging shows proposed dots and dashed travel lines before release; Escape cancels. Release commits those exact positions once; Undo restores original offsets.

Alt-arrow and Inspector moves share the placement engine. Nudges affect only the requested axis; short requests still advance to the next target. Requested normal/fast distances remain personal preferences. Single-performer numeric coordinates use the same targets on the edited axis. Turn the magnet off for unquantized movement. Exact transforms and formation previews retain their own geometry.

All positions stay inside the field. Rigid groups use only targets that fit their complete bounds. If no target fits the permitted anchor interval, movement is bounded without squeezing the group. Individual mode bounds each dot separately. Unselected performers are unchanged.

## Files and personal defaults

The optional v2 `snapping` object contains `steps`, `subdivision`, `target` and `group`. The shared renderer/native codec, JSON Schema, editable saves and recovery retain and validate it. Files without it, including migrated v1 files, use 8-to-5 whole-step/anchor rules. Adding rules changes no positions or timing. Older v2 readers open the positions but discard these newly recognized rules when saving; retain the original file when using older builds.

**Preferences → New production placement defaults** seeds productions created through New production, including the demo option. Changing defaults never modifies the current show or its dirty state. Grid visibility and the magnet toggle remain personal preferences. Coordinate descriptions and exports retain their documented 8-to-5 output convention; an editing grid does not change output units.

## Design and validation

Applies [shared design guidance](DESIGN_GUIDANCE.md) sections 1–5: reuses compact toolbar buttons/help, labeled form controls, modal keyboard handling, typed commands and named history. A compact field readout explains active behavior. Existing themes are retained; theme switching belongs to #43. Writer/device and three-platform acceptance remain separate.

Source regressions cover all nine grid/subdivision combinations, off-grid groups, stable/explicit anchors, individual spacing changes, both hash presets, negative requests, bounds, physical ties, flipped directions, numeric entry, short nudges, unchanged identities/other sets, invalid rules, undo/redo and file round trips. Preference lifecycle checks ensure nested defaults save once without looping or dirtying a show. Published-contract checks independently validate optional rules using JSON Schema and the canonical codec.

The field owner runs `scripts/snapping-qa.cjs`: native drag, keyboard Apply/Cancel/Alt-arrow, exact preview/commit comparison, undo, Inspector parity and flipped movement. Dropdown change events are fixture setup, not proof of native OS dropdown navigation. Its output includes `snapping-before.png`, `snapping-individual.png`, `snapping-drag-preview.png`, `snapping-flipped.png` and settings at 1366×768, 125% UI zoom and 1120px content width. Native content sizes are checked before recording these cases. The workflow harness records source/build identity and pass/fail results.
