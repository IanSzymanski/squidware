# Set-list review — #17

Reviewed 2026-10-28 against [design guidance](../../DESIGN_GUIDANCE.md) sections 1–5. [Navigation and reorder semantics](../../set-list.md) define absolute row numbers, search, final-position drops, opening timing and the destination-move policy. Captures and recorded fingerprints precede final documentation; the implementation PR records final-commit checks and hosted certification.

## Field priority and visual language

The [before capture](set-list-before.png) reuses the preceding score-map review at 1366 × 768 to show the old thumbnail cards. Its roster differs from the maximum fixture used below; it is a chrome comparison, not a performance comparison. The new [compact list](set-list-compact.png) uses 32 px rows and preserves the 485 px field at that same viewport, above the approximately 470 px target. Numbers/names use the available pane width; count/BPM columns retain 11 px text, names 12 px. Long names truncate with full names and timing in shared help, and the pane can be resized. No timeline lane or field toolbar row is added.

[Thumbnails](set-list-thumbnails.png) remain optional through a shared named toggle, persisted as personal preferences. The existing thumbnail owner explicitly opts in and continues to check localized invalidation and shared roster/colors/selection. The preference owner verifies the real choice across process restarts and reset. Compact mode avoids mounting the 128 thumbnail SVGs; no change to physical geometry is involved. The existing Set count indicator remains available, and the footer has one primary Add set action.

## Navigation, actions and persistence

The maximum fixture has 128 sets and 500 performers. [Search](set-list-search.png) retains absolute numbers, finds both Ballad names and navigates their first/last results with native keyboard input. An exact `040` jumps to set 40; [no-match feedback](set-list-empty.png), Escape and Show current provide recovery. The current row scrolls into view after selection and structural changes; a roving Tab stop avoids traversing 128 buttons to leave the panel.

[Direct reorder](set-list-reordered.png) moves set 40 to position 12 with one named history entry, pauses at its new arrival, and preserves its active identity through undo/redo. Invalid positions cannot apply. Native save/reopen compares the entire canonical project, including coordinates and move IDs. The owner also performs an intercepted Chromium native pointer drag through the real drag-start/over/drop path and Alt+Down through the row's key handler. Moving a different row preserves the selected picture. No synthetic click invokes the reorder command in place of that drag.

Source fixtures cover v1 migration and v2 first/middle/last reorders, move/path IDs, changed-source declarations, opening zero counts and former-opening 32-count timing. A maximum-size case moves another picture across the current picture and observes one atomic publication with the correct selected ID, clock count and history. Stale revisions/sessions, malformed/no-op targets and pending drafts/dialogs cannot mutate history. A musical anchor stranded by an opening reorder rejects the whole edit without changing playback or selection.

## Access, themes and enlarged views

The panel reuses HelpButton, shared preferences, command guards and theme tokens. Named inputs, visible focus, absolute row labels and textual count/tempo headers support keyboard and non-color use. [Dark](set-list-dark.png), [light](set-list-light.png) and [high contrast](set-list-high-contrast.png) were inspected. At [1120 × 768 and 125% scaling](set-list-1120-1.25.png), and [1024 × 720 and 150% scaling](set-list-1024-1.5.png), search, Move to, Add set and at least 64 CSS px of list remain reachable. The narrowest state uses the existing overlay pane; Escape restores the field. No design-guidance deviation remains.

## Recorded checks and failures

The [initial related run](initial-workflows.json) passed nine owners: thumbnails, set-creation, preferences, workspace, accessibility, timeline, rehearsal, score-map and production-sheet. It caught two failures: the new keyboard check sent End after screenshot capture had blurred its input, and the editor owner's production-count assertion found that the replacement panel lacked the shared count indicator. The test now explicitly refocuses before continuing keyboard input; the panel retains the count indicator. The [follow-up run](follow-up-workflows.json) passes set-list, editor and field. Across those runs all 12 affected owners passed; no field-size or geometry assertion was removed. [Set-list results](results.json) include the observed reference/enlarged metrics and five interaction groups.

The [post-merge main run](https://github.com/IanSzymanski/squidware/actions/runs/40765739502) passed source, Windows and Linux but exposed a macOS timeout after starting a native pan gesture. Inspection found that a passive gesture-retirement effect could run after the new tool's pointer-down, clearing that new gesture. Gesture retirement and project/orientation view reset now run before paint; a duplicate preview-clear callback was removed. The unchanged field owner and full editor formation/drag matrix pass with this lifecycle change. Hosted cross-platform results are recorded in the PR; local headless Linux evidence alone does not certify macOS timing.

Local host: Linux x64, Node 24.19.0, pnpm 11.25.0 and production Electron under Xvfb, with Chromium sandboxing retained. The new owner collected no renderer errors or unhandled rejections. These are software-host observations; no human or physical-device qualification is claimed under the maintained validation policy.
