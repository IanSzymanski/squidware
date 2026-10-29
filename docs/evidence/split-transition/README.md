# Transition splitting — #24

## Delivered behavior

Inspector Set properties and the Command palette open one sampled split review. Whole interior counts insert every engine-sampled performer position, divide counts/paths, retain tempo and total duration, remap valid rehearsal anchors and commit one named undo action. Linear movement is unchanged throughout the show. The current easing model cannot be partitioned exactly; the review explicitly shows and requires accepting two constant-speed parts, their speed change and the largest position difference. Changing the split count clears acknowledgment. No persisted field is added. See [the policy](../../split-transition.md).

## Design guidance sections 1–5

- Field priority: the action lives in the existing collapsible Set properties section. The 1366×768 workspace keeps a measured **485 px** field, above the approximately 470 px target. A modal review adds no persistent panel or transport height.
- Shared visual language: existing Modal, FieldDrawing, HelpButton, Lucide Scissors, theme variables, tabular counts and standard form/action styles. Text, warnings and acknowledgment explain the easing change independently of color.
- Predictable editing: preview is a separate project, with no history or geometry changes until Apply. Cancel/Escape is inert. Buttons and palette share the command; successful application pauses at the inserted picture. Revision/session guards reject old previews. Existing annotations and valid bookmark counts survive the split.
- Access/state: named count/range/checkbox inputs, initial focus, native range arrows and Tab/Enter application, visible count errors and an unavailable action reason. Both parts require at least one count. The easing acknowledgment resets after count edits. Dark/light/high-contrast and 1120×768 at 125% / 1024×720 at 150% retain scroll and keyboard access to the actions.
- Render review: before/after workspace captures, linear and eased comparisons, three themes and enlarged layouts are retained here. The review uses a scrollable existing Modal: the longer easing explanation and acceptance may require scrolling at default size; native Tab reaches the actions. This is a documented use of the established modal rather than a loss of field area.

## Validation and limits

Source coverage compares every performer and the clock across the entire linear show in 1/8-count steps; eased fixtures compare the exact split picture, stable clock and an independent dense scan of maximum displacement. Explicit path identities, directions, annotations, fractional rehearsal anchors, count boundaries, v1 migration, stale revisions/sessions, pending edits, one-count remainders, 1024-count moves, undo/redo and save/reopen are covered.

`initial-workflows.json` records the initial Linux production interaction pass. `related-workflows.json` records all seven related desktop owners passing: set-creation, set-list, rehearsal, score-map, production-sheet, timeline and commands. The new suite checks real count input, palette and Tab/Enter Apply, pointer acknowledgment, engine-sampled SVG geometry, native save/reopen, 500 performers in the final available set slot, themes and enlarged layouts. `final-workflows.json` records the final pass, including native comparison-slider arrows and enlarged Tab traversal. All 569 source tests, published contracts and the production build passed again after these checks were added.

The local host is Linux x64, Node 24.19.0, Electron 44.7.0 with software rendering under Xvfb. The host cannot configure Chromium's setuid helper, so local interaction runs set `ELECTRON_DISABLE_SANDBOX=1`; this is recorded in the new suite's result and does **not** certify sandbox boundaries or cross-platform packages. Hosted CI uses its configured sandbox and all registered suites on Windows/macOS/Linux. Source tests, published contracts and all 62 native boundary/harness tests passed locally. Hosted CI status must be checked separately; no human or physical-hardware gate is claimed.

Captures and local interaction reports precede final documentation. Final source certification belongs to the PR's exact commit; these retained local runs are targeted development evidence.
