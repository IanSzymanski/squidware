# Accessible control help (#66)

`Tooltip` supplies one shared presentation for pointer and keyboard help. Hover waits 400 ms; focus shows help immediately. It displays a concise name/effect, current state, an unavailable reason and shortcut keycaps where a binding exists. A help link can sit beside the description, outside the noninteractive `role="tooltip"` element.

The inline drill-phrase field uses `pointerPassThrough`: its descriptive popup ignores pointer hits and dismisses when the pointer moves off the field, while retaining text focus and keyboard/ARIA help. This keeps nearby example/current-coordinate and side/unit controls reachable after automatic focus. A popup containing a help link always retains the default hoverable behavior. Other controls keep the default policy.

`HelpButton` and the icon `Button` use command descriptions from the registry, with explicit context overrides for actions such as applying a formation to the selection or the entire cast. `commandKeycaps` presents the current personal binding from the shared shortcut table with Cmd on macOS and Ctrl elsewhere. Help and project-menu hints use the same formatter. The default Ctrl/Cmd+P export binding is desktop-only; controls without bindings do not advertise invented keys. Previous/next and select/pan use the corresponding concrete command variant, preserving variant indices when a binding is cleared.

Disabled buttons use `aria-disabled`, remain in the normal Tab order, and block click/Enter/Space activation. Disabled number/select fields keep native disabling and have a focusable group to explain why editing is unavailable. The existing input error description is preserved alongside the tooltip description. Escape dismisses help; text/number fields retain Escape draft cancellation. Tab moves normally, touching controls does not leave hover help, and activating a control dismisses its tooltip.

Tooltips use a viewport-clamped portal, or the containing dialog's top layer. They remain hoverable and dismiss when the pointer leaves both the trigger and panel, focus leaves, the viewport resizes, or another tooltip opens. Hover help dismisses on scrolling. Keyboard help repositions with its focused control, including when focusing an offscreen Inspector field automatically scrolls the panel; that scroll must not immediately erase the newly opened description. Coverage includes file/workspace actions, set cards/timeline blocks, the section legend, formation tiles, view/camera/quality controls, Inspector fields, transforms and playback options.

## Verification

Run `pnpm build` followed by `pnpm test:tooltips`. The production Electron runner uses an isolated profile, Chromium pointer events and native key events. It checks delay/dismissal, disabled activation guards, Tab/Shift+Tab, state updates, full-cast versus selection formation descriptions, preview edit locks, disabled Inspector fields, 3D controls, viewport placement, modal top layers, current tooltip/help keycaps, and emulated touch behavior. Its report and screenshot are saved under `.qa/tooltips/`.

The unit formatter checks cover Windows/macOS, native-only bindings, variants, controls without shortcuts and persisted rebinding. Existing editor and accessibility suites retain semantic label selectors after native titles are removed. CI also runs the tooltip renderer suite under Linux Xvfb.

CI runs a second pass with `node scripts/tooltip-qa.mjs .qa/tooltips-fallback --force-3d-fallback` to exercise unavailable WebGL. Screenshot capture uses Electron's `capturePage` with `stayHidden` and `stayAwake`, then requires a nonempty image. The earlier DevTools screenshot request could wait indefinitely for a compositor frame on a hidden Linux window after 3D fallback; this caused the post-merge CI failure for #111.

Local validation uses production Electron on Windows. macOS keycap and touch behavior are emulated; physical macOS/Linux pointer and keyboard walkthroughs and assistive-technology checks remain release validation. The [command palette](COMMAND_PALETTE.md) adds persisted rebinding; its native suite checks Help, menus, input protection and restart propagation.
