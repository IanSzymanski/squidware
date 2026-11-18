# Performer facing and appearance review

[Issue #83](https://github.com/IanSzymanski/squidware/issues/83) adds keyed headings and optional appearance settings.

| Area | Screen captures |
| --- | --- |
| Inspector and field at 1366 × 768 | [Previous field and Inspector](../analysis-rules/analysis-rules-default.png) · [Authored heading](facing-dark.webp) |
| Cast and field at 1366 × 768 | [Dark](appearance-dark.webp) · [Light](appearance-light.webp) · [High contrast](appearance-high-contrast.webp) |
| Collapsed Inspector at 1024 × 720 and 150% UI scale | [Facing controls](facing-enlarged.webp) |
| SwiftShader at 1280 × 1000 | [Detailed](3d-appearance.webp) · [Lightweight](3d-appearance-lightweight.webp) |

- §1. The 1366 × 768 field retains 513 px of height. Facing and Appearance fit in existing collapsible Inspector and Cast controls. At 150% the existing narrow workspace opens the Inspector as an overlay and preserves access to the heading and Apply.
- §2. Section dots and caps retain their colors. A separate heading arrow, role shape, and optional costume fill distinguish the three attributes. The 2D marks follow the display rotation. The stored heading uses field coordinates.
- §3. Explicit Apply and Clear each create a named undo entry. Pose sampling leaves positions and written movement unchanged. Native v13 file validation retains headings and appearance, with format fixtures for old files and invalid v13 inputs. Rules use authored facing only when the entire move can be classified and respect explicit declarations.
- §4. The Linux desktop replay checks Enter to apply, Escape to cancel invalid data, undo/redo, 150% control bounds, and field orientation. 2D heading readout announces authored angles. The appearance options are standard Cast controls.
- §5. The desktop analysis rules, field, path operations, and movement schedule suites passed. The scoped SwiftShader appearance check exercises mixed roles, cosmetic color, headings, both render quality settings, and return to idle. The broader optional WebGL run on this software host failed its camera-damping timing assertion.

The captures and measurements are from Linux software rendering.
