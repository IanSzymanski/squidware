# Workspace layout

The window has five regions: the top bar, the tool strip, the field, one side panel and the show strip. The [design system](DESIGN_SYSTEM.md) says what each region holds. This page describes what you can show, hide and resize, and how the layout adapts to small windows and large UI scales.

The earlier pane layout is gone: there is no left Set list pane, no separate Inspector and Cast widths, and no **Layout** popover with Write, Review and Rehearse presets. The three [modes and saved workspaces](WORKSPACES.md) replace the presets, and sets are cards in the [set strip](set-list.md).

Layout choices are saved on this device, separately from `.squid` files. They never add production history, move performers or change print coordinates.

## The side panel

One panel sits beside the field, with **Inspector** and **Cast** tabs. Both tabs use one width, so switching tabs never moves the field. Left/Right or Home/End on a tab selects the other tab. Plan mode shows the production sheet without the side panel.

- **Show or hide.** The panel button at the right end of the tool strip is named **Collapse Inspector** or **Show Inspector** (**Collapse Cast** or **Show Cast** while the Cast tab is selected). A collapsed panel stays collapsed after a restart.
- **Resize.** Drag the divider on the panel's left edge. The divider is also a keyboard stop: Left/Right resize by 10 pixels, Shift increases the increment to 40 pixels, and Home/End use the width limits. The width ranges from 288 to 420 px and never takes the field's reserve (see below).
- **Previews.** A formation, transform, spacing or coordinate preview, and the docked editors (**Move operations**, **Shared routes**, **Edit movement timing** and **Draw performer path**), need their parameters. While one is open the panel shows the Inspector, even if you collapsed it or had Cast open. Afterwards the panel returns to your choice. The saved layout is unchanged.
- **Pending work.** While an input, preview or dialog is pending, the other tab, the divider and collapsing a docked panel are unavailable. The panel button's help says to finish or cancel the current input or preview first.

## Small windows and UI scale

Layout responds to the *effective* window size: the window size divided by the UI scale. A 1366 × 768 window at 150% therefore lays out like a 911 × 512 window. The thresholds live in one module, `src/editor/breakpoints.ts`, and the shell exposes the result as `data-header`, `data-transport` and `data-height` on `.studio`.

- **Top bar.** The top bar always stays one row. Below 1200 effective pixels the save state shows only its status dot, the recovery indicator is hidden, the problems badge drops its wording, and command search shows only its icon and shortcut. Below 800 pixels the production title is hidden and **Export** shows only its icon. The Project menu, the three mode buttons, **Undo**, **Redo**, the problems badge, command search and **Export** stay visible at every width. The top bar also folds on its own width, so under a large UI scale search and **Export** become their icons and the modes sit closer before anything overlaps. **Save** appears in the top bar whenever the production has unsaved changes.
- **Tool strip.** The strip is one row and never wraps. It responds to its own width. At 1136 px or less the tools sit closer together and **Props** shows only its icon. At 1056 px or less, Align, Rotate, Mirror and Place fold into an **Arrange** menu. At 860 px or less, the shapes fold into a **Shape** menu. In the 3D view the strip holds the cameras and review tools instead; at 740 px or less its **Camera** caption and the review tools' words give way, and the four camera views keep their names. At 640 px or less, labeled tools show only their icons, **Props** is left to the Command palette (**Staging props**), and Cancel and Apply drop their keycaps. The panel button stays at the right end.
- **Side panel.** A long section list scrolls inside its own share of the panel, so the selection and the set always keep theirs. The field keeps at least 544 effective pixels of the main workspace (`FIELD_RESERVE`: a 520 px field container plus its gutters). When the window is too narrow for the panel and that reserve, the panel does not dock. The panel button then opens it over the field, below the tool strip and never wider than about half the window, where its header has a **Close Inspector** or **Close Cast** button. Escape or a click on the field beside the panel also closes it. A preview opens the Inspector over the field without that click-to-close layer, so the field handles stay usable. A panel open over the field closes when you change mode or workspace, enter **Focus field**, or start playback. Opening and closing a panel over the field never changes the saved layout; only an explicit collapse, show or resize does. The panel docks again when the window grows.
- **Field.** The floating controls sit in the margin that Fit leaves around the turf. In a small field area the hint line and the snap chip hide and the **Paths** and **View** chips show only their icons. The 2D / 3D / Split control stays, and zoom hides only when the field area is under 260 px high. In Split view the hint line and the snap chip are hidden.
- **Transport.** Play, previous and next set, and count stepping always stay on one row. When the main workspace is narrower than 1000 px, loop, metronome and playback speed move into **More playback options** (⋯). Below 700 px, rehearsal passages and audio move there too, and the **First set** and **Last set** buttons, the measure and show readouts and the set name in **Find set** are hidden. The measure and show readouts also hide earlier when the show strip itself is narrow. The menu keeps the original order of its controls and returns focus to ⋯ on Escape.
- **Short windows.** Below 620 effective pixels of height the set strip is hidden so the field keeps its share. **Find set**, the timeline's set segments and `[` / `]` still move between sets, and **Add set** moves into the transport.

The desktop window can shrink to 800 × 600 native pixels; OS window decorations reduce its content height.

## Focus field

**Focus field** (Ctrl/⌘ + Shift + F outside text entry, or **View options → Focus field**) hides the top bar, the tool strip, the side panel and the set strip, leaving the field, the transport and the timeline. **Exit focus** stays visible over the field. Escape also restores the workspace without clearing the selection; an open menu, a preview or a dialog takes Escape first. Focus mode is available in Write and Rehearse, starts off after restarting the app, and ends when you change mode or workspace. A docked editor that needs the side panel suspends focus mode while it is open. Focus mode does not choose a different 2D/3D view or change the written show.

## Hiding the set strip

In Write mode, **Hide set strip** in the transport removes the thumbnail strip to give the field more room; **Show set strip** brings it back. While the strip is hidden, **Add set** is in the transport. The choice belongs to the active workspace. Plan and Rehearse do not show the set strip.

## Saved layout and older preferences

The panel width and the collapsed state of each tab are part of the active [workspace](WORKSPACES.md). Layout records from older personal preferences are read with safe defaults: invalid fields recover independently and out-of-range widths are bounded. The former Set list width and the separate Cast width are still read from older files but no longer affect the window. Resetting all Preferences also resets layout choices.

## Validation and design review

The `workspace` desktop suite owns resizing, collapse, focus mode, narrow and enlarged layouts and restart persistence; other suites keep field interaction, file editing and detailed Cast coverage. Use `pnpm test:workflows --suite=workspace` after building.

The [review evidence](evidence/workspace-layout/README.md) records dimensions and screenshots of the earlier pane layout. Automated window resize and zoom checks establish renderer behavior, without claiming physical device qualification.
