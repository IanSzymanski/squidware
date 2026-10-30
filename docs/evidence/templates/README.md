# Templates — rendered review and validation

Scope: #46; PR #159 follows merged audio-alignment PR #158. The delivered dialog covers personal library storage, anonymous show setups, parametric and snapshot formations, guarded previews, library IO and management. It does not persist live formation objects (#49).

## Design review

Applicable [design guidance](../../DESIGN_GUIDANCE.md): sections 1–5. Entry points reuse the Project menu, formation panel and command palette. Existing Modal, HelpButton/tooltip, NumberField, theme tokens, field artwork, generation/assignment, project validator and history are reused. No new fixed workspace lane or panel is added.

- Before: [New production without templates](new-production-before.png), 1366 × 768. This capture uses the pre-integration renderer built at `d756c6e` / content hash `3df994dc202b…`; native library handlers were present but no template UI was in that renderer.
- After: [saved setup picker](templates-new-production.png), [capture and privacy disclosure](templates-capture-show.png), [empty library](templates-empty.png), [snapshot placement](templates-snapshot-preview.png) and [export disclosure](templates-export-review.png).
- [Dark](templates-dark.png), [light](templates-light.png) and [high contrast](templates-high-contrast.png) use shared surface/text/focus tokens. Selection has a ring and selected library entries have a heavier border; errors include text and block acceptance.
- [Count mismatch](templates-count-error.png) and [field boundary](templates-boundary-error.png) explain why Apply is unavailable. Entry selection refreshes a stale review. There is no implicit full-ensemble selection.
- [1024 × 720 at 150% UI scale](templates-enlarged.png) collapses the library and placement layout without horizontal dialog overflow. The dialog scrolls; Apply remains keyboard-reachable in the viewport. Numeric Escape restores a draft; dialog close/Cancel discards it and clears the input guards. [Browser invalid input](browser-invalid-input.png) records the incomplete-number state.
- [Restarted native library](templates-restarted.png) verifies that the durable library remains available after a new Electron process, independently of the startup Recovery choice.

Screenshot inspection initially found a narrow default dialog that put placement controls and Apply below the fold. The final layout widens the modal at laptop size and puts the field preview beside its numeric controls. At enlarged/narrow sizes it uses a single-column, scrollable layout and sticky Apply area. The normal field remains 485 px high at 1366 × 768/default scale, exceeding the approximate 470 px design target. The reported 270 px field behind the modal at 150% scale reflects the existing enlarged workspace; the dialog does not consume persistent field area. No unresolved change to physical geometry or workspace layout is introduced.

## Interaction and persistence evidence

`pnpm test:templates` uses real native pointer/keyboard input, software-rendered Electron, controlled OS file dialogs and an isolated application profile. It tests:

- Menu/keyboard New production, privacy-safe defaults, preview, unsaved replacement cancellation and fresh identities.
- Snapshot/parametric capture; preview/cancel purity; explicit Apply; selected-dot-only changes; named undo/redo and native `.squid` save.
- Stale selection, mismatched counts and field overflow; frozen assignment through rotation; pointer/keyboard/numeric center agreement and current snapping.
- Export disclosure/cancel, newer-version rejection without partial import, import review/cancel/append, rename and removal without production/history/save-destination changes.
- Supported themes, enlarged layout, focus, disabled explanations and an independent native process restart.

[Native results](results.json), [restart result](restart.json) and [run provenance](run.json) retain the source hash used for the captures and behavior run. Later evidence/documentation copies are not represented as the same captured source. [Related desktop suites](related-workflows.json) record checks on shared editor, commands, preferences, accessibility and startup behavior. [Browser results](browser-results.json) record production Chromium import/download/reload, invalid-preview cancellation and denied-storage behavior in isolated contexts. Full codec/member-count/size matrices and native storage fault injection are owned by source/native tests rather than duplicated in the UI suite.

Host: Linux software runtime; Electron hardware acceleration disabled for this suite, Chromium sandbox retained. Main fixture: 64 performers, six pictures; selection/application uses eight and sixteen members. Source tests also cover empty/single/500-member setups and all five parametric shapes at 1/2/64/500 members. No physical-device, human-usability or other-platform pass is inferred. The registered desktop suite also runs in hosted Windows/macOS/Linux CI; hosted results remain separate from these local artifacts.

The shared subprocess log-capture test initially failed inside the command sandbox because it dropped child stdout/stderr. The full native checks pass outside that command sandbox, with Chromium sandboxing retained for GUI checks. No application or harness behavior was weakened to accommodate it. Early UI harness attempts were corrected to wait for file-dialog readiness and dismiss the existing startup Recovery choice before opening Templates; passing reports are from subsequent complete runs.
