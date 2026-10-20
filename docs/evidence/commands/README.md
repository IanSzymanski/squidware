# Command palette evidence

Captured in sandboxed production Electron 44.7.0 on Linux/Xvfb, October 20, 2026. Input uses native key/character events and Chromium's input protocol; setup uses a two-performer fixture. Appearance in the additional-layout captures is context setup; theme switching/persistence retains its separate suite owner.

- [Before, 1366 × 768](commands-before.png)
- [Dark palette, 1366 × 768](commands-dark-search.png)
- [Disabled command explanations](commands-disabled.png)
- [Shortcut recording/preferences](commands-bindings.png)
- [Light phrase preview](commands-light-1366.png)
- [High contrast, 1000 px / 125%](commands-high-contrast-1000.png)
- [Dark, 850 px / 150%](commands-dark-850.png)
- [Native write-phase results and text audits](results-write.json)
- [Fresh process and reset results](results-read.json)

The field remains 485 px tall at the default laptop size. All recorded text/placeholder contrast checks pass with disabled controls included. Geometry, undo, file contents, key propagation and restart persistence are behavior assertions in the suite; screenshots alone do not establish them. See [behavior and design review](../../COMMAND_PALETTE.md).

The local captures demonstrate headless Linux behavior. Hosted CI owns Windows/macOS/Linux certification; writer and assistive-technology/device checks remain #64/#3.
