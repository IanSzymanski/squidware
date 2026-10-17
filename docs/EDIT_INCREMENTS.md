# Editing increments

Implements [#67](https://github.com/IanSzymanski/squidware/issues/67), following the configurable grids in [PR #130](https://github.com/IanSzymanski/squidware/pull/130). Field Alt-arrow keys, global Alt-arrow keys, Inspector move buttons and typed clients all call `selection.nudge`. The command resolves selection, normal/fast amount, orientation, production snapping and field bounds once. Field2D retains pointer previews but no longer calculates keyboard destinations.

## Personal choices

In Preferences, **Editing increments** offers:

- Normal and fast nudge amounts, in yards (the backward-compatible default) or full production steps. A step is `5 / grid.steps` yards, so 6-to-5 and 12-to-5 show settings affect step-based requests. Half/quarter subdivision changes snap targets, not the meaning of a full step.
- Rotation preset size, 0.1–180 degrees, default 15 degrees.
- Scale preset size, 0.1–99 percent, default 10 percent. Compression always leaves a positive scale.

Choices persist on this device and never change saved production data or mark it dirty. Opening another production retains personal increments while resolving step units from that show's grid. Missing choices in older preference files retain the previous yard-based amounts and 15-degree/10-percent presets. Invalid or unsupported values follow the existing preference recovery policy.

## Input, preview and history

Plain field arrows navigate focus. Alt+arrows moves the explicit selection; Shift+Alt uses the fast amount. Normal move-button clicks use the normal amount; Shift-click uses the fast amount. Keyboard directions follow the displayed field. Inspector labels retain their physical field meaning, with icons rotated for a flipped view; typed clients can explicitly request field-relative direction. Current amounts, units, physical distances and snap mode appear in help/tooltips.

Field handlers consume their events and global handling also honors `defaultPrevented`. Text inputs, textareas, selects, contenteditable fields, IME composition and open dialogs retain their own keys. Empty selections, incomplete production drafts, playback, between-set inspection, active previews and unrelated transactions cannot nudge. A held key executes one command per key-down/auto-repeat event, with one named undo entry per accepted step. A blocked or boundary no-op creates no history. At an off-grid rigid-group boundary, further nudges stay still rather than alternating backward to the grid.

Rotation and scale buttons call `selection.increment`, which reads the configured amount and opens the existing exact transform preview. Apply commits one named edit; Cancel keeps original coordinates. Invalid/out-of-field results retain the existing rejection. Changing personal increments does not rewrite a preview already being reviewed. Command metadata exposes both entry points for the future command palette; this feature adds no palette or new rotation shortcut.

## Design and validation

Applies [design guidance](DESIGN_GUIDANCE.md) sections 1–5: shared labeled NumberFields, Preferences, toolbar/Inspector buttons and tooltips; explicit selection, field focus navigation, typed commands and existing Apply/Cancel/undo. No field-size or project-schema change is introduced. Text/help is inspected at 1366×768, enlarged UI and narrow windows with native screenshots. Theme switching and physical writer/device qualification retain their separate owners.

`src/editor/editIncrements.test.ts` covers units on all three step sizes, normal/fast amounts, physical/screen direction parity, repeated requests/history, rigid boundaries, empty/locked states, invalid preferences/arguments, metadata and configured transform previews. `scripts/nudge-qa.cjs` runs under the field owner and uses trusted native key events, auto-repeat modifiers and native button clicks to compare actual entry points, input/navigation behavior, preview/undo and the off-grid boundary case. Preferences QA verifies unit/rotation/scale choices across fresh desktop processes and keeps the current show unchanged. Existing editor/accessibility/playback checks retain their responsibilities.
