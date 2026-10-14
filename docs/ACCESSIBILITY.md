# Keyboard and readable editor controls

The 2D field uses one roving Tab stop. Tab enters at the last focused performer, or the first performer when there is no remembered focus. The next Tab leaves the field. Arrow keys focus the nearest performer in that direction without editing or selecting; Page Up/Down walks the roster, including overlapping dots, and Home/End reaches its boundaries.

Enter/Space selects the focused performer. Shift+Enter/Space adds or removes it. Alt+arrows nudges the selected group one 8-to-5 step (0.625 yards); Shift+Alt+arrows moves four steps. Position edits remain blocked during playback/between-set previews. Space on a standard button activates that button; it does not trigger the global playback shortcut. Form inputs retain their normal editing keys.

Focus has a square outline, distinct from the circular selection ring. The focused performer exposes label, optional name, section and drill coordinates. Focusing outside a zoomed viewport brings the performer into view. Static SVG/print drawings do not introduce interactive Tab stops. The displayed keyboard hint and command help describe the same movement modifiers.

Editor chrome uses at least 11-pixel type, with 12-pixel explanatory text and 13-pixel form inputs. Muted text is darker on the existing light surfaces. Focus outlines, selected-set checks, pressed view/formation controls and error text provide cues beyond color. Disabled controls use a muted background and dashed borders rather than fading the whole control. The field legend scrolls at extreme section counts. Print typography is unchanged.

## Repeatable checks and scope

Build, then run `pnpm test:accessibility`. It loads a 500-performer, 128-set production into the actual sandboxed Electron renderer using isolated files and controlled native dialogs. Real Tab/Shift+Tab, arrows, roster keys, selection, nudges, text input and standard button activation drive the workflow. It checks every performer, overlapping dots, off-viewport focus, native Save As, Cast/Show review, a read-only transition, recovery to an editable set, and coordinate export. It also checks 125% UI zoom and accessible button names from Chromium's accessibility tree.

Computed-style audits cover Design, Cast, Show, settings, export, read-only preview and enlarged UI text. They check a minimum 11-pixel declared size and 4.5:1 contrast for rendered HTML text against composited solid backgrounds, including placeholders and opacity. SVG artwork, disabled controls and system menu options are excluded. This evidence is bounded; it does not certify screen readers, every graphics device, or all platform settings. The existing writer/platform and representative-hardware gates remain separate. Dense SVG performer labels and timeline zoom remain tracked by #20 and #31.

The implementation follows [W3C keyboard focus guidance](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/) and uses the [WCAG contrast calculation](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). The production keyboard check runs in Linux CI; actual macOS/Windows assistive-technology walkthroughs still need separate evidence.
