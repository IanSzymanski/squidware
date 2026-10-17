# Personal preferences

Open **Project menu → Preferences**. Changes apply and save automatically on this device; **Done** also flushes committed choices. Number fields commit on blur or Enter. Escape cancels a numeric draft. Invalid preferences remain visible until corrected or canceled, and these drafts never mark a production as unsaved.

## Persistence policy

Desktop preferences live in a fixed `preferences.json` in Electron's application data directory. The sandboxed renderer has three fixed methods: read, save and reset. Main verifies the sender, canonicalizes each record, and uses the same atomic temporary-file/rename writer as project saves. Saves are ordered; normal quit waits for accepted preference writes to finish. Changes within one UI event coalesce before submission. Forced process termination can interrupt an outstanding write; the previous complete file remains available.

Browser preview uses `squidware.preferences.v1` in localStorage. Its preferences are specific to that browser profile. Storage errors are shown in Preferences with Retry save and Reset defaults. Choices remain usable in memory when a save fails.

Persisted choices:

| Choice | Default / limits |
| --- | --- |
| Panel layout; field view | Comfortable; 2D |
| Labels; previous paths; grid visibility; snap | On; off; on; on |
| New production placement defaults | 8-to-5, whole steps, grid targets, keep spacing; 6/12-to-5, half/quarter steps, markings and individual mode also available |
| Field zoom | 1×; 0.6–3× |
| Audience orientation | Bottom; top turns the 2D view 180° |
| Dot radius; label size | 3 / 12 CSS px; 2–8 / 11–24 px |
| Label visibility | All; selected/focused or hidden also persist from the toolbar |
| Performer coloring; custom color | Section colors; selection groups or custom RGB (`#B9ED85`) |
| Formation tool kind | Arc; line, arc, circle, block or curve |
| Formation width, depth, rotation, columns | 45 yd, 22 yd, 0°, 8; 1–95 yd, 1–48 yd, −180–180°, 1–500 whole columns |
| Normal / fast keyboard nudge | 0.625 / 2.5 yd; 0.125–5 / 0.125–10 yd |
| Coordinate description decimals | 2; 0, 1 or 2 |
| Paper; rehearsal packet | Letter landscape; field charts; A4 and coordinate sheets also available |
| Geometric review spacing / stride | 1 yd / 1.25 yd per count; each 0.1–5 |

Toolbar changes to the persisted view, toggles, zoom and selected formation kind update the same settings. Formation defaults seed each shape's parameters on first use; subsequent shape edits are independent session drafts. They change positions only when Apply formation is used. Coordinate precision changes descriptions in the field, Cast, Inspector, coordinate sheets and CSV; it does not round project geometry or alter the CSV's numeric-coordinate columns.

See [2D field display](FIELD_DISPLAY.md) for orientation, sizing and coloring. These choices do not change project coordinates, print/SVG geometry or the 3D camera. Flipped dragging and keyboard arrows follow the screen; Inspector directions retain their field meaning.

Production cast, positions, field markings, movement counts/tempo/easing, notes, audio offset and optional placement rules stay in the project. The grid toggle controls visibility; the magnet enables the production's snapping rules. Personal placement defaults seed only newly created productions and never override opened shows. Files without rules use 8-to-5 whole steps with rigid anchor snapping. See [Grid and group snapping](GRID_SNAPPING.md). Meter and shared review rules remain separate future features.

Selection, active set, workspace, search, pointer hover, drag/pan previews, playback count, speed/loop, audio attachment, undo history, draft text and file destinations are excluded.

## Versions, recovery and reset

The canonical preference format is version 1. Partial unversioned/version-0 files migrate by filling missing choices with defaults. Unknown keys are dropped from the canonical record. Known enums, booleans, finite numeric bounds and whole column counts are validated. Reads are limited to 32 KiB; records are limited to 64 fields.

Missing files use defaults. Corrupt or invalid files show a diagnostic and use defaults for the session. Older/corrupt originals are copied to a uniquely named `preferences-preserved-*.json` before a successful replacement. Newer/unsupported versions remain read-only until an explicit reset or app update. Reset writes defaults and preserves the preceding file. Reset failure leaves current choices in place. Preserved files are never automatically removed by this feature. Browser preservation uses the single `squidware.preferences.v1.preserved` key.

## Validation evidence

Local Windows production build, October 13, 2026:

- 197 app tests, including codec bounds/migration, unavailable storage and retry, startup edits, queued save/reset changes, reverting a value during a write, transient exclusion and unchanged serialized projects.
- 45 native/recovery/release tests, including fixed preference IPC destinations, sender validation, original preservation, newer-version reset, ordered writes and allowlisted PDF paper sizes.
- Four isolated desktop launches: actual preference UI changes, invalid-draft cancel, original project comparison and Save As, a different production's field/timing/audio settings, persisted layout/toggles/zoom/increments/formation/display/paper/thresholds, real keyboard nudge, A4/Letter PDF dimensions, reset/restart and normal quit during a deliberately delayed atomic replacement.
- Preferences text-size/contrast audit and screenshot inspection. Desktop artifacts are in `.qa/preferences/`.

The CI workflow runs the preference restart check under Linux/Xvfb as well. Local evidence does not claim macOS device qualification or exhaustive print layout coverage; the broader cross-platform/print acceptance remains tracked in #69.

