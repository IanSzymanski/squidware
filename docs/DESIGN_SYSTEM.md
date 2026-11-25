# Squidware design system

How the app looks and where things go. Read this before adding a screen, control or panel. The [design guidance](DESIGN_GUIDANCE.md) records the principles; this page is the system that implements them.

## What the shell is for

A drill writer does five things, over and over: go to a set, select performers, shape them, add the next set, and watch the move. The shell keeps those five always in reach and puts everything else one named step away.

| Region | Holds | Why it is there |
| --- | --- | --- |
| Top bar | Project menu, title and save state, **Write · Plan · Rehearse**, undo/redo, problems, command search, Export | The things that are true in every mode. |
| Tool strip | Pointer tools, **Shape** (line, arc, circle, block, wave), **Arrange** (align, rotate, mirror, place), Motion, Props, paths, View, 2D/3D/Split | The verbs of drill writing as first-class buttons. Tools stay where they are; they enable and disable with context. |
| Field | The field, with section chips and zoom floating over its margin | The field is the product. Nothing permanent sits on it. |
| Side panel | **Properties** of the selection and the set, or the **Cast** list | One panel beside the field. It shows what applies to the current work and nothing else. |
| Show strip | Transport and position, a count scrubber, and every set as a thumbnail | Sets read as a storyboard. The field is wide, so navigation uses the height the field cannot. |
| Status line | One hint on the left, production facts on the right | One place for guidance instead of helper text in every panel. |

Rules that follow from this:

- **The field gets the width.** A football field is about 1.9:1. Do not add a second side panel or a permanent left column.
- **A preview owns the tool strip.** While a shape, transform, spacing or coordinate preview is open, the strip shows what is being previewed and Cancel / Apply. Parameters are in the side panel with the same two actions.
- **Depth lives in named menus and the palette.** Motion, More shapes, View, Set actions and the Project menu group deeper features by what the writer is trying to do. Every command is also in the command palette (`Ctrl/⌘ K`).
- **No filler.** A panel does not explain itself in paragraphs. Put the explanation in the control's tooltip, the status line, or Help. A line of text in a panel must be something the writer needs to read to do the work.
- **Modes are stages of work, not arrangements of panels.** Write is the field and its tools. Plan is the production sheet. Rehearse is playback, cameras and review.

## Tokens

All chrome colors, sizes, radii, shadows and durations are custom properties in [`src/ui/tokens.css`](../src/ui/tokens.css). Components never hard-code them. Three themes share one set of names: dark (default), light and high-contrast.

| Group | Tokens | Use |
| --- | --- | --- |
| Surfaces | `--canvas`, `--app-bg`, `--surface`, `--surface-raised`, `--surface-muted`, `--control`, `--hover-bg`, `--active-bg`, `--overlay`, `--input-bg` | Darkest to lightest. Bars and panels use `--surface`; menus and tooltips use `--overlay`; fields use `--input-bg`. |
| Lines | `--hairline`, `--border`, `--border-strong` | Hairlines divide regions. Borders outline controls. |
| Text | `--text`, `--text-secondary`, `--text-tertiary`, `--disabled-text` | Three levels. Tertiary is for labels and counts, never for body copy a writer must read. |
| Accent | `--accent`, `--accent-hover`, `--on-accent`, `--accent-text`, `--accent-soft`, `--accent-soft-strong`, `--accent-line` | Squid lime. It marks the one primary action in view (Apply, Play) and the current thing (active tool, current set). Use `--accent-text` for accent-colored text on a surface. |
| Meaning | `--success`, `--warning`, `--error`, `--info` and their `-bg` / `-line` forms | Status only. Pair color with an icon or text. |
| Field | `--field-well`, `--field-accent`, `--field-chip`, `--field-chip-line`, `--field-chip-text` | The field and what floats over it keep one look in every theme. |
| Type | `--font-ui`, `--font-mono`, `--text-2xs` (10) to `--text-3xl` (32) | 12 px for controls, 13 px for content, 11 px for labels. Use `font-variant-numeric: tabular-nums` for counts, tempos and coordinates. |
| Space | `--space-1` (4) to `--space-10` (40) | A 4 px grid. |
| Shape | `--radius-xs` (4) to `--radius-xl` (16), `--radius-full` | 6 px for controls, 8 px for cards, 12–16 px for menus and dialogs. |
| Size | `--control-sm` (24), `--control-md` (28), `--control-lg` (32), `--control-xl` (40) | Control heights. Tool strip buttons are 32 px. |
| Motion | `--fast` (100 ms), `--normal` (160 ms), `--ease` | Hover and press use `--fast`; menus and dialogs use `--normal`. |

Section colors and the field artwork belong to the production. Themes never recolor them.

## Shared controls

[`src/ui/controls.css`](../src/ui/controls.css) and [`src/ui/dialogs.css`](../src/ui/dialogs.css) style these once. Feature panels compose them and do not restyle them.

| Control | Markup | Notes |
| --- | --- | --- |
| Button | `.button`, plus `.primary`, `.subtle`, `.ghost`, `.danger`, `.small`, `.large`, `.block` | One `.primary` per view. A toggle uses `aria-pressed`. |
| Icon button | `.icon-button` | 28 px. Always has a tooltip name. |
| Tool | `.tool`, `.tool--labelled` | Tool strip only. |
| Field | `input`, `select`, `textarea` inside `label.form-label`; rows with `.form-row` | Labels sit above fields at 11 px. |
| Segmented control | `.segmented` with `aria-pressed` buttons | For two to four exclusive choices. |
| Menu | [`<Menu>`](../src/ui/Menu.tsx) | Arrow keys move, Enter chooses, Escape returns focus to the trigger. Items can show a command's shortcut, a check, a hint or a section heading. |
| Tabs | `.tabs` with `role="tab"` buttons | Panel headers. |
| Dialog | [`<Modal>`](../src/components/Modal.tsx): `.modal-header`, `.modal-body`, `.modal-actions` | One frame for every dialog. Wide tools add `wide`. |
| Tooltip | [`<HelpButton>`](../src/editor/ControlHelp.tsx) / `<Tooltip>` | Name, one sentence, shortcut, and the reason when unavailable. |
| Badge, keycap, toast | `.badge`, `kbd`, `.toast` | |

An unavailable control stays visible at reduced opacity and says why in its tooltip. Do not hide a tool because it does not apply right now.

## Icons

Lucide for general actions, at 15–16 px. Formation tools use Squidware's own glyphs in [`src/ui/icons.tsx`](../src/ui/icons.tsx): each is drawn as performers in that formation, so the tool reads as the picture it makes. New drill-specific glyphs follow the same 20-unit grid and use `currentColor`.

## Writing in the interface

- Name things as a drill writer would: set, counts, move, section, performer.
- Buttons say what they do: **Add set**, **Apply formation**. No "OK".
- Sentence case everywhere. Small caps labels are for field captions and readout labels only.
- Status text states the state: **Unsaved changes**, **32 / 32**, **No spacing or stride flags**.

## Files

| Path | Responsibility |
| --- | --- |
| `src/ui/` | Tokens, base styles, shared controls, dialogs, print styles, the menu and icons. |
| `src/shell/` | The application shell: top bar, tool strip, side panel, show strip, status line, welcome. |
| `src/editor/*.css`, `src/components/stages.css` | Feature styles, written against the tokens. |
