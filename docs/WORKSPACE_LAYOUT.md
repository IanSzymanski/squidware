# Workspace layout

Open **Layout** in the header (in **Menu** on narrow windows or at large UI scales) to choose a preset, show or hide panels, or adjust widths. These choices are saved on this device, separately from `.squid` files. They never add production history, move performers or change print coordinates.

- **Write** shows the Set list and Inspector at their default widths.
- **Review** keeps the Set list and expands the field by hiding the Inspector.
- **Rehearse** tucks both panels away and keeps the field controls and playback timeline.
- **Reset layout** restores Write and default widths. Other personal settings remain as chosen.

The active preset is pressed: it has an accent border, a selected background and a check mark, so the state does not depend on color alone. Resizing, collapsing or restoring a panel makes the layout **Custom**. No preset is then pressed, and the popover says *Custom layout: choose a preset to restore its panels and widths.* The **Layout** button's tooltip names the current layout (Write, Review, Rehearse or Custom).

Cast opens in place of the Inspector using its own saved width. Opening Cast from the header (or with **Dock Cast** or the Command palette) reveals it even if it was collapsed previously, and moves keyboard focus to its search. On a small window or at a large UI scale Cast docks beside a narrower field; where even that does not fit, it opens over the field (see below). The full Cast table remains available from its panel. Returning to Design restores the Inspector's own layout choice.

Drag the divider beside a panel to resize it. A divider is also a keyboard stop: Left/Right resize in the direction of the arrow, Shift increases the increment from 10 to 40 pixels, Home/End use the width limits, and Enter collapses the panel. Escape cancels a pointer resize. The Layout sliders offer an alternative using the keyboard with a one-pixel increment and a readable pixel value.

Set list widths range from 160–360 px, Inspector from 235–420 px, and Cast from 280–480 px. Panels have visible collapse controls. A collapsed panel leaves a **Show** button beside the field. Layout changes that would hide an active input or position preview wait until it is finished or cancelled; restoring a hidden panel remains available.

## Small windows and UI scale

Layout responds to the *effective* window size: the window size divided by the UI scale. A 1366 × 768 window at 150% therefore lays out like a 911 × 512 window. The thresholds live in one module, `src/editor/breakpoints.ts`, and the editor exposes the result once as `data-header`, `data-transport` and `data-height` on `.studio`.

- **Header.** The header always stays one row. Below 1200 effective pixels, **Layout**, **Focus field**, **Help** and **History** move to the top of **Menu**, in that order, and Menu shows only its icon. Below 800 pixels, the Design/Cast/Sheet tabs and Save also become icon-only, with the same names in their tooltips. Command palette, Undo, Redo, Save, Export and workspace switching stay visible. Choosing **Workspace layout…** from Menu opens the same options and moves focus into them; Escape returns focus to Menu.
- **Panels.** The field keeps at least a 520 px container, enough for a 480 px drawn field at 100%. When space is short, open panels first shrink toward their minimum widths, then the set list tucks away, then the Inspector or Cast. A tucked panel keeps its **Show** button, which opens it over the field. Escape, clicking the surrounding field or the overlay's **Close** button (where a docked panel shows **Collapse**) closes it and returns focus to **Show**. Tucking is temporary: it never changes the saved layout or preset, and panels dock again at their saved widths when the window grows.
- **Panels you ask for.** A side panel you explicitly open docks beside a narrower field before it tucks: the main workspace then keeps 360 effective pixels for the field instead of 544 (`DEMANDED_FIELD_RESERVE` in `breakpoints.ts`, the reserve used before UI-scale breakpoints). This applies to Cast opened from the header tab, **Dock Cast** or the palette, and to the Inspector while a transform, formation, spacing or coordinate preview needs its controls. The set list still tucks first. Below that width (about 676 effective pixels for Cast and 631 for the Inspector), Cast opens over the field with focus in its search, and a preview opens the Inspector over the field without dimming it: the field fits beside the overlay, so the preview, its banner, Apply/Cancel and playback stay visible. None of this changes the saved layout.
- **Transport.** Play, set navigation (first, previous, next and last set), count stepping and the show count always stay on one row. When the timeline is narrower than 800 px, loop, metronome and playback speed move into **More playback options** (⋯). Below 520 px, rehearsal passages and audio move there too. The menu keeps their original order, closes when focus leaves it and returns focus to ⋯ on Escape. A dialog opened from the menu, such as **Rehearsal passages**, keeps it open underneath, so closing the dialog returns focus to the control that opened it.
- **Short windows.** Below 620 effective pixels of height, chrome spacing tightens so the field keeps its share. The field container never drops below 150 px. Below the smallest supported size (an 800 × 600 window at 150%), the workspace scrolls and the timeline stays pinned at the bottom so playback remains visible.

The desktop window can shrink to 800 × 600 native pixels; OS window decorations reduce its content height.

**Focus field** (Ctrl/⌘ + Shift + F outside text entry) hides the header, panels and field toolbar, leaving the field and timeline. **Exit focus** stays visible over the field; Escape also restores the workspace without clearing the selection. Focus is temporary and starts off after restarting the app. It does not choose a different 2D/3D view or change the written show.

Layout records added to older personal preferences use safe defaults and preserve the older Compact panel widths. Invalid layout fields recover independently, and oversized/out-of-range dimensions are bounded. Resetting all Preferences also resets layout choices.

## Validation and design review

Shared design guidance sections 1–5 apply. This change reuses the compact header, contextual Inspector, Cast, Lucide icons, shared help/focus controls, typed commands and native personal-preference codec. The new `workspace` desktop suite owns resizing, presets, focus, narrow/enlarged layouts and restart persistence; other suites retain field interaction, file editing and detailed Cast coverage. Use `pnpm test:workflows --suite=workspace` after building.

The [review evidence](evidence/workspace-layout/README.md) records before/after dimensions and screenshots. Other themes remain owned by #43; actual writer, assistive-technology and physical multi-display validation remain tracked by #64/#3. Automated window resize/zoom checks establish renderer behavior, without claiming physical device qualification.
