import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SquidMark } from './icons';
import { SQUID_GLYPH, showAccentIcon, squidGlyphSvg } from './squidGlyph';

const link = (href: string | null) => {
  const attributes = new Map<string, string>(href === null ? [] : [['href', href]]);
  return { getAttribute: (name: string) => attributes.get(name) ?? null, setAttribute: (name: string, value: string) => void attributes.set(name, value), removeAttribute: (name: string) => void attributes.delete(name) };
};
describe('the squid glyph', () => {
  it('draws the mark in the accent color, eyes cut out', () => {
    const html = renderToStaticMarkup(<SquidMark size={22} />);
    expect(html).toContain('fill="var(--accent)"');
    expect(html).toContain('fill-rule="evenodd"');
    expect(html).toContain(`viewBox="${SQUID_GLYPH.viewBox}"`);
  });
  it('points the tab icon at the glyph in the current accent and restores it', () => {
    const icon = link('./squid.svg');
    const restore = showAccentIcon(icon, '#8ab4ff');
    expect(decodeURIComponent(icon.getAttribute('href')!.replace('data:image/svg+xml,', ''))).toBe(squidGlyphSvg('#8ab4ff'));
    restore();
    expect(icon.getAttribute('href')).toBe('./squid.svg');
  });
  it('leaves the icon alone without a usable accent or link', () => {
    const icon = link('./squid.svg');
    showAccentIcon(icon, '')();
    showAccentIcon(icon, 'var(--x)')();
    expect(icon.getAttribute('href')).toBe('./squid.svg');
    expect(() => showAccentIcon(null, '#ffffff')()).not.toThrow();
  });
});
