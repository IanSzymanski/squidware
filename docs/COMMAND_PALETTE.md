# Command palette and keyboard shortcuts

Open **Commands** in the project menu, click the search icon, or press **Ctrl/Cmd+K**. Search names, descriptions, set names, sections and saved groups. Arrow keys explore results; Enter runs the active command, Tab moves between controls, and Escape closes the palette and restores focus. Disabled results remain readable and explain the required selection, preview, set, view or history state.

The palette opens shared editors for parameterized operations, including formations, coordinates, transforms, selection/group tools, Cast, production settings and preferences. It also supports set navigation/reordering, workspace presets, view/path/label/zoom controls, playback/count steps, file operations and history. Internal store updates and raw patch commands are not executable text APIs. Search never evaluates code.

Opening/closing search preserves an existing field preview. Opening search pauses playback without changing the playhead. Pending text/number drafts and gestures must be finished or canceled first. Editing positions between sets remains unavailable; use a Go to set command to arrive at a set.

## Drill phrases

Phrases resolve against the active set and current production step size. They show a summary or diagnostic before opening the established field preview. **Preview on field**, then **Apply** commits one named undo action. **Cancel** keeps the original geometry. Typing and invalid phrases never create history or recovery edits.

| Phrase | Meaning |
| --- | --- |
| `move 4 forward` | Move the explicit selection four production steps toward the front sideline. |
| `move 3 yards right, 2 steps back` | Move the selection along two physical field axes. |
| `mirror across 50` | Mirror the selection across physical midfield. |
| `mirror front-back` | Mirror the selection across the field's front/back midpoint. |
| `interval 2 steps horizontal` | Space selected dots at a two-step X interval, preserving Y and centering the extent. |
| `interval 3 yards vertical anchor start` | Space on physical Y while holding the low-coordinate endpoint. `center` and `end` are also supported. |
| `place B1 at Side 1: on the 40; on front hash` | Resolve one exact performer label and both coordinate axes. |
| `place "Flute 1" at Side 2: 4 steps outside the 40; 6 steps behind front hash` | Quote a performer label containing spaces. |

Bare distances explicitly mean production steps: 8-, 6- or 12-to-5 as configured in this production. Explicit yards or steps override that convention. Forward/back and left/right use physical field axes, independent of audience orientation and performer facing. Absolute phrases must name both axes and provide an unambiguous side except at midfield. Interval phrases must name horizontal or vertical; they default to a center anchor and do not infer lanes. Mirrors must name their axis. Unsupported words, ambiguous labels, incomplete phrases and field crossings produce errors. Exact previews bypass snapping and reject the whole move rather than shortening or clamping it.

A labelled Place command selects its target only when the user opens the preview. Typing it does not change selection. Move, mirror and interval use the explicit selection, with at least two performers for intervals. Existing session guards cancel a preview if its selection, set, revision or editing context becomes stale.

## Rebinding

Open **Preferences → Keyboard shortcuts**. Find an action, choose its current binding and press the new keys. **Clear** unbinds that action; **Reset** restores its default. **Reset all shortcuts** restores all bindings without resetting other preferences. Escape cancels recording, and Tab keeps normal focus traversal. Conflicts identify the other command and require clearing it first. A rejected candidate is never saved.

Bindings are portable single chords with a platform primary modifier: Ctrl on Windows/Linux, Cmd on macOS. Ordinary typing, text copy/cut/paste/undo/select-all, the field's arrow/Enter/Space navigation, Alt-arrow nudges and normal Tab behavior remain available. Navigation keys and known OS/browser/text-editing chords cannot be assigned. Native menu commands require Ctrl/Cmd rather than unmodified letters. Browser Ctrl/Cmd+P keeps browser printing; a different Export binding can open Squidware's export dialog. Desktop Ctrl/Cmd+P opens Export by default. Windows/Linux Ctrl+Y remains a redo alias while redo keeps its default binding; rebinding redo removes that alias.

The 29 rebindable actions cover command search, files, history, select-all, focus, preferences/help, selection/pan/lasso tools, add performers, duplicate set, mirror, view, paths, labels, field zoom/fit, set navigation, playback and count stepping. Default editing keys include A to add performers, D to duplicate the current set, M to preview a midfield mirror, T to toggle 2D/3D, P for previous paths, J for label modes, =/−/0 for field zoom/fit, and comma/period for count stepping. Defaults are listed by Help and can be changed or cleared.

One portable binding table supplies matching, keycaps and native accelerators. Menus, renderer Help and tooltips update with the current validated bindings. A failed disk write keeps the in-memory binding usable and reports the persistence error. The sandboxed renderer sends only a trusted editor/text/modal context to main so native accelerators cannot steal keys from the recorder or text inputs. It sends changes only when this context changes, independent of playback frames. On macOS, main handles real native text key events with a fixed allowlist of focused webContents editing operations while menu accelerators are suspended; recorder buttons and editor shortcuts keep their own paths. Other platforms retain browser text editing. The renderer never receives arbitrary native commands or clipboard primitives.

Overrides live in personal version-1 preferences, with the existing bounded validation, ordered atomic writes, error/retry/reset and original-preservation rules. Old preferences default to the standard bindings. No project schema changes are needed, and no bindings enter `.squid`, coordinate exports or print geometry.

## Design review and validation

[Shared design guidance](DESIGN_GUIDANCE.md) sections 1–5 apply. The search affordance reuses the compact header and project menu without adding a toolbar row. Field height remains **485 px at 1366 × 768 / 100%**, above the approximately 470 px target. The modal, Lucide search icon, neutral tokens, text/error colors and shared keycaps follow the existing visual language. The palette's single active option supports keyboard and pointer use; disabled commands retain text explanations. Preferences use existing controls and do not dirty the production. No unresolved design deviation is identified.

[Before/after screenshots and native results](evidence/commands/README.md) cover default laptop, light, high-contrast at 1000 px / 125%, dark at 850 px / 150%, disabled results and shortcut recording. The `commands` suite checks actual native keyboard/pointer input, all four phrase types, cancel/Apply/undo, invalid/empty selection, typing/copy/cut/paste/undo/redo/select-all protection, conflict/reserved-key rejection, native menu propagation, single native save, project equality, Help, process restart, native reopen and reset. Text/placeholder contrast audits include disabled controls. Source tests cover parser ambiguity/bounds, shared engine results, quoting, persistence validation, command search, enablement and platform matching. The full desktop registry runs this owner on every CI OS with the existing two-worker limit; behavior is never retried.

Actual writer, assistive-technology and hardware qualification remain separately tracked by #64/#3.
