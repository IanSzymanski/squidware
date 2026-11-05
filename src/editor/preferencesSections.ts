/** Preferences groups, in dialog and section-nav order. */
export const preferencesSections = [
  { id: 'appearance', title: 'Appearance', description: 'Theme, UI scale, panel layout and hints.' },
  { id: 'field', title: 'Field display', description: 'Start view, paths, grid, zoom, dots, labels, coloring and coordinate precision.' },
  { id: 'editing', title: 'Editing', description: 'Nudge and preset increments, snapping, new sets, formation tools, new-production and print defaults.' },
  { id: 'shortcuts', title: 'Shortcuts', description: 'Find, record, clear and reset keyboard shortcuts.' },
] as const;
export type PreferencesSectionId = typeof preferencesSections[number]['id'];

/**
 * Index of the section being read in a scrolled dialog. `headings` are section heading tops, `top` is the
 * bottom edge of the sticky section nav and `bottom` the scrollport's bottom edge, all in viewport pixels.
 * A section the nav jumped to stays current while its heading is visible, because the last, short sections
 * cannot scroll up to the nav; otherwise the last heading at or just below the nav wins, and the final section
 * wins once the dialog is scrolled to its end.
 */
export function preferencesSectionAt(headings: readonly number[], top: number, bottom: number, atEnd: boolean, jumped = -1) {
  if (jumped >= 0 && headings[jumped] >= top - 2 && headings[jumped] < bottom) return jumped;
  if (atEnd) return headings.length - 1;
  return headings.reduce((current, heading, index) => heading <= top + 24 ? index : current, 0);
}
