import type { ReactNode, SVGProps } from 'react';

/**
 * Squidware's own glyphs. Formation tools are drawn as performers (dots) in that formation, so a tool
 * reads as the picture it makes. All icons use currentColor on a 20-unit grid.
 */
type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

function Glyph({ size = 18, children, ...props }: IconProps & { children: ReactNode }) {
  return <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>{children}</svg>;
}
const dots = (points: readonly (readonly [number, number])[], r = 1.7) =>
  points.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={r} fill="currentColor" />);

export const LineIcon = (props: IconProps) => <Glyph {...props}>{dots([[3, 14], [6.5, 12], [10, 10], [13.5, 8], [17, 6]])}</Glyph>;
export const ArcIcon = (props: IconProps) => <Glyph {...props}>{dots([[2.6, 13.6], [5.6, 8.9], [10, 7], [14.4, 8.9], [17.4, 13.6]])}</Glyph>;
export const CircleIcon = (props: IconProps) => <Glyph {...props}>{dots([[10, 3.4], [15.7, 6.7], [15.7, 13.3], [10, 16.6], [4.3, 13.3], [4.3, 6.7]])}</Glyph>;
export const BlockIcon = (props: IconProps) => <Glyph {...props}>{dots([[4.5, 4.5], [10, 4.5], [15.5, 4.5], [4.5, 10], [10, 10], [15.5, 10], [4.5, 15.5], [10, 15.5], [15.5, 15.5]], 1.55)}</Glyph>;
export const WaveIcon = (props: IconProps) => <Glyph {...props}>{dots([[2.6, 10], [5.6, 6.6], [8.6, 8.4], [11.4, 11.6], [14.4, 13.4], [17.4, 10]])}</Glyph>;
export const ScatterIcon = (props: IconProps) => <Glyph {...props}>{dots([[4, 5], [11, 3.6], [16, 7.4], [7.4, 9.6], [13, 12], [4.4, 14.6], [10, 16.4], [16.4, 15.4]], 1.5)}</Glyph>;
export const BezierIcon = (props: IconProps) => <Glyph {...props}>
  <path d="M3 15C6 3 13 17 17 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".45" />
  {dots([[3, 15], [7.2, 8.6], [12.6, 11.6], [17, 5]])}
</Glyph>;

export const BezierWaveIcon = (props: IconProps) => <Glyph {...props}>
  <path d="M3 10C6 2 9 2 10 10s4 8 7 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".45" />
  {dots([[3, 10], [6.6, 4.6], [10, 10], [13.4, 15.4], [17, 10]])}
</Glyph>;

/** Paths from the previous set: travel arrives at the solid dot. */
export const PathsFromIcon = (props: IconProps) => <Glyph {...props}>
  <path d="M3.5 15.5 13 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2.2 2.6" />
  <circle cx="3.5" cy="15.5" r="1.9" stroke="currentColor" strokeWidth="1.4" />
  <circle cx="15" cy="5" r="2.5" fill="currentColor" />
</Glyph>;
/** Paths to the next set: travel leaves the solid dot. */
export const PathsToIcon = (props: IconProps) => <Glyph {...props}>
  <path d="M7 14 16.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2.2 2.6" />
  <circle cx="5" cy="15" r="2.5" fill="currentColor" />
  <circle cx="16.5" cy="4.5" r="1.9" stroke="currentColor" strokeWidth="1.4" />
</Glyph>;

/** The Squidware mark, drawn inline so it follows the theme. */
export function SquidMark({ size = 24 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
    <rect width="40" height="40" rx="11" fill="#c2f279" />
    <path d="M12 20c0-8 8-13 8-13s8 5 8 13c0 4-3 7-8 7s-8-3-8-7Zm3 5-3 8m8-7v9m5-10 3 8" fill="none" stroke="#1c2a21" strokeWidth="3" strokeLinecap="round" />
    <circle cx="17" cy="19" r="1.5" fill="#1c2a21" /><circle cx="23" cy="19" r="1.5" fill="#1c2a21" />
  </svg>;
}
