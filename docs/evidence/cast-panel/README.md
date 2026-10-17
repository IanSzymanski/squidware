# Cast panel review evidence

Implementation: `e420c498b562fc2d3aead7cfd93d39450112e177`, for [#32](https://github.com/IanSzymanski/squidware/issues/32). See [behavior and validation owners](../../CAST_PANEL.md).

[Validation and measured layouts](validation.json) record 293 source, 17 contract and 50 native tests, plus six passing Windows desktop owners: Cast, preferences, editor, accessibility, thumbnails and playback. The run retains its raw source identity; the testing-guide row and these evidence files were added afterward. This records targeted Windows automation, not physical writer/device qualification or hosted macOS/Linux results.

Design guidance sections 1–5 apply. The panel reuses the Inspector dock, common selection, shared buttons/tooltips, commit inputs, coordinate formatter, performer commands and named undo. It is 300px wide, or 280px at narrow widths. The field retains 485px height at 1366×768/default scale and 1120×768/default scale. At 125% UI zoom the panel follows the viewport height, keeps a scrollable roster and reveals the selected row as list height changes. Existing themes remain unchanged; #43 owns theme/scaling expansion, #40 owns resizable panels and #64/#3 own writer/device qualification. No new deviation from the default field-height target is introduced.

Native mouse and keyboard checks compare field dots, Cast rows and the section legend. They exercise hidden/filter-mismatched selection, visible-only bulk changes, 500-row focus/range navigation, retained name drafts, one named text commit, cancel/undo/redo, section changes, full-table/dock transitions and confirmed removal/undo across both sets. Existing owners also pass save/reopen, invalid drafts, formation/transform preview locks, preference restarts, text size/contrast, thumbnail invalidation and playback isolation.

Screenshots were visually inspected. The native layout check also verifies that the selected row remains visible after resizing and that details/field controls stay inside the viewport.

- [Before: field with Inspector](cast-before.png)
- [Cast row and field selection together](cast-docked.png)
- [Docked layout and editable performer, 1366×768](cast-docked-1366.png)
- [Section reassignment with explained hidden selection](cast-filtered.png)
- [Retained full-table mode](cast-full-table.png)
- [125% UI zoom](cast-enlarged.png)
- [1120×768 window](cast-narrow.png)
