/** The Squidware squid: one even-odd silhouette with the eyes cut out, so it takes any single color. */
export const SQUID_GLYPH = {
  viewBox: '100 108 312 300',
  path: 'M256 116 151 261Q134 283 137 312L152 330 104 390 170 367 188 401H324L342 367 408 390 360 330 375 312Q377 286 361 262L256 116ZM166 309H241C241 333 225 349 204 349S168 335 166 309ZM271 309H346C344 335 329 349 307 349S272 333 271 309Z',
} as const;

/** Standalone SVG source for the glyph in one color, as the tab icon uses it. */
export function squidGlyphSvg(color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${SQUID_GLYPH.viewBox}"><path fill="${color}" fill-rule="evenodd" d="${SQUID_GLYPH.path}"/></svg>`;
}

/** Points a page icon link at the glyph in `accent`; returns a restore for the original icon. */
export function showAccentIcon(link: Pick<Element, 'getAttribute' | 'setAttribute' | 'removeAttribute'> | null, accent: string) {
  if (!link || !/^#[0-9a-f]{6}$/i.test(accent)) return () => {};
  const original = link.getAttribute('href');
  link.setAttribute('href', `data:image/svg+xml,${encodeURIComponent(squidGlyphSvg(accent))}`);
  return () => { if (original === null) link.removeAttribute('href'); else link.setAttribute('href', original); };
}
