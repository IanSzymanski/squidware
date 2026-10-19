# Selection tools and saved groups — #33

Open **Selection tools and groups** from the field toolbar or the docked/full Cast heading. Both use the same selection and shared command registry. The panel scrolls independently at narrow/enlarged sizes; it does not add a permanent toolbar row. Close returns keyboard focus to the opener.

## Sections and scope

- Click a section button to replace the selection with that whole section. Shift-click, Shift-Enter or Shift-Space adds the section, without toggling away already-selected members. Section buttons ignore Cast filters. As before, changing sections cancels a contextual position preview while preserving unrelated drafts.
- **Invert visible** inverts only performers matching the current Cast search and section filter. Selected performers outside that scope stay selected. A search matches performer labels and names; it is not restricted to labels.
- Geometric selection uses the same Cast filter scope. The panel reports its scope count. Group recall uses the whole saved ID list, including members hidden by filters; Cast retains its existing hidden-selection notice.
- The **Add to selection** checkbox offers a keyboard-accessible alternative to Shift for preview results and group recall.

Selection alone changes no production data, coordinates, saved-file revision or undo history. Saving, renaming, replacing members or deleting a group is a named production edit with Undo/Redo.

## Lasso and rank/file review

Choose **Lasso selection** or press **L** outside text entry; V restores ordinary selection and H pans. Draw a freehand boundary, then review and Apply or Cancel. Shift at gesture start adds to the previous selection. Escape during drawing cancels the gesture and keeps that selection, including in focus mode. Pointer cancellation also discards the drawing. Paths with more than 512 sampled points are rejected instead of silently truncated.

The **Keyboard lasso** section accepts one physical `x, y` pair per line (or semicolon). It closes the last point back to the first automatically. At least three non-collinear finite points are required, with a maximum of 512. Crossing paths use even-odd fill, matching the rendered polygon.

Choose an anchor performer and **Preview rank** or **Preview file**:

- Rank matches physical Y (front/back distance); file matches physical X (left/right distance).
- Tolerance is configurable from 0 to 5 physical yards, inclusive. Zero matches the exact axis, with a small floating-point allowance.
- Lasso includes interior points and points within the boundary tolerance, including its closing edge. Neither field orientation nor UI zoom changes membership.
- Near-boundary candidates are shown separately for review. The review band is `max(0.05 yard, 15% of tolerance)`: axis candidates within that distance of the tolerance threshold, or polygon candidates within tolerance plus the band of an edge. Nearby outside candidates start unchecked.

Solid field rings show included candidates; dashed rings show available excluded candidates. The list supplies labels, distances and explicit **Near boundary** text, with checkboxes to decide membership. Apply changes only the selection; Cancel preserves the previous selection. Escape cancels the preview first, then closes the panel. Arrow/roster field navigation remains available; keyboard Enter accepts the review from the field.

Editing an anchor, tolerance or typed polygon cancels the old review; choose Preview again for the new inputs. Changing selection, set, project revision, Cast filters, view, playback position or draft/gesture context invalidates a pending review. Position edits, group changes and layout hiding are guarded during the review. Existing unrelated drafts and position previews must finish or cancel before starting a geometric selection.

## Saved groups

Select performers, enter a unique name, then choose **Save group**. Groups can overlap and are independent of section membership. Recall replaces the selection unless Add mode is checked. **Use current selection** replaces a group's members; **Delete** removes only the group. Group names support Enter to apply and Escape to cancel; invalid/duplicate rename drafts stay visible until corrected or canceled.

Groups persist as the optional v2 `selectionGroups` property with `{id, name, performerIds}` objects. Limits are 64 groups, 80 UTF-16 units per name and 500 unique existing performer IDs per group. Removing performers prunes all groups in the same undoable removal; empty groups remain named and cannot recall stale IDs. Undo restores performers and memberships together. File imports reject stale, duplicate or malformed references. See the [format contract](../format/FORMAT.md) for compatibility with older readers.

## Validation and review

The `selection` desktop owner exercises native additive section activation, filtered invert, shared Cast selection, group names and invalid drafts, delete/undo, rank/file candidates, pointer lasso and Escape, keyboard polygon entry at narrow/enlarged sizes, performer removal, and native save/reopen in a fresh process. Source tests cover irregular/concave polygons, boundaries and tolerance, stale reviews, filtered scope, overlapping/empty groups, undo and malformed metadata. Independent JSON Schema and native file-handler tests cover the optional wire data.

Shared design guidance sections 1–5 apply. This reuses existing toolbars, Lucide glyphs, tooltips, focus styles, the command registry and personal-layout behavior. [Rendered evidence](evidence/selection-tools/README.md) records before/after and narrow/enlarged review. Full theme switching remains #43; actual writer/device qualification remains #64/#3.
