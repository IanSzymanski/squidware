# Squidware UI/UX audit, 2026-11-05

Scope: current `main` at `3299175` (after #172), run as the Vite browser build at 1366 × 768 (the [design guidance](../../DESIGN_GUIDANCE.md) target), plus 1920 × 1080, 1024 × 700, 900 × 650, UI scale 150%, and light/high-contrast themes. Evidence is rendered screenshots, DOM measurements and source inspection. Electron-only behavior (native menus, save dialogs, OS file pickers) was not exercised.

## Verdict

Feature depth has outgrown the information architecture. Each feature since #160 landed as a correct, well-previewed tool, but most were added as another `…` button in the Inspector that opens a modal with its own mini field. The result: the field is smaller than the guide's target, the Inspector is a launcher list, and the newest tools no longer follow the inline-preview pattern that Shape, Rotate and Place established.

The fix is not a redesign. Five changes recover most of the lost ground:

1. **Give the field its space back.** Remove the permanent keyboard-hint line, the duplicate snap strip and the overlaid chip bar from the field area (findings 3, 7).
2. **Move spatial editors out of modals.** Rebuild Draw path, Shared routes, Move operations and Movement timing on the docked preview pattern the formation tools already use (finding 2).
3. **Turn the Inspector launcher stack into a contextual section.** Show path/timing tools when their selection rules are met, styled and disabled consistently (finding 1).
4. **Make the demo a clean first impression.** No 400-problem badge, and no "unsaved changes" state for an untouched demo (finding 4).
5. **Add real responsive breakpoints.** Make them aware of UI scale, so 150% scale or a 1024 px window doesn't hide the field (finding 5).

## What works

These patterns are solid and should be the template for new work:

- **Preview, then Apply or Cancel**, with named undo entries.
- **The playback lock banner**, which explains why editing is blocked and offers "Go to set 4".
- **Accessible names on every control.** All 121 visible buttons have accessible names, and dark-theme text passes 4.5:1 everywhere sampled.
- **Section chips with live counts and a checked state.**
- **The empty Cast state** for a blank production.
- **Three working themes.**

## Findings

Severity: **P1** misleads users or blocks core work at supported sizes. **P2** is recurring friction. **P3** is polish.

### P1

**1. The Inspector has become a launcher stack.** With nothing selected, the Inspector shows 6 transform buttons, then 5 free-floating `…` buttons (Shared routes, Edit performer path, Draw performer path, Edit movement timing, Move operations), then Formation tools, which holds 3 more launchers (Saved formations, Group route movement, Formation transition), then Set properties, Transition check, Show-wide problems and Analysis rules.

- **Inconsistent layout.** The launcher pills have ragged widths and sit flush against the panel's left border with no section padding (`EditorInspector.tsx:127-131`).
- **Disabled looks enabled.** Edit performer path, Draw performer path, Edit movement timing, Group route movement and Formation transition are `aria-disabled` at 0 selected, but they render with the same solid border as enabled buttons. Disabled transform buttons use a dashed border.
- **Problems are buried.** Show-wide problems and Analysis rules are reachable only by scrolling to the bottom of the Inspector.

Recommendation:
- Add a "Paths & timing" section that matches the other Inspector sections.
- Show tools only when they can act. Per-performer path and timing tools need exactly one performer; group tools need a selection.
- Reuse the dashed disabled style.
- Move Problems and Rules to a Review surface. The timeline ⚠ badge is the natural entry point.

**2. Spatial editors open as modals that cover the field.** Shared routes, Move operations, Edit movement timing and Draw performer path each render a wide modal with an embedded mini field ([shared-routes.png](shared-routes.png), [move-ops.png](move-ops.png)). The main field, the thing being edited, is dimmed behind the backdrop.

This contradicts guide §1 ("keep formation parameters near their preview") and the pattern Shape already uses: field-overlay handles, a parameter form in the Inspector, and Apply/Cancel pinned at the top ([shape.png](shape.png)). Drawing a route in a 670 × 300 px inset while the real field sits blurred behind it is the clearest regression in the product.

Recommendation: port these tools one at a time to the docked pattern. Start with Draw performer path and Shared routes, which are inherently spatial. Move operations can stay a compact form, but its preview belongs on the main field.

**3. At 1366 × 768 the field gets about 40% of the screen.** The field container is 856 × 485, but the drawn field is about 710 × 300 because four layers sit on top of it ([home-1366.png](home-1366.png)):

- The section chip bar covers the back sideline area.
- A snap strip ("8-to-5 · whole steps · Keep group spacing") covers the front yard numbers. The same text is also in the status bar.
- The orientation legend clips the "FRONT SIDELINE" label.
- A permanent keyboard-hint line ("Arrows: focus · Enter/Space: select · …") takes another row.

The guide targets about 470 px of field height at this size.

Recommendation:
- Delete the snap strip, since the status bar already shows it.
- Show the keyboard line only while the field has keyboard focus, or move it to Help.
- Float the chips as a compact legend that hides during drag or preview, or put them in the toolbar row.

**4. The demo opens with 400 problems and "Unsaved changes."** The flagship demo's timeline shows ⚠400 and 25 warning markers, so the first thing a new user sees is their sample show failing its own checks.

The untouched demo also counts as unsaved work. Choosing New production → Blank therefore raises a native `window.confirm` saying "Your unsaved changes will be discarded" even when the user changed nothing (`useEditorController.tsx:166`). The same native confirm is used in `TemplatesPanel.tsx:184`.

Recommendation:
- Tune the demo drill, or the default rules, so the demo is clean, or nearly clean with one or two deliberate teaching problems.
- Mark a freshly loaded demo or template as clean.
- Replace `window.confirm` with the in-app Modal so the dialog styling, focus and theme stay consistent.

**5. Enlarged UI and small windows hide the field.** At UI scale 150% and 1366 × 768, the field shrinks to roughly 400 × 150 px, the header wraps to two rows, and the transport's right side (last-set button, show counter) is cut off ([scale.png](scale.png)). The header also wraps at 1024 and 900 px wide. At 900 × 650 both side panels stay open and the field is about 350 × 200 ([narrow.png](narrow.png)), even though the Layout popover says "Narrow windows temporarily tuck panels away."

This violates guide §4 ("Enlarged text and small windows must not strand required controls").

Recommendation:
- Base breakpoints on `--viewport-width`, which already divides by `--ui-scale`.
- Below the first breakpoint, fold Layout, Help, focus and History into Menu.
- Below the second, auto-tuck one side panel.
- Keep the transport on one line by hiding the speed and loop controls first.

### P2

**6. Text hierarchy is flattened.** `src/styles.css` uses `var(--muted)` 118 times and `var(--text)` 10 times. Input values, headings, the count display, active tab labels and primary button text are all muted, so values don't stand out from their labels anywhere. Restore `--text` for values, headings and active states, and keep `--muted` for labels and hints.

**7. Hints never retire.** Guide §2 says to retire introductory hints after use. These are permanent:
- the set list's "↑ / ↓ navigate · Alt+↑ / ↓ move"
- the field keyboard line
- the status bar's "Shift + click to select multiple"
- three lines of nudge help in Group selection
- "Enter applies · Shift+Enter adds a line · Escape cancels" under Rehearsal notes
- the palette's two-line hint
- "DRAG TO ORBIT · SCROLL TO ZOOM" in 3D

Use the tooltip system already in place, and add a "Show hints" preference that turns off after the first few sessions.

**8. Several functions have more than one home:**
- **Snap mode** appears in the field strip, the status bar and the Inspector group help.
- **Set order** has the Inspector arrows, the set list's "Move to [n] →" footer, drag handles and Alt+↑/↓. The footer takes permanent space for a rare action.
- **Commands** are reachable from the header search icon and from Menu → Commands.
- **Set metadata** is edited in both the set list and the Production sheet, which is fine as two views, but the Sheet also shows the set list beside it.

Pick one primary home for each.

**9. The workspace model is inconsistent.** Design, Cast and Sheet look like peer workspaces, but they behave differently:
- **Cast** in a populated show replaces the Inspector in the right panel ([cast.png](cast.png)). After New production → Blank it takes the center instead.
- **Sheet** replaces the field but keeps the field-editing Inspector: Move, Rotate, Shape and path launchers that can't act there ([sheet.png](sheet.png)).

Recommendation: make Cast a right-panel tab beside Inspector rather than a workspace, and in Sheet show only set-level properties.

**10. 3D keeps the 2D toolbar.** In the 3D preview, select, lasso, marquee, pan, path toggles, snap, grid, labels and the 100% zoom control all stay visible, and it isn't clear which of them work ([3d.png](3d.png)). The Perspective, Front and Overhead buttons show no selected state. Hide tools that don't apply in 3D and mark the active camera.

**11. Every dialog opens with a tooltip over its own intro.** Modals focus the Close button, and the shared tooltip shows on that programmatic focus, covering the first paragraph of Export, Help, History, Preferences, New production, Shared routes and Move operations ([export.png](export.png)). It also means the first Escape in a formation preview only dismisses a tooltip, and the second cancels. Show focus tooltips only after keyboard navigation, using the same `:focus-visible` heuristic.

**12. The transport needs work:**
- **Clipped speed label.** The speed select reads "1× speec" at every width, because its width is fixed at 74 px.
- **Look-alike buttons.** Previous set (‹) and previous count (|◁) differ only in a small glyph, and their tooltips are the only way to tell them apart.
- **Lost buttons.** At 1024 px wide, First set and Last set disappear.
- **Noisy readout.** The playback readout shows "69.545 / 152" and "beat 2.545" ([playing.png](playing.png)). Round to whole counts while playing and show decimals only when paused between counts.

**13. Problem markers are hard to use.** The timeline problem row has 25 separate 14 × 14 px tab stops named "Problem marker 1…25", below the 24 px target size. Their tooltips say "findings near show count 5.688" and are clipped at the left window edge. Markers overlap at narrow widths, and the tab order visits sets 2–6 before the opening set.

Recommendation: make the problem row a single focusable track with arrow-key navigation, as the field already has. Give markers descriptive names ("Spacing 1.1 yd · B4, B5 · count 6") and merge clusters.

**14. Numbers are formatted inconsistently:**
- Shared routes shows `26.666666666666668` in the Start Y and End Y fields ([shared-routes.png](shared-routes.png)).
- Move operations opens on "Resize move counts 32 → 32" with Apply enabled, so Apply does nothing.

Use the shared coordinate formatter everywhere, and disable Apply when the draft equals the current state.

**15. Shape's default preview is a poor starting point.** Clicking Shape with 24 brass selected immediately previews an Arc. Its positional assignment makes the paths cross, and the arc runs past the back sideline ([shape.png](shape.png)). Default to the lowest-crossing assignment, which the assignment optimizer from #169 already computes, and fit the default size to the selection's bounds and the field.

**16. Several dialogs and panels have layout problems:**
- **Production sheet:** Notes cut off a line of text halfway, the Meter column shows "4/4:4" with no explanation, and the empty Mark column gives no hint that it can be edited.
- **Preferences:** one long scroll. Helper text runs straight into the next label with no gap ("…presets. **Start view**"); Set properties has the same gap before "Transition". Split it into Appearance, Editing, Field display and Shortcuts.
- **Export:** the Field charts / Coordinate sheets choice only affects the PDF, but it sits above every button, and "Portable production with audio…" wraps onto a row of its own ([export.png](export.png)). Group it as a PDF section plus an "Other formats" list.
- **Command palette:** "Align recording" is listed twice, and its 78 px rows show only 3½ results at a time ([palette.png](palette.png)).
- **Layout popover:** the Write, Review and Rehearse presets don't show which one is active.
- **History:** the dialog shows enabled Undo and Redo buttons alongside "No actions to undo".

**17. Set names are truncated at every width.** The set list is fixed at 216 px, with Counts and BPM columns beside the name, so even at 1920 px it shows "The gather…" and "Orbital mot…". Let the panel grow with the window, or drop the BPM column when the panel is narrow.

### P3

- **History icon.** The header's History button uses a circular arrow that reads as Redo or Refresh next to Undo. Use a clock icon.
- **Stale CSS.** `styles.css` is a single minified line per block and still holds rules for retired layouts (`.rail`, `.avatar`, `.workspace-heading`, `.production-stats`). That makes visual fixes risky. Format it, then delete dead rules after a usage check.
- **Unreadable color pair.** `.field-bottomline>button` sets `background:#d9efb9; color:#d7e4d0`, about 1.1:1 contrast. Either it's dead code or the text is unreadable. Verify, then fix or delete.
- **Off-axis tooltips.** Timeline-area tooltips can render off-screen at the left edge, and the problem marker tooltip is clipped. Add viewport collision handling.

## Suggested order

| Order | Work | Findings | Size |
|---|---|---|---|
| 1 | Field clearance: remove the hint line and snap strip, float the chips | 3, 7 | S |
| 2 | Demo cleanliness, clean state for an untouched demo, in-app confirm | 4 | S |
| 3 | Inspector "Paths & timing" section with contextual visibility and consistent disabled style | 1 | M |
| 4 | UI-scale-aware breakpoints for header, panels and transport | 5, 12 | M |
| 5 | Text-hierarchy token pass | 6 | S |
| 6 | Dialog tooltip-on-autofocus, number formatting, no-op Apply, palette duplicate | 11, 14, 16 | S |
| 7 | Cast as a right-panel tab; set-only Inspector in Sheet; 3D toolbar | 9, 10 | M |
| 8 | Port Draw path and Shared routes to the docked preview | 2 | L |
| 9 | Accessible problem track | 13 | M |

Items 1, 2, 5 and 6 are small, mostly CSS or copy changes, and together fix most of what a first-time user notices.

## Product direction (follow-up)

These are maintainer suggestions from after the audit, with an assessment of each.

**Workspaces: yes, as panel and toolbar arrangements, not as feature tiers.** Squidware already has Write, Review and Rehearse presets (`src/workspaceLayout.ts`). They only toggle two panels and their widths, can't be named or saved, and sit apart from the Design, Cast and Sheet tabs.

Merge everything into one workspace switcher. Each workspace sets the visible panels, the toolbar set, the timeline height and the default 2D or 3D view. Suggested built-ins:

- **Field:** field-dominant, with a top toolbar and a compact timeline.
- **Design:** today's layout, with the Inspector.
- **Production:** the Production sheet and Cast.
- **Rehearse:** field plus 3D plus transport.

Users can save their own. Adobe workspaces rearrange tools; they don't remove them. Hiding features behind "basic" and "advanced" modes would create "where did X go" confusion and split the docs. Handle complexity with contextual toolbars instead.

**Contextual toolbar: yes, and it replaces the Inspector launcher stack (finding 1).** Generate the toolbar from the existing command registry, since commands already carry `enabled()` rules, titles and shortcuts. It changes with the editing state:

- **Nothing selected:** selection tools.
- **Selection:** transform, formation, align and spacing.
- **Exactly one performer:** path and timing tools.
- **Active preview:** parameters plus Apply and Cancel.
- **Playback:** transport.

Keep it in a fixed toolbar row rather than floating near the selection. A fixed row is predictable and never covers dots. The Inspector then becomes an optional details panel.

**Pyware-style layout: take the proportions, not the density.** A large field, a top toolbar and a small timeline match guide §1, and the Field workspace should look like that. Pyware's long row of unlabeled icons and its dialog-based tools are the same problem as finding 2, so don't copy that part.

**Realistic demo show: high value. Author it by hand rather than generating it.** `createDemoProject()` generates Tidal forces from formulas in `src/domain.ts`, which is why it looks blocky. Replace it with a hand-authored `.squid` file loaded from `examples/`. It must be an original show, not a recreation of a real corps program. Target:

- **Size:** about 150 members in a drum corps layout, with roughly 80 brass, 25 battery and 30 guard on the field, plus the front ensemble fixed on the front sideline until props (#81) land.
- **Shape:** 10 to 14 sets in a curvilinear, asymmetric design that uses Bézier forms, seeded scatter, follow-the-leader, rotating blocks and a company front.
- **Validation:** no problems under the default rules.
- **Audio:** a tempo map and metronome, or a CC0 recording. No licensed music.

It doubles as a showcase for the tools added in #160 to #172 and fixes finding 4.

**Pop-out 3D view: feasible with modest work.** The Electron main process currently blocks every child window (`electron/main.cjs:438`). Allow one same-origin child window and render the existing `Stage3D` into it through a React portal. It then shares the editor store directly, with no IPC sync. It needs:

- persisted window position and size
- a return to the inline view when the window closes
- paused rendering when the window is minimized or hidden
- a CSP check for the child document

It should follow playback, the current set and the selection. The main benefit is a two-monitor setup, with the field on one screen and 3D on the other.

## Method notes

- Screenshots in this folder were taken with Playwright against `pnpm dev` and color-quantized for size.
- Contrast was sampled in the dark theme only. Light and high-contrast were checked visually.
- Native Electron behavior, PDF output and audio workflows were not exercised.
- Severity reflects the guide's stated goals and the 1366 × 768 target. It is not based on user sessions.
