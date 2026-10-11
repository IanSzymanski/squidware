# Squidware roadmap

Squidware 0.1 is a working desktop foundation for cast-to-chart drill design. It covers 2D placement, basic formations, 3D rehearsal markers, count-based playback, local project files, and rehearsal exports. It is not a complete substitute for every mature Pyware workflow.

The priorities below are proposed development areas, not shipped features or delivery promises. Each should retain editable project compatibility, predictable undo/redo, and useful automated and interactive checks.

## 1. Strengthen the daily desktop workflow

- Add broader regression coverage for pointer gestures, keyboard focus, native save dialogs, playback, and PDF layout.
- Verify releases on Windows, macOS, and Linux, with accessibility and lower-performance graphics devices included in the review.
- Add configurable recovery history and a recent-project list, with explicit recovery decisions when multiple versions exist.
- Bundle or reference audio in portable project packages so reopening does not require manually reattaching a recording.
- Add configurable print styles, coordinate precision, page templates, and robust pagination for long productions.
- Improve large-cast performance and report tested performer/set sizes instead of relying only on schema limits.
- Add signed release builds and an update workflow once distribution infrastructure is available.

**Ready when:** the common create, edit, save, reopen, rehearse, and export workflows have repeatable tests on each supported platform and produce consistent printed output.

## 2. Curved travel and detailed timing

- Add editable per-performer paths with curves and intermediate control points.
- Support holds and submoves within a transition, with explicit arrival and departure counts.
- Show editable path handles, distances, and count ticks directly on the field.
- Extend minimum-spacing and stride analysis to curved paths and independently timed moves.
- Define consistent behavior for resizing move counts, reversing moves, and copying path segments.

**Ready when:** playback, coordinate previews, timing changes, undo, and collision checks agree on the same path model. A curve visible in the editor must be the curve used for movement and analysis.

## 3. Performer assignment and spacing tools

- Offer optional assignment optimization for selected performers and formation destinations.
- Preserve pinned assignments, sections, ordering constraints, and instrument/role restrictions.
- Compare travel distance, crossings, and step demand before applying a proposed assignment.
- Add spacing guides, interval controls, alignment, distribution, and richer formation handles.
- Support reusable formations and controlled transitions between them.

**Ready when:** the designer can preview, compare, accept, and undo a suggested assignment without losing performer identity or unintentionally changing other sets. Optimization must explain which constraints it uses.

## 4. Props, staging, and visual planning

- Add props and equipment with footprints, orientation, movement, and visibility by set.
- Support stages, indoor floors, custom field sizes, backgrounds, and non-football coordinate systems through the user interface.
- Add performer facing, richer instrument/guard representations, and optional costume color schemes.
- Extend clearance checks to configured performer and prop footprints.
- Add saved cameras and renderable rehearsal/video previews with explicit quality settings.

**Ready when:** staging objects have a clear schema and edit workflow, remain consistent between 2D and 3D, and do not imply more accurate physical simulation than is actually implemented.

## 5. Teaching and rehearsal delivery

- Add rehearsal annotations, bookmarks, count ranges, and sectional playback.
- Provide performer-focused playback and a portable read-only viewer.
- Create mobile-friendly dot books and configurable drill packet layouts.
- Support rehearsal revisions with change comparisons and revision labels.
- Investigate documented interchange formats and importers for user-provided data with clear licensing and compatibility boundaries.

**Ready when:** an instructor can identify a revision, distribute the intended version, and trace a performer's movement across both printed and digital materials.

## 6. Optional cloud collaboration

- Keep local files and offline editing fully usable.
- Add optional project sync, named versions, and conflict handling.
- Define owner, editor, and viewer roles before sharing mutations between users.
- Support review comments and concurrent edits only after a clear merge and recovery model exists.
- Define storage, authentication, deletion, export, and privacy behavior in the product and documentation.

**Ready when:** users understand what leaves the device, can recover conflicting edits, and can continue using their local productions without the service.

## Compatibility commitments

The `.squid` format is versioned JSON. Future schema changes should include migration tests and actionable messages when a newer file cannot be opened. Proprietary Pyware import/export is not currently implemented and should not be advertised without a supported, validated compatibility path.

Feature requests should describe an actual design or rehearsal task, an example production size, the expected result, and the current obstacle. This keeps development focused on dependable tools rather than a checklist of names.
