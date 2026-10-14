# Squidware design guidance

## Authority and scope

This is the shared implementation reference for the **Squidware Audit, Oct 12, 2026 (Ian)** design direction, consolidated from the audit-derived issues linked below. It records the guidance preserved in those issues; it is not a replacement audit or a new visual-design proposal. Explicit maintainer decisions and each issue's acceptance criteria remain authoritative. Update this guide and the owning issue together when an accepted decision changes the direction.

Apply the relevant sections whenever an issue changes a screen, control, interaction, message, preference or user-facing output. For internal-only work, record that the visual review is not applicable and explain why. A link is a review obligation, not proof of compliance. Existing completed issues retain their completion evidence; adding this reference does not reopen them or certify them against later work.

The guide describes the intended product across releases. It does not make unfinished features prerequisites for every issue. Use established shared components and behavior; deliver new capabilities in their owning issues and release order. In particular, follow the visual direction during layout work while full theme switching/scaling remains owned by #43.

## 1. Give the field priority

- Keep the workspace compact: approximately 48 px for the combined header/workspace bar and approximately 120 px for transport/timeline. At 1366 × 768 and default scale, target approximately 470 px of field height; measure and explain deviations.
- Put set name and 2D/3D controls with the canvas toolbar, float the legend within the field, and hide an unused audio lane.
- Preserve visible or readily accessible Save, Undo, Export, workspace navigation and playback. Remove redundant headings, avatars, repeated local-status notices and duplicate actions without losing meaningful file status.
- Keep selection count and applicable actions visible at laptop size. Use contextual, collapsible Inspector sections and keep formation parameters near their preview.
- As the corresponding issues land, support resizable/collapsible panels, Write/Review/Rehearse presets, an escapable focus mode and Cast selection alongside the field.

Sources and owners: [#16](https://github.com/IanSzymanski/squidware/issues/16), [#18](https://github.com/IanSzymanski/squidware/issues/18), [#32](https://github.com/IanSzymanski/squidware/issues/32), [#40](https://github.com/IanSzymanski/squidware/issues/40). Compact set rows and advanced timeline navigation remain separately owned by [#17](https://github.com/IanSzymanski/squidware/issues/17) and [#31](https://github.com/IanSzymanski/squidware/issues/31).

## 2. Use one visual language

- Follow the neutral dark-first/light interface direction, with a high-contrast option delivered by #43. Use shared color, typography and control styles instead of adding competing local styles.
- Reserve section colors for performers, a distinct accent for selection/focus and distinct status colors. Preserve user-defined section colors; distinguish selection and errors with geometry or text as well as color.
- Use readable interface text: at least 11 px, with a 12–13 px default where practical. Use tabular numerals for counts, tempos and coordinates.
- Use Lucide icons consistently; custom drill glyphs follow its grid. Give different actions distinct, meaningful glyphs.
- Name actions and workspaces directly: New production, Export, Help, Cast and Production sheet. Make actionable legend chips look like controls.
- Consolidate duplicate Settings, Help and Add set entry points. Retire introductory hints after use and move persistent rehearsal disclaimers into Help.

Sources and owners: [#36](https://github.com/IanSzymanski/squidware/issues/36), [#37](https://github.com/IanSzymanski/squidware/issues/37), [#43](https://github.com/IanSzymanski/squidware/issues/43).

## 3. Make editing predictable

- Show explicit selection and contextual action availability. Empty selection must not silently target the whole ensemble.
- Provide non-destructive previews for formation operations, synchronized numeric and direct-manipulation inputs, explicit Apply/Cancel and one named undo transaction per accepted action.
- Preserve unrelated drafts when selection or context changes. Keep field, Cast and section selection consistent.
- Use the shared command behavior for buttons, keyboard and palette. Respect text entry and distinguish keyboard focus navigation from editing.
- Keep dense dots intentionally selectable and labels readable across zoom/DPI. Pixel-based presentation settings must not change physical drill geometry.
- Keep personal display/layout preferences separate from production data. Orientation, UI scale and presentation choices must not silently change coordinates, print geometry or the project's saved state.
- Distinguish explicit file-save status, pending drafts and recovery. A recovery write or canceled/failed save must not imply that a project file was saved.

Sources and owners: [#6](https://github.com/IanSzymanski/squidware/issues/6), [#18](https://github.com/IanSzymanski/squidware/issues/18), [#20](https://github.com/IanSzymanski/squidware/issues/20), [#25](https://github.com/IanSzymanski/squidware/issues/25), [#32](https://github.com/IanSzymanski/squidware/issues/32), [#38](https://github.com/IanSzymanski/squidware/issues/38), [#39](https://github.com/IanSzymanski/squidware/issues/39), [#42](https://github.com/IanSzymanski/squidware/issues/42), [#65](https://github.com/IanSzymanski/squidware/issues/65), [#67](https://github.com/IanSzymanski/squidware/issues/67).

## 4. Preserve access and explain state

- Keep normal text contrast at least 4.5:1, with visible focus, selection and non-color error cues.
- Keep the field one Tab stop with documented internal navigation; do not force traversal of the full roster to leave it.
- Provide keyboard alternatives to pointer-only gestures. Enlarged text and small windows must not strand required controls.
- Use the shared tooltip behavior on hover and keyboard focus, with concise effects, current state, disabled reasons and platform-correct shortcut keycaps from command metadata.
- Preserve accessible names, dismiss behavior and usable fallback states. Never use an icon or color as the only explanation of an unfamiliar action.

Sources and owners: [#37](https://github.com/IanSzymanski/squidware/issues/37), [#66](https://github.com/IanSzymanski/squidware/issues/66), [#65](https://github.com/IanSzymanski/squidware/issues/65). Existing behavior and bounded checks are documented in [ACCESSIBILITY.md](ACCESSIBILITY.md) and [tooltips.md](tooltips.md).

## 5. Review evidence

For each user-facing change, record in the issue or linked PR:

- Which guidance sections apply and which established components/styles/commands are reused.
- Before/after screenshots for visible changes, at 1366 × 768 and default scale; also inspect enlarged text/UI scale and affected narrow-window states. For nonvisual behavior, record the relevant interaction evidence instead.
- Applicable pointer and keyboard paths, selection/focus, disabled/error/empty states, and supported themes. Test additional themes when their owning implementation is available.
- Applicable preview/cancel/undo, save/reopen, preference persistence and unchanged physical-coordinate behavior.
- Any deviation from the audit target, its measured reason and the maintainer decision resolving it. Unresolved deviations remain visible in the owning issue.
- A concise result, or a reasoned “not applicable” for internal-only work.

Use the existing automated checks where relevant, plus inspection of the rendered result. A linked guide, source inspection, screenshots alone or passing partial tests do not establish all acceptance criteria. Actual writer/platform validation remains [#64](https://github.com/IanSzymanski/squidware/issues/64); representative school-hardware acceptance remains [#3](https://github.com/IanSzymanski/squidware/issues/3).

## Maintenance

Every implementation issue and tracker #1 should link here. New issue intake includes the same reference and review checklist. Preserve the reference when updating priority, scope or release membership, outside the Release train's managed block.

Keep issue-specific acceptance criteria and evidence in their owning issue. Changes to design direction should be reflected here with a link to the deciding issue or maintainer decision, so later work follows the same reference. Do not create duplicate design tasks merely to restate this guide.
