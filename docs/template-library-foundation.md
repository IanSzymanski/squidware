# Template library foundation — #46

This is the first implementation slice of [#46](https://github.com/IanSzymanski/squidware/issues/46), reusable show templates and formation libraries. It provides a pure TypeScript import/export and preview boundary. The editor does not expose it yet; #46 remains open.

## Scope and ownership

All implementation and tests live in `src/templates/`. This slice adds no project schema, editor commands, dialogs, preferences, audio or timeline changes. It starts from main after #157 and deliberately avoids every file changed by the concurrent audio-alignment PR [#158](https://github.com/IanSzymanski/squidware/pull/158). Later integration must recheck the then-current PR and main state.

- `library.ts`: versioned library types, bounded untrusted JSON parsing, canonical validation and serialization.
- `production.ts`: capture anonymous ensemble defaults and create an independent new production.
- `formations.ts`: capture parametric shapes or selected dot pictures and calculate non-destructive previews.

## File contract, version 1

A library is JSON with `format: "squidware-template-library"`, `version: 1`, and `entries`. It is separate from `.squid` productions and personal preferences. Imports and exports allow at most 100 entries and 1 MiB of UTF-8 text. Each entry has an explicit user-supplied `name` and either `kind: "show"` or `kind: "formation"`. Duplicate names are permitted; names are display metadata, not identity keys.

Unknown properties are discarded at every level, including nested metadata. Corrupt JSON, unsupported versions, invalid dimensions, unsupported field presets, nonfinite numbers, invalid colors, count limits and invalid geometry are rejected before returning a library. No partial import is returned. Future versions require an explicit migration, never a silent downgrade.

### Show entries

Included fields are `name`, `field`, `openingTiming`, and `sections` with `name`, `color`, and `count`. Field dimensions/preset and section colors use the existing project validator. Section/performer limits and tempo limits follow the production contract. Total cast size can be 0–500.

Capture generates generic `Section 1`, `Section 2`, etc. Only an explicit `includeSectionNames: true` option preserves section names. Performer names, labels and identifiers are always excluded, along with production title/ensemble, set names/notes, audio bytes and paths, timing maps, rehearsal passages, selection groups and personal preferences. The template name is supplied independently rather than copied from the production.

Creating a production generates fresh project, section, performer and opening-set identities, empty performer names, generic `S1-1` labels and an in-bounds staging grid. It retains the blank-production title and starts with one opening picture, no moves, no recording and zero audio offset. The template's display name is not used as the production title. Inputs are neither mutated nor shared with the returned production.

Imported template and section names are intentional free text and can contain personal information. Unknown-field filtering is not a content scrubber: the future export UI must show included text and make the section-name option explicit.

### Formation entries

Included fields are `name`, `sourceCount`, `coordinateFrame: "yards-relative-center"` and `geometry`:

- `parametric`: supported `shape` (`line`, `arc`, `circle`, `block`, `curve`), `width`, `height`, `columns`. The recorded source count is informational; destinations regenerate for any explicit selection of 1–500 members using the existing formation engine and assignment behavior.
- `snapshot`: an array of relative `{x, y}` points with exactly `sourceCount` items. Capture centers the selected dots at their arithmetic mean. Points are sorted in local x/y order; identifiers, roster information and original field location are absent. Reapplication requires an exact member-count match rather than inventing, dropping or interpolating dots.

Both forms use physical yards in the existing field axes, independent of screen orientation and zoom. Placement supplies a new center, rotation and explicit positional/roster assignment. Parametric orientation is supplied at placement time; saved snapshots retain their captured orientation. Snapshot positional assignment sorts source performers along the placement's rotated local x/y axes, with stable identity tie-breaking. Explicit roster assignment uses the caller's ordered IDs. This is deterministic ordering, not assignment optimization or a clearance guarantee.

Preview requires an explicit, unique, nonempty selection. It returns the existing `FormationResult` contract: updates, complete preview positions, travel metrics, changed state and an error. Invalid data/counts/selections return no updates. Out-of-field geometry remains visible with a blocking error, without silently fitting the shape. Callers must check the error before applying. Unselected dots and performer identities are preserved. Discarding the pure result leaves the production/history untouched.

## Remaining integration

The following work is still required before #46 is complete:

- Personal library persistence and management outside production files, plus browser/native import/export.
- A template picker in New production and an export disclosure showing included text.
- Library browsing and field previews, synchronized numeric controls and accessible keyboard paths.
- Guarded editor preview sessions that invalidate on revision, selection or set changes and commit one named template action through the shared command layer.
- Rendered interaction, layout, theme and accessibility evidence for the new UI.

Do not wire the pure preview straight to a button with a captured result: revalidate session currency and selection before accepting it. Existing `positions.move` integration tests demonstrate that the calculated destinations can use the current undo/redo and project serialization machinery; they do not claim a delivered template UI or session lifecycle.

## Design guidance and validation

[Design guidance](DESIGN_GUIDANCE.md) sections 3 and 4 inform explicit selection, non-destructive previews, explanatory failures and separation of personal content from productions. Existing generation, assignment, geometry validation and project serialization are reused. This slice changes no visible controls, gestures, layout, theme or user-facing output, so rendered before/after screenshots and viewport review are not applicable. They remain required for UI integration.

`src/templates/library.test.ts` and `src/templates/formations.test.ts` cover mixed and empty library round-trips, corrupt/newer files, UTF-8 size and collection limits, malformed defaults/geometry, privacy filtering, fresh identities, empty/single/500-member casts, all five parametric shapes at different counts, snapshot capture/reload, selection and field boundaries, assignment and unrelated-dot preservation. Integration with the existing editor store verifies preview purity, one accepted edit, undo/redo and `.squid` reload compatibility.
