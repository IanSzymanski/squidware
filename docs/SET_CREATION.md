# Set creation

Issue [#29](https://github.com/IanSzymanski/squidware/issues/29) separates the former Add/Duplicate operation into four reviewed actions. The single **Add set** control opens a dialog. The Inspector’s copy control, command palette and shortcuts open the same dialog with the requested action selected. Opening or canceling the dialog does not edit the production; opening pauses playback. Apply selects the created picture and commits one named history entry.

| Action | Placement and positions | Notes and name | New move defaults |
| --- | --- | --- | --- |
| New set (`N`) | After selected set; fresh staging rows for the entire cast | Blank notes; `Set N` | Personal default counts, selected set’s incoming BPM, constant speed |
| Duplicate (`D`) | After selected set; deep copy of its positions | Copy notes; name plus ` copy` | Copy incoming counts, BPM and transition |
| Insert before (`Shift+N`) | Before selected set; copy preceding picture’s positions | Blank notes; `Set N` | Personal default counts, selected set’s incoming BPM, constant speed |
| Hold positions (`Shift+D`) | After selected set; copy its positions | Blank notes; name plus ` hold` | Personal default counts, selected set’s incoming BPM, constant speed |

All actions expose counts and BPM before Apply. Changing action resets those fields to that action’s documented defaults. Preferences → Set creation stores integer **New move counts** on this device (32 for older/missing preferences, bounded by `PROJECT_LIMITS.counts`). Duplicate uses this default only for the opening set, which has no incoming duration. New bindings are configurable; migration clears a newly introduced default if it conflicts with an older explicit custom binding, preserving that user’s key.

“Blank” is a new layout, not missing performer coordinates: New set stages all existing performer IDs in at most 40 columns spanning 5–95% of field width, from the front sideline inward. Row intervals are at most 2.3 yards, reduced to fit field depth if needed. This is a starting layout to edit, not an optimized formation or a clearance guarantee. Existing sets and roster identities are unchanged. Hold positions creates a normal editable picture, not a persistent constraint between two sets.

## Move adjacency and opening rules

Every action adds one new set ID and one new move ID. A copied picture does not replay its incoming travel: its new incoming move has implicit straight paths, which hold because its endpoints coincide. Existing destination moves retain their IDs, counts, BPM, transition and explicit line paths. Only their predecessor is rewired where the insertion changes adjacency. The original sets retain positions and notes. This operation adds the chosen counts; it does not split an existing move or preserve the show’s previous duration. Detailed travel-path cloning remains outside this issue.

Insert before the opening set copies the opening positions into a new zero-count opening picture. The former opening gains a new incoming hold with the reviewed counts and BPM. Its successor retains the existing move. Opening timing metadata is retained; it does not add elapsed counts. One-set productions support all four operations.

Creation uses the shared command registry, project validation and patch history. `set.new`, `set.duplicate`, `set.insert-before` and `set.hold` open review; `set.create` applies the reviewed operation. The low-level `set.add` command creates a New set with the same defaults. Invalid timing, pending drafts, active previews, unrelated dialogs, transactions and the maximum set count cannot bypass command validation. Undo/redo restores the original/accepted geometry and generated identities. Saved files remain schema v2 with no new wire fields.

## Validation and design review

At implementation review, all 486 source tests, 58 native tests, contract checks, the production build, registered set-creation workflow and full editor walkthrough pass locally. The source matrix covers all four actions at beginning/middle/end, one-set shows, opening timing, maximum cast/set limits, custom defaults, invalid requests, unchanged adjacent paths, fresh IDs, named history and canonical save/reload. Native preferences tests persist the new default across services. The registered `set-creation` desktop suite (`pnpm test:sets`) uses real keyboard and pointer input, observes initial focus, rejects invalid timing, tests Cancel/Apply/Undo/Redo, and saves/reopens through the production file bridge. The existing editor suite now applies the reviewed New set before continuing its workflow.

Shared [design guidance](DESIGN_GUIDANCE.md) sections 1–5 apply. The implementation reuses Modal, HelpButton/tooltips, Lucide icons, shared colors/form styles, shortcut metadata, command registry and history. The focused dialog uses local drafts; it does not dirty the project until Apply. Selected action has a checkmark, border and `aria-pressed`; invalid fields have text errors and `aria-invalid`. Initial focus enters Counts after the dialog opens. Native keyboard tests confirm Escape cancellation and protect text input from creation shortcuts. The existing sole Add set and Inspector duplicate entry points remain in place.

At 1366×768/default scale, the field measures **485 px**, above the approximately 470 px target; the new dialog does not add workspace chrome. Dark, light and high-contrast output was inspected. At a 1024×720 native window and 150% zoom, the modal scrolls internally; keyboard focus brings Apply into view and Cancel remains beside it. The top of the dialog can be scrolled back into view. There are no unresolved layout deviations. [Screenshots and local results](evidence/set-creation/README.md) record scope and limitations; full hosted Windows/macOS/Linux certification is owned by PR CI.
