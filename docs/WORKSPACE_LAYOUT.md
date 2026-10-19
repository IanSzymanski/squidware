# Workspace layout

Open **Layout** in the header to choose a preset, show or hide panels, or adjust widths. These choices are saved on this device, separately from `.squid` files. They never add production history, move performers or change print coordinates.

- **Write** shows the Set list and Inspector at their default widths.
- **Review** keeps the Set list and expands the field by hiding the Inspector.
- **Rehearse** tucks both panels away and keeps the field controls and playback timeline.
- **Reset layout** restores Write and default widths. Other personal settings remain as chosen.

Cast opens in place of the Inspector using its own saved width. Opening Cast from the header reveals it even if it was collapsed previously. The full Cast table remains available from its panel. Returning to Design restores the Inspector's own layout choice.

Drag the divider beside a panel to resize it. A divider is also a keyboard stop: Left/Right resize in the direction of the arrow, Shift increases the increment from 10 to 40 pixels, Home/End use the width limits, and Enter collapses the panel. Escape cancels a pointer resize. The Layout sliders offer an alternative using the keyboard with a one-pixel increment and a readable pixel value.

Set list widths range from 160–360 px, Inspector from 235–420 px, and Cast from 280–480 px. Panels have visible collapse controls. A collapsed panel leaves a **Show** button beside the field. Layout changes that would hide an active input or position preview wait until it is finished or cancelled; restoring a hidden panel remains available.

Smaller windows and enlarged UI temporarily reduce pane widths or tuck panels away to reserve a useful field. Their saved widths remain intact and return when space permits. Show opens a panel over the field when it cannot fit beside it; Escape or clicking the surrounding field closes the overlay. Panel contents and the workspace scroll vertically when necessary, keeping controls reachable at enlarged sizes. The desktop window can now shrink to 800 × 600 native pixels; OS window decorations reduce its content height.

**Focus field** (Ctrl/⌘ + Shift + F outside text entry) hides the header, panels and field toolbar, leaving the field and timeline. **Exit focus** stays visible over the field; Escape also restores the workspace without clearing the selection. Focus is temporary and starts off after restarting the app. It does not choose a different 2D/3D view or change the written show.

Layout records added to older personal preferences use safe defaults and preserve the older Compact panel widths. Invalid layout fields recover independently, and oversized/out-of-range dimensions are bounded. Resetting all Preferences also resets layout choices.

## Validation and design review

Shared design guidance sections 1–5 apply. This change reuses the compact header, contextual Inspector, Cast, Lucide icons, shared help/focus controls, typed commands and native personal-preference codec. The new `workspace` desktop suite owns resizing, presets, focus, narrow/enlarged layouts and restart persistence; other suites retain field interaction, file editing and detailed Cast coverage. Use `pnpm test:workflows --suite=workspace` after building.

The [review evidence](evidence/workspace-layout/README.md) records before/after dimensions and screenshots. Other themes remain owned by #43; actual writer, assistive-technology and physical multi-display validation remain tracked by #64/#3. Automated window resize/zoom checks establish renderer behavior, without claiming physical device qualification.
