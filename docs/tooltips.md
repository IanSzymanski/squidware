# Accessible control help (#66)

`Tooltip` supplies one shared presentation for pointer and keyboard help. Hover waits 400 ms; focus shows help immediately. It displays a concise name/effect, current state, an unavailable reason and shortcut keycaps where a binding exists. A help link can sit beside the description, outside the noninteractive `role="tooltip"` element.

`HelpButton` and the icon `Button` use command descriptions from the registry, with explicit context overrides for actions such as applying a formation to the selection or the entire cast. `commandKeycaps` presents the current registry shortcut with Cmd on macOS and Ctrl elsewhere. Help and project-menu hints use the same formatter. Export's current binding is desktop-only; controls without bindings do not advertise invented keys. Previous/next and select/pan use the corresponding registry variant.

Disabled buttons use `aria-disabled`, remain in the normal Tab order, and block click/Enter/Space activation. Disabled number/select fields keep native disabling and have a focusable group to explain why editing is unavailable. The existing input error description is preserved alongside the tooltip description. Escape dismisses help; text/number fields retain Escape draft cancellation. Tab moves normally, touching controls does not leave hover help, and activating a control dismisses its tooltip.

Tooltips use a viewport-clamped portal, or the containing dialog's top layer. They remain hoverable and dismiss when the pointer leaves both the trigger and panel, focus leaves, the viewport scrolls/resizes, or another tooltip opens. Coverage includes file/workspace actions, set cards/timeline blocks, the section legend, formation tiles, view/camera/quality controls, Inspector fields, transforms and playback options.

## Verification

Run `pnpm build` followed by `pnpm test:tooltips`. The production Electron runner uses an isolated profile, Chromium pointer events and native key events. It checks delay/dismissal, disabled activation guards, Tab/Shift+Tab, state updates, full-cast versus selection formation descriptions, preview edit locks, disabled Inspector fields, 3D controls, viewport placement, modal top layers, current tooltip/help keycaps, and emulated touch behavior. Its report and screenshot are saved under `.qa/tooltips/`.

The unit formatter checks cover Windows/macOS, native-only bindings, variants, controls without shortcuts and registry changes. Existing editor and accessibility suites retain semantic label selectors after native titles are removed. CI also runs the tooltip renderer suite under Linux Xvfb.

Local validation uses production Electron on Windows. macOS keycap and touch behavior are emulated; physical macOS/Linux pointer and keyboard walkthroughs and assistive-technology checks remain release validation. Persisted rebinding and its propagation test belong to #65. This change does not add or change shortcut bindings.
