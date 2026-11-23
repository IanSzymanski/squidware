import type { AssetPart } from './assetModels';

/** Keep the center of the home sideline clear for the front camera and floor orbit. */
export function stadiumParts(width: number, depth: number): AssetPart[] {
  const neutral = ['#3d4c4d', '#566467', '#617071'];
  const parts: AssetPart[] = [];
  const stand = (x: number, z: number, span: number, direction: number) => {
    for (let row = 0; row < 3; row++) {
      const height = (row + 1) * .43;
      parts.push({ shape: 'box', at: [x, height / 2, z + direction * row * 1.6],
        size: [span, height, 1.62], color: neutral[row] });
    }
  };
  const far = -depth / 2 - 5.5;
  stand(0, far, width * .86, -1);
  stand(-width * .32, depth / 2 + 5.5, width * .23, 1);
  stand(width * .32, depth / 2 + 5.5, width * .23, 1);
  parts.push(
    { shape: 'box', at: [0, 1.38, far - 4.55], size: [width * .17, 2.76, 1.8], color: '#495964' },
    { shape: 'box', at: [0, 2.14, far - 3.62], size: [width * .146, .55, .06], color: '#8fadb4' },
    { shape: 'box', at: [0, 2.8, far - 4.55], size: [width * .18, .12, 2.07], color: '#263639' },
  );
  for (const side of [-1, 1]) {
    parts.push({ shape: 'box', at: [side * (width / 2 + 6), .21, 0],
      size: [2, .42, depth * .64], color: neutral[0] });
  }
  return parts;
}
