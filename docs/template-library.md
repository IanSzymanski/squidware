# Show templates and formation library — #46

Use **Project menu → Templates** to save ensemble setups, selected dot pictures and reusable parametric shapes. Import or export `.squidlib` files, rename/remove personal entries, and preview saved formations before applying them. **New production** includes a saved ensemble setup picker. This implements [#46](https://github.com/IanSzymanski/squidware/issues/46).

## Scope and ownership

The initial pure library core was isolated from concurrent audio-alignment PR #158. Editor/native integration follows its merge into main. There is no new `.squid` schema and no change to musical timing or audio alignment.

- `library.ts`: versioned library types, bounded untrusted JSON parsing, canonical validation and serialization.
- `production.ts`: capture anonymous ensemble defaults and create an independent new production.
- `formations.ts`: capture parametric shapes or selected dot pictures and calculate non-destructive previews.
- `storage.ts` and `editor/useTemplateLibrary.ts`: browser persistence and shared personal-library state, separate from production history.
- `editor/TemplatesPanel.tsx`, `NewProductionPanel.tsx` and `templateReview.ts`: capture/disclosure, browsing, placement and guarded acceptance.
- `electron/template-library-service.cjs`: bounded native storage with serialized atomic writes; the native codec is generated from the same validator used by the renderer.

Desktop libraries live in the application's user-data directory as `template-library.json`. Browser previews use `squidware.templates.v1` in local storage. Both retain unreadable/newer data untouched and block writes with an actionable message. Storage failures retain the prior durable content and expose retryable errors. Concurrent changes on disk/in another browser tab reject stale writes rather than overwriting them; reload/restart to load those changes. Native shutdown drains pending library writes. Neither a library edit nor export changes project save status, recovery, history or the current `.squid` destination.

## File contract, version 1

A library is JSON with `format: "squidware-template-library"`, `version: 1`, and `entries`. It is separate from `.squid` productions and personal preferences. Imports and exports allow at most 100 entries and 1 MiB of UTF-8 text. Each entry has an explicit user-supplied `name` and either `kind: "show"` or `kind: "formation"`. Duplicate names are permitted; names are display metadata, not identity keys.

Unknown properties are discarded at every level, including nested metadata. Corrupt JSON, unsupported versions, invalid dimensions, unsupported field presets, nonfinite numbers, invalid colors, count limits and invalid geometry are rejected before returning a library. No partial import is returned. Future versions require an explicit migration, never a silent downgrade.

### Show entries

Included fields are `name`, `field`, `openingTiming`, and `sections` with `name`, `color`, and `count`. Field dimensions/preset and section colors use the existing project validator. Section/performer limits and tempo limits follow the production contract. Total cast size can be 0–500. See [the example library](../format/examples/template-library-v1.squidlib).

Capture generates generic `Section 1`, `Section 2`, etc. Only an explicit `includeSectionNames: true` option preserves section names. Performer names, labels and identifiers are always excluded, along with production title/ensemble, set names/notes, audio bytes and paths, timing maps, rehearsal passages, selection groups and personal preferences. The template name is supplied independently rather than copied from the production.

Creating a production generates fresh project, section, performer and opening-set identities, empty performer names, generic `S1-1` labels and an in-bounds staging grid. It retains the blank-production title and starts with one opening picture, no moves, no recording and zero audio offset. The template's display name is not used as the production title. Inputs are neither mutated nor shared with the returned production.

Imported template and section names are intentional free text and can contain personal information. Unknown-field filtering is not a content scrubber. Capture has an explicit section-name checkbox and a summary of included fields; export lists every included template and section name before the file dialog/download. Import validates first and previews the incoming names/counts; acceptance appends the whole imported library atomically without replacing existing entries. Duplicate names remain separate entries.

### Formation entries

Included fields are `name`, `sourceCount`, `coordinateFrame: "yards-relative-center"` and `geometry`:

- `parametric`: supported `shape` (`line`, `arc`, `circle`, `block`, `curve`), `width`, `height`, `columns`. The recorded source count is informational; destinations regenerate for any explicit selection of 1–500 members using the existing formation engine and assignment behavior.
- `snapshot`: an array of relative `{x, y}` points with exactly `sourceCount` items. Capture centers the selected dots at their arithmetic mean. Points are sorted in local x/y order; identifiers, roster information and original field location are absent. Reapplication requires an exact member-count match rather than inventing, dropping or interpolating dots.

Both forms use physical yards in the existing field axes, independent of screen orientation and zoom. Placement supplies a new center, rotation and explicit positional/roster assignment. Parametric orientation is supplied at placement time; saved snapshots retain their captured orientation. Snapshot positional assignment sorts source performers along rotated local x/y axes, with stable identity tie-breaking. The dialog freezes assignment orientation while moving or rotating the preview; changing assignment mode explicitly recalculates it. Block column changes recompute rows using that frozen orientation. Explicit Cast assignment uses production roster order. This is deterministic ordering, not assignment optimization or a clearance guarantee.

Preview requires an explicit, unique, nonempty selection. It returns the existing `FormationResult` contract: updates, complete preview positions, travel metrics, changed state and an error. Invalid data/counts/selections return no updates. Out-of-field geometry remains visible with a blocking error, without silently fitting the shape. Unselected dots and performer identities are preserved. Discarding the pure result leaves the production/history untouched.

## Editing and acceptance

The modal preview uses the shared field artwork and exact destination geometry. Dashed lines and total/longest travel explain the move. Numeric center, rotation, dimensions and assignment controls update the same preview. The center handle supports pointer drag, arrows (1 yd) and Shift+arrows (0.1 yd); handle moves follow current field snapping. Numeric placement stays exact. It uses fixed physical field axes with the audience at the bottom, independent of main-field display orientation.

`templates.apply` rechecks the reviewed revision, project epoch, active set, selection in Cast order, pause/arrival, transaction, file operation, active dialog and pending input. It then recomputes/validates the exact reviewed destinations and creates one named undo action. Stale, invalid and no-op reviews cannot apply. Choose the entry again to refresh a stale review. Other pictures, cast metadata, move timing and audio anchors remain intact; save/reopen stores ordinary dot positions using the existing codec.

Cancel, Escape outside a numeric input, the close action and backdrop dismissal discard the local preview. Numeric Escape first restores that field's draft. Closing an incomplete preview clears its draft guards. The preview is not added to recovery or exported projects. Library additions, renames and removals are separate explicit personal-storage operations, not production undo actions.

Show setups create new productions using the existing New production replacement guard. The preview summarizes anonymous roster counts and field defaults; Cancel keeps the current production. Unsaved work receives the same explicit replacement choice as blank/demo creation. New productions begin a fresh history; setups are not roster-replacement operations on an existing production. Persistent live formations remain owned by #49.

## Design guidance and validation

[Design guidance](DESIGN_GUIDANCE.md) sections 1–5 apply. Templates use existing Modal, HelpButton/tooltip, NumberField, command/history, field artwork and theme tokens. No persistent field/timeline area is added; desktop/modal layouts retain keyboard-reachable actions and the normal field workspace geometry. [Rendered evidence](evidence/templates/README.md) records before/after views, supported themes, 150% layout, preview/cancel/undo, native file IO and restart behavior. Human signoff and physical-device qualification are not gates under the validation policy.

`src/templates/*.test.ts` and `src/editor/templateReview.test.ts` cover mixed/empty round-trips, corrupt/newer files, UTF-8/collection limits, malformed defaults/geometry, privacy, fresh identities, empty/single/500-member casts, all five shapes at different counts, snapshot reload, field boundaries, frozen assignment and selection preservation. Store tests cover stale review guards, one undoable action, reload and aligned-recording retention. Native service/IPC tests cover fixed destinations, sender checks, bounded reads, corruption preservation, concurrent edits and failed-write retry. `pnpm test:templates` adds real native interaction, file dialogs and process restart; it is registered in the cross-platform desktop matrix.
