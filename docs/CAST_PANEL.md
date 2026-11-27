# Cast beside the field

Implements [#32](https://github.com/IanSzymanski/squidware/issues/32). The **Cast** tab of the side panel shows the roster beside the field while keeping the field, set strip and transport visible. **More Cast actions → Full Cast table** opens the whole roster in a dialog; **Return to Cast panel** closes it. The **Inspector** tab restores position tools, and the Command palette has **Show Cast beside field** and **Show Inspector**. The tab choice belongs to the workspace and does not edit a production or add undo history. [Workspace layout](WORKSPACE_LAYOUT.md) covers showing, hiding and resizing the panel.

## Shared selection and filters

The panel, full table, field dots and the Inspector's section chips all use the editor's selected performer IDs. Clicking a panel row replaces selection; Ctrl/Command-click toggles it; Shift-click adds the visible range from the last anchor. The panel list uses one Tab stop. Up/Down/Home/End move focus without changing selection; Space toggles the focused performer, Enter selects it and Shift adds a range. Full-table checkboxes retain their native keyboard behavior.

Field or section selection reveals an appropriate matching row without moving keyboard focus out of the field. Resizing or opening performer details keeps that row in view. Manual scrolling is otherwise left alone. Search matches label/name without case sensitivity; section and search filters intersect. Selection outside those filters remains selected, with an explicit hidden-selection count and **Show selected performers** action to clear the filters. Bulk select/deselect changes only visible IDs and preserves hidden selections. No-match feedback offers **Clear Cast filters**. Loading another production clears stale filters and selection.

## Roster edits

Select one performer to edit their name and section beside the field, or use the full table. Names use the established draft/commit input: Enter or blur commits, Escape cancels, and typing adds no history. A shared-selection change retains an unfinished name draft until it is committed or canceled. Names and section assignments use typed performer commands, preserve IDs/labels and every set's positions, and create one named undo entry per accepted edit. New/import/remove controls keep their existing validation and confirmation paths. Removal reconciles selection and removes the ID from all sets; undo restores it.

Active position previews lock Cast selection/metadata controls and explain why. Dock/table changes reject pending drafts, dialogs, transactions and position previews. Explicit UI navigation commits a valid focused input before changing the dock; keyboard focus moves to roster search or the restored Inspector. Personal coordinates use the established formatter and are labeled with the active set, including during playback.

## Design and verification

Applies [design guidance](DESIGN_GUIDANCE.md) sections 1–5. Reuses the existing field layout, Inspector dock, shared buttons/tooltips, commit inputs, selected-ID state, coordinate output, performer commands and undo. Cast shares the side panel and its one width with the Inspector rather than adding another panel. In windows too narrow to dock the panel it opens over the field; its layout follows the actual viewport height so roster controls remain reachable. Full-table mode is retained for bulk review. No theme or project-schema change is introduced. Physical writer/device qualification remains #64/#3.

`src/editor/castSelection.test.ts` covers visible-only selection, additive ranges, filters, maximum-roster navigation, docking guards, identity/geometry/undo and stale-filter reset. `scripts/cast-qa.cjs` runs through the dedicated `cast` desktop owner with trusted native pointer/keyboard events: actual row/dot/section synchronization, hidden selection, 500-row navigation, name draft/commit/cancel, section changes, removal/undo, dock/table transitions and layout screenshots. The editor, accessibility, preferences, thumbnails and playback owners retain their existing validation responsibilities.

Run the focused desktop check with `pnpm build` then `pnpm test:workflows --suite=cast`. The suite is also part of full desktop CI.
