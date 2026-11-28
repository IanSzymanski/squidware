/** sRGB color math for personal appearance choices: contrast checks and lightness adjustments of #rrggbb colors. */
export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

type Rgb = [number, number, number];
const expand = (hex: string) => hex.length === 4 ? `#${[...hex.slice(1)].map(c => c + c).join('')}` : hex.slice(0, 7);
export const hexToRgb = (hex: string): Rgb => { const full = expand(hex); return [1, 3, 5].map(i => parseInt(full.slice(i, i + 2), 16)) as Rgb; };
export const rgbToHex = (rgb: Rgb) => `#${rgb.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

const channel = (value: number) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
export function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map(v => channel(v / 255));
  return .2126 * r + .7152 * g + .0722 * b;
}
/** WCAG contrast ratio between two opaque #rgb or #rrggbb colors. */
export function contrastRatio(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + .05) / (low + .05);
}
/** Mix toward another color; `amount` 0 keeps `from`, 1 gives `to`. */
export function mix(from: string, to: string, amount: number) {
  const a = hexToRgb(from), b = hexToRgb(to);
  return rgbToHex(a.map((v, i) => v + (b[i] - v) * amount) as Rgb);
}

function toHsl(hex: string): Rgb {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl([h, s, l]: Rgb) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex([r, g, b].map(v => (v + m) * 255) as Rgb);
}
/** Shift HSL lightness by `delta` (−1 to 1), keeping hue and saturation. */
export const shiftLightness = (hex: string, delta: number) => { const [h, s, l] = toHsl(hex); return fromHsl([h, s, Math.min(1, Math.max(0, l + delta))]); };

/**
 * The color nearest `hex` in lightness, same hue and saturation, that reaches `minimum` contrast against `against`,
 * moving lighter or darker. Returns `hex` when it already does; white or black always do for the backgrounds used here.
 */
export function ensureContrast(hex: string, against: string, minimum: number, direction: 'lighter' | 'darker') {
  if (contrastRatio(hex, against) >= minimum) return hex;
  const [h, s, l] = toHsl(hex);
  let low = direction === 'lighter' ? l : 0, high = direction === 'lighter' ? 1 : l;
  for (let i = 0; i < 24; i++) {
    const middle = (low + high) / 2, passes = contrastRatio(fromHsl([h, s, middle]), against) >= minimum;
    if (direction === 'lighter') { if (passes) high = middle; else low = middle; } else if (passes) low = middle; else high = middle;
  }
  const result = fromHsl([h, s, direction === 'lighter' ? high : low]);
  return contrastRatio(result, against) >= minimum ? result : direction === 'lighter' ? '#ffffff' : '#000000';
}
/** Whether dark or light ink reads better on this background. */
export const isLightColor = (hex: string) => contrastRatio(hex, '#000000') > contrastRatio(hex, '#ffffff');
