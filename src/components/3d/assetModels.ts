import type { CarriedEquipment } from '../../equipment';

export type XYZ = readonly [x: number, y: number, z: number];
export interface AssetPart {
  shape: 'box' | 'cylinder' | 'flare';
  at: XYZ;
  size: XYZ;
  direction?: XYZ;
  color: string;
}

export interface AssetPlacement {
  parts: readonly AssetPart[];
  at: XYZ;
  scale?: XYZ;
  angle?: number;
  flagColor?: string;
  tilt?: { pivot: XYZ; pitch: number };
}

export const DEFAULT_FABRIC = 'flag-color';
const brass = '#e3ad45';
const bright = '#f5ce76';
const silver = '#bdccd3';
const dark = '#29343b';
const wood = '#925943';
const white = '#f1e7d6';
const blue = '#4a7892';
const black = '#172124';

const box = (at: XYZ, size: XYZ, color: string): AssetPart => ({ shape: 'box', at, size, color });
const cylinder = (at: XYZ, size: XYZ, color: string, direction?: XYZ): AssetPart => (
  { shape: 'cylinder', at, size, color, direction }
);

function shaft(from: XYZ, to: XYZ, diameter: number, color: string): AssetPart {
  const direction: XYZ = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  return cylinder(
    [from[0] + direction[0] / 2, from[1] + direction[1] / 2, from[2] + direction[2] / 2],
    [diameter, Math.hypot(...direction), diameter], color, direction,
  );
}

function bell(at: XYZ, diameter: number, length: number, direction: XYZ = [0, 0, 1]): AssetPart[] {
  const cap: XYZ = [at[0] + direction[0] * length / 2, at[1] + direction[1] * length / 2, at[2] + direction[2] * length / 2];
  return [
    { shape: 'flare', at, size: [diameter, length, diameter], color: brass, direction },
    cylinder(cap, [diameter * .97, .015, diameter * .97], bright, direction),
    cylinder([cap[0] + direction[0] * .012, cap[1] + direction[1] * .012, cap[2] + direction[2] * .012],
      [diameter * .73, .01, diameter * .73], wood, direction),
  ];
}

const horn = (spread: number, projection: number, diameter: number) => [
  shaft([-spread, 1.25, .23], [-spread, 1.25, projection - .05], .06, brass),
  shaft([spread, 1.15, .29], [spread, 1.15, projection - .08], .067, brass),
  shaft([-spread, 1.15, .42], [spread, 1.15, .42], .063, bright),
  box([0, 1.23, .44], [.11, .15, .15], bright),
  ...bell([-spread, 1.25, projection], diameter, .22),
];

const drum = (at: XYZ, diameter: number, depth: number, direction: XYZ = [0, 1, 0]) => {
  const head = (sign: number): XYZ => [
    at[0] + direction[0] * (depth / 2 + .013) * sign,
    at[1] + direction[1] * (depth / 2 + .013) * sign,
    at[2] + direction[2] * (depth / 2 + .013) * sign,
  ];
  return [
    cylinder(at, [diameter, depth, diameter], blue, direction),
    cylinder(head(1), [diameter * 1.045, .032, diameter * 1.045], white, direction),
    cylinder(head(-1), [diameter * 1.045, .032, diameter * 1.045], silver, direction),
  ];
};

export const flagGrip: XYZ = [.34, 1.04, .22];
export const flagPoleParts = [
  shaft([.34, .39, .22], [.34, 2.39, .22], .042, silver),
  box([.69, 2.03, .22], [.72, .63, .014], DEFAULT_FABRIC),
  box([.69, 2.31, .22], [.72, .04, .018], white),
];

/** Parts use yards around the root on the turf. +Z faces forward, +X is the performer's right. */
const carriedParts: Record<CarriedEquipment, readonly AssetPart[]> = {
  trumpet: horn(.067, .72, .18),
  mellophone: horn(.105, .65, .33),
  trombone: [
    ...horn(.1, .71, .24),
    shaft([.1, 1.17, .37], [.1, 1.17, 1.07], .036, silver),
    shaft([.21, 1.17, .43], [.21, 1.17, 1.07], .036, silver),
    shaft([.1, 1.17, 1.07], [.21, 1.17, 1.07], .039, bright),
  ],
  euphonium: [
    shaft([-.15, .86, .37], [-.15, 1.34, .42], .12, brass),
    shaft([.15, .86, .37], [.15, 1.23, .42], .10, bright),
    shaft([-.15, .86, .37], [.15, .86, .37], .13, brass),
    box([0, 1.13, .41], [.23, .13, .15], bright),
    ...bell([-.15, 1.44, .42], .35, .27, [0, 1, 0]),
  ],
  tuba: [
    shaft([-.27, 1.25, .31], [-.18, .68, .33], .16, brass),
    shaft([-.18, .68, .33], [.25, .74, .34], .16, brass),
    shaft([.25, .74, .34], [.26, 1.5, .25], .16, bright),
    box([.03, 1.12, .34], [.28, .16, .15], bright),
    ...bell([.27, 1.61, .25], .54, .34, [0, 1, 0]),
  ],
  flute: [
    shaft([-.12, 1.43, .25], [.65, 1.44, .29], .048, silver),
    box([.19, 1.45, .28], [.31, .025, .07], white),
  ],
  clarinet: [
    shaft([0, 1.42, .21], [.13, .87, .47], .062, dark),
    shaft([.015, 1.37, .247], [.102, 1.0, .416], .024, silver),
    { shape: 'flare', at: [.144, .81, .49], size: [.145, .155, .145], color: dark, direction: [.22, -.86, .46] },
  ],
  saxophone: [
    shaft([0, 1.43, .24], [.12, 1.28, .40], .06, brass),
    shaft([.12, 1.28, .40], [.08, .8, .43], .105, brass),
    shaft([.08, .8, .43], [.29, .86, .45], .13, bright),
    ...bell([.33, 1.0, .45], .22, .24, [0, 1, 0]),
  ],
  snare: [box([0, 1.02, .25], [.32, .09, .32], dark), ...drum([0, .84, .37], .47, .23)],
  tenors: [
    box([0, .85, .44], [.68, .10, .32], dark),
    ...drum([-.25, .86, .43], .32, .16), ...drum([.25, .86, .43], .32, .16),
    ...drum([-.11, .83, .71], .23, .14), ...drum([.13, .83, .71], .24, .14),
  ],
  'bass-drum': [
    box([0, 1.12, .24], [.28, .1, .32], dark),
    ...drum([0, .98, .49], .75, .31, [1, 0, 0]),
    box([0, 1.36, .51], [.28, .04, .16], bright),
  ],
  flag: [
    ...flagPoleParts,
    box([.33, 1.04, .22], [.09, .11, .09], dark),
  ],
  'guard-rifle': [
    // Solid color-guard silhouette with broad training-prop proportions.
    box([-.29, 1.09, .32], [.26, .16, .085], white),
    box([-.02, 1.15, .32], [.34, .11, .071], white),
    box([.30, 1.21, .32], [.31, .062, .061], white),
    box([-.06, 1.11, .32], [.10, .13, .095], blue),
  ],
  'guard-saber': [
    shaft([-.35, .97, .31], [-.13, 1.14, .31], .07, blue),
    box([-.12, 1.16, .31], [.12, .13, .08], bright),
    shaft([-.12, 1.16, .31], [.35, 1.48, .31], .046, silver),
    shaft([.35, 1.48, .31], [.54, 1.57, .31], .027, silver),
  ],
};

