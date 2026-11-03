# Live formations

Issue [#49](https://github.com/IanSzymanski/squidware/issues/49) adds persistent shape editing to the existing formation panel. Check **Keep editable on this set**, name the formation, and Apply. Reopen it from **Live formations → Edit** or Commands. Lines, arcs, circles, blocks and curves retain geometry, assignment and member slots after save/reopen. Formation metadata belongs to each picture, not a transition or personal template.

Field endpoint, bulge, width, depth, rotation and center handles use the same parameters as numeric entry. Preview leaves the production untouched. Apply commits the exact preview and its metadata as one named undo; Cancel/Escape keeps the saved formation. Name, membership and field-boundary errors block Apply. Existing detailed movement endpoint/hold constraints are revalidated before acceptance.

An individual position edit detaches only dots whose coordinates change. It leaves holes and keeps the other members in their original slots. Explicit **Detach selected/all** also keeps current dots. Undo restores coordinates and membership together, including a committed multi-frame drag; canceling a drag restores both. Cast removal removes that membership, and an empty shape disappears. Adding cast does not automatically join a shape.

**Members** previews explicit add/remove choices and redistributes everyone in that preview using the displayed assignment. **Redistribute members** closes holes without adding anyone. Geometry edits preserve slots, including block column changes; switching the assignment mode is an explicit reassignment. Membership is exclusive per picture. Conflicts name the other shape and require removing the member from the preview or Cancel followed by detaching its old membership. Nothing steals membership silently.

**Copy … to set** switches to the target picture and previews the same geometry, slots and cast IDs with a new formation ID. Cancel keeps both pictures. Duplicate set copies live metadata with fresh IDs; new/hold/insert-before pictures start with ordinary dots. Personal templates still capture anonymous reusable presets independently.

Files with live metadata write format v7; files without it retain the lowest required existing wire version. Canonical editor snapshots remain schema 2. Earlier wire versions cannot carry live metadata, and legacy conversion refuses to discard it. Read the [portable contract](../format/FORMAT.md#v7-live-formations) for bounds and invariants.

The implementation follows [design guidance](DESIGN_GUIDANCE.md) §§1–4: existing Inspector, NumberField, HelpButton, field handles, contextual Apply/Cancel and shared commands. The field remains the main workspace; membership uses a collapsed scrollable list. Numeric entry, keyboard buttons, focus help, dark/light/high-contrast themes and enlarged narrow-window layouts share the existing UI conventions. [Software validation policy](VALIDATION_POLICY.md) applies.
