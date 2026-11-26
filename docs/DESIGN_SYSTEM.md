# Squidware design system

How the app looks and where things go. Read this before adding a screen, control or panel. The [design guidance](DESIGN_GUIDANCE.md) records the principles; this page is the system that implements them.

## What the shell is for

A drill writer does five things, over and over: go to a set, select performers, shape them, add the next set, and watch the move. The shell keeps those five always in reach and puts everything else one named step away.

| Region | Holds | Why it is there |
| --- | --- | --- |
| Top bar | Project menu, title and save state, **Write · Plan · Rehearse**, undo/redo, problems, command search, Export | The things that are true in every mode. |
| Tool strip | Pointer tools, **Shape** (line, arc, circle, block, wave), **Arrange** (align, rotate, mirror, place), Motion, Props | The verbs of drill writing as first-class buttons. Tools stay where they are; they enable and disable with context. |
| Field | The field, edge to edge, with paths, View, 2D/3D/Split and zoom floating in its apron | The field is the product. The canvas is turf; nothing permanent sits on the playing surface. |
| Side panel | The **Inspector** for the selection and the set, or the **Cast** list | One panel beside the field, one width for both tabs. It shows what applies to the current work and nothing else. |
| Show strip | Transport and position, a count-proportional timeline, and every set as a thumbnail | Sets read as a storyboard. The dock stays short because every pixel of its height comes out of the field. |

Rules that follow from this:

- **The field gets the window.** A football field is about 1.9:1, and at Fit it is limited by width in a laptop window and by height on a large display. Do not add a second side panel or a permanent left column, and treat every pixel of chrome height as taken from the field. The apron around the turf at Fit (`FIELD_FIT_MARGIN`) holds the sideline captions and the floating controls; nothing else may claim it.
- **Direct manipulation first.** A multiple selection is framed on the field with its size in steps and handles that rotate and scale it; dragging a dot moves the selection. The Inspector holds the same edits as numbers, each control named with the size of its step.
- **Drill vocabulary, one unit system.** Positions read as side, yard line and hash. Lengths read in steps, travel as a step size (`6.2-to-5`), time in counts. Yards appear only where a writer asks for an exact coordinate.
- **One severity model.** A *problem* breaks a rule of the production and is counted in the top bar, on the timeline and on the set's card. A step *near the stride limit* is advice: it is colored on the field and named as such, and it never changes the problem count.
- **A preview owns the tool strip.** While a shape, transform, spacing or coordinate preview is open, the strip shows what is being previewed and Cancel / Apply. Parameters are in the side panel with the same two actions.
- **Depth lives in named menus and the palette.** Motion, More shapes, View, Set actions and the Project menu group deeper features by what the writer is trying to do. Every command is also in the command palette (`Ctrl/⌘ K`).
- **No filler.** A panel does not explain itself in paragraphs. Put the explanation in the control's tooltip, the hint line on the field's margin, or Help. A line of text in a panel must be something the writer needs to read to do the work.
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
| `src/shell/` | The application shell: top bar, tool strip, side panel, show strip, field hint, welcome. |
| `src/editor/*.css`, `src/components/stages.css` | Feature styles, written against the tokens. |
