# Schema v2 integration verification

Issue #5 integrates the format foundation from PR #103 into the canonical editor project. The parser accepts v1/v2, the editor operates on v2 and the serializer writes v2. Native file validation bundles the same TypeScript codec rather than maintaining a second format validator.

## Repeatable checks

- `pnpm test`: 151 checks cover the domain, immutable edit validation, limits, editor store, format codec and v2 integration. The frozen v1 engine compares actual v2 samples/time conversions at boundaries and mid-move, collision/stride output and CSV bytes. Pinned small fixtures, the bundled demonstration, a single opening picture, the 500-performer × 128-picture fixture, UTF-8 boundaries, corrupt files and newer formats are covered.
- `pnpm test:desktop`: 16 checks use the actual native file handlers with controlled dialogs and real temporary files. They cover v1/v2 opens, v2 saves, BOM input, invalid endpoints, unsupported paths, future formats, preserved save destinations, canceled dialogs, failed atomic replacement, trust boundaries and file limits.
- `pnpm test:editor`: 17 production Electron checks use the real isolated preload and native bridge. The initial boundary fixture is v1; the workflow opens it, commits counts/tempo/formation edits, exercises native undo/redo and playback, exports CSV/SVG, saves v2 and reopens it. It also covers numeric drafts, locked previews, keyboard/pointer coordinates and a single-picture v2 show. Every saved picture remains separate from its incoming move timing.
- `pnpm test:3d`: demo and maximum fixtures retain demand-driven rendering, context/buffer reuse, camera/quality behavior, playback and usable 2D recovery after context loss with the v2 project model.
- TypeScript, production renderer build, dependency notices and 11 release-planning/publication regressions remain required.

The command tests preserve move IDs through timing edits, insertion, middle deletion and reorder; verify documented opening-picture removal/reorder timing; resize explicit line segment partitions without changing segment IDs; and restore the identity graph through undo/redo. Roster removal prunes paths and positions, while additions use implicit lines. Print output derives count/BPM values from moves and preserves picture notes. Legacy and v2 recovery payloads migrate through the canonical reader; unsupported recovery content is retained with diagnostics.

## Scope boundaries

Paths currently support one straight segment per explicit performer path, or implicit straight travel from endpoint pictures. Curved/hold/follow-the-leader paths and multiple segments remain rejected until their separately planned features supply compatible sampling, editing and analysis.

This change preserves the existing recovery storage key and history behavior so prior projects remain discoverable. Named transactions, asynchronous recovery and explicit save-status tracking remain #6, #7 and #38. Broader native-platform/device/writer qualification, rendered PDF acceptance and signed distribution remain their own release gates; these format checks do not fulfill those issues.