const handGrips: Partial<Record<CarriedEquipment, XYZ>> = {
  trumpet: [.06, 1.17, .43], mellophone: [.10, 1.17, .43], trombone: [.13, 1.17, .44],
  euphonium: [.08, 1.13, .39], tuba: [.14, 1.12, .32], flute: [.22, 1.44, .27],
  clarinet: [.085, 1.07, .39], saxophone: [.11, 1.23, .38], flag: flagGrip,
  'guard-rifle': [-.06, 1.11, .32], 'guard-saber': [-.26, 1.05, .31],
};

/** Each hand-held prop meets the same shoulder-relative grip used by its carry pose. */
export const carriedModels = Object.fromEntries(Object.entries(carriedParts).map(([name, parts]) => {
  const grip = handGrips[name as CarriedEquipment];
  if (!grip) return [name, parts];
  const shoulder: XYZ = [grip[0] < 0 ? -.14 : .14, 1.16, .13];
  return [name, [...parts, shaft(shoulder, grip, .085, dark),
    box(grip, [.09, .08, .084], '#d4b69b')]];
})) as Record<CarriedEquipment, readonly AssetPart[]>;


export const flagHolderParts = carriedModels.flag.slice(flagPoleParts.length);

function frame(width: number, depth: number, height = .87) {
  return [
    box([0, height * .7, 0], [width, .09, depth * .9], dark),
    ...[-1, 1].flatMap(side => [-1, 1].flatMap(end => {
      const x = side * width * .42, z = end * depth * .4;
      return [box([x, height * .4, z], [.075, height * .8, .075], dark),
        cylinder([x, .095, z], [.17, .08, .17], black, [1, 0, 0])];
    })),
  ];
}

const keyboard = (width: number, depth: number, barCount: number, bars: string, resonators: boolean): AssetPart[] => [
  ...frame(width, depth),
  box([0, .88, 0], [width, .11, depth], black),
  ...Array.from({ length: barCount }, (_, index) => {
    const length = depth * (.92 - .39 * index / barCount);
    const x = ((index + .5) / barCount - .5) * width * .96;
    const bar = box([x, .96, -.04], [width * .84 / barCount, .060, length], bars);
    return resonators ? [bar, cylinder([x, .69 - length * .17, .07], [.064, length * .58, .064], brass)] : [bar];
  }).flat(),
];

export const pitModels = {
  marimba: { name: 'Marimba', parts: keyboard(1.95, .69, 14, wood, true) },
  vibraphone: { name: 'Vibraphone', parts: keyboard(1.65, .58, 12, silver, true) },
  xylophone: { name: 'Xylophone / glockenspiel', parts: keyboard(1.22, .43, 12, bright, false) },
  timpani: { name: 'Timpani', parts: [-.48, .48].flatMap<AssetPart>((x, i) => [
    box([x, .23, 0], [.50, .34, .48], dark),
    { shape: 'flare', at: [x, .56, 0], size: [.68 + i * .15, .51, .68 + i * .15], color: wood },
    cylinder([x, .83, 0], [.72 + i * .15, .045, .72 + i * .15], white),
  ]) },
  rack: { name: 'Percussion rack', parts: [
    ...frame(1.55, .54), box([0, 1.33, 0], [1.49, .07, .07], dark),
    box([-.67, .9, 0], [.07, .91, .07], dark), box([.67, .9, 0], [.07, .91, .07], dark),
    ...drum([-.40, 1.04, .05], .35, .17), ...drum([.02, .96, .05], .41, .22),
    cylinder([.46, 1.17, .05], [.42, .047, .42], bright, [.2, 1, 0]),
  ] },
  synth: { name: 'Keyboard / synth', parts: [
    ...keyboard(1.42, .52, 12, white, false), box([0, .97, -.20], [1.34, .090, .11], dark),
    box([.37, 1.02, -.21], [.22, .02, .07], blue),
  ] },
};
