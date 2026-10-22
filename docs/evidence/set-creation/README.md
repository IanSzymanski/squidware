# Set-creation review evidence

Before: production Electron built from main `7c014ff` (merged timeline work). After: the #29 implementation on the same Linux software host. These captures were agent-reviewed at 1366×768, with dark/light/high-contrast and a 1024×720 native window at 150% zoom. The selected action, timing fields, explanatory copy and acceptance controls are readable; selection includes a non-color checkmark. The enlarged modal scrolls internally to retain controls.

- [Before](set-creation-before.png) / [After workspace](set-creation-after.png): one Add set control; unchanged 485 px field height.
- [New](set-creation-new.png), [Duplicate](set-creation-duplicate.png), [Insert before](set-creation-insert-before.png), [Hold](set-creation-hold.png): distinct effects and visible timing before commit.
- [Dark](set-creation-dark.png), [Light](set-creation-light.png), [High contrast](set-creation-high-contrast.png), [Enlarged](set-creation-enlarged.png).
- [Workflow results and measured viewports](results.json).

The local run used production main/preload/renderer, a temporary Xvfb display, `--no-sandbox` and `--disable-dev-shm-usage` because this host cannot run Electron’s sandbox/shared-memory setup. Those flags are not part of the shipped app or registered CI suite. Local results establish the tested UI/file behavior and retain their recorded source identity; evidence/documentation additions occur afterward. They do not certify the desktop sandbox, packaged installers, other operating systems or physical hardware. Hosted certification runs the registered suite with the normal launcher and exact-source checks.

CI follow-up: the first macOS run failed the 470 px field-height assertion after showing the window, which permits native desktop work-area constraints to reduce the requested content area. The fixed-size capture now precedes showing the window and explicitly requires a 1366×768 viewport plus the original 470 px field budget. All subsequent behavior checks use the visible window and its settled native dimensions. A local injected 647 px visible-window height limit reproduced the original assertion failure; the corrected full workflow passed under the same constraint and through the registered launcher. Failure logs now include captured viewport measurements. This changes test setup, with no product layout changes.
