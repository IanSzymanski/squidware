# Editing increments evidence

Implementation: `290b514d24f8698fc21943d6300149b8031d8368`, for [#67](https://github.com/IanSzymanski/squidware/issues/67). See [behavior and validation owners](../../EDIT_INCREMENTS.md).

The Windows runs recorded in [validation.json](validation.json) pass 301 source tests, 17 contract tests, 51 native tests, and the field, preferences, editor, accessibility and playback workflows. Each desktop run retains its own source identity. Both builds have the same application output hash. The initial field run failed during screenshot setup when its helper queried a menu before it mounted; adding an explicit menu-available wait allowed the complete field suite to pass. This does not claim physical-device/writer acceptance or macOS/Linux validation.

Applicable design guidance: sections 1–5. This change reuses the existing Preferences dialog, NumberFields, shared tooltips/buttons, field navigation, command registry, transform preview and undo. It adds no workspace layout or field-size change. Theme switching remains owned by #43; writer and school-hardware qualification remain #64/#3. The field retains the established laptop layout; no new deviation from the audit layout target is introduced.

Native input evidence compares typed command, field/global Alt-arrows, normal/Shift-click buttons and flipped-field directions. Trusted held-key events execute once per key-down; input fields and plain focus-navigation arrows retain their keys. Empty selections, drafts, active previews and playback reject editing. Boundary no-ops preserve history. Preference choices survive fresh desktop processes without altering saved production data. Existing save/reopen, preview/cancel/apply/undo, accessibility and playback owners passed.

Screenshots were visually inspected at 1366×768, 1120×768 and 125% UI zoom. New controls remain reachable and step-based field help stays separate from other field information.

- [Default increments before configuration](increments-before.png)
- [Configured 30-degree rotation preview](increments-rotation.png)
- [Configured 25-percent scale preview](increments-scale.png)
- [Editing preferences, 1366×768](increments-preferences.png)
- [Editing preferences, 125% UI zoom](increments-preferences-enlarged.png)
- [Editing preferences, 1120×768](increments-preferences-narrow.png)
- [Step-based field help, 1120×768](increments-field-narrow.png)
