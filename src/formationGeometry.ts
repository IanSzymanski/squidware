import type { FormationKind, FormationOptions, Point } from './types';
import { PROJECT_LIMITS } from './projectValidation';
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function generateFormation(kind: FormationKind, count: number, options: FormationOptions): Point[] {
  if (!Number.isInteger(count) || count < 0 || count > PROJECT_LIMITS.performers) throw new Error(`Formation size must be an integer from 0 to ${PROJECT_LIMITS.performers}.`);
  if (![options.center.x, options.center.y, options.width, options.height, options.rotation, options.columns].every(Number.isFinite)) {
    throw new Error('Formation dimensions, center, rotation, and columns must be finite numbers.');
  }
  if (options.width < 0 || options.height < 0) throw new Error('Formation width and height cannot be negative.');
  if (!['line', 'arc', 'circle', 'block', 'curve'].includes(kind)) throw new Error('Unknown formation kind.');
  const radians = options.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const columns = clamp(Math.floor(options.columns), 1, Math.max(1, count));
  const rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    let x = 0;
    let y = 0;
    if (count > 1) {
      switch (kind) {
        case 'line': x = (t - 0.5) * options.width; break;
        case 'arc': {
          const angle = Math.PI * (1 - t);
          x = Math.cos(angle) * options.width / 2;
          y = Math.sin(angle) * options.height - options.height / 2;
          break;
        }
        case 'circle': {
          const angle = index / count * Math.PI * 2 - Math.PI / 2;
          x = Math.cos(angle) * options.width / 2;
          y = Math.sin(angle) * options.height / 2;
          break;
        }
        case 'block': {
          const column = index % columns;
          const row = Math.floor(index / columns);
          x = columns === 1 ? 0 : (column / (columns - 1) - 0.5) * options.width;
          y = rows === 1 ? 0 : (row / (rows - 1) - 0.5) * options.height;
          break;
        }
        case 'curve':
          x = (t - 0.5) * options.width;
          y = Math.sin((t - 0.5) * Math.PI * 2) * options.height / 2;
          break;
      }
    }
    return { x: options.center.x + x * cosine - y * sine, y: options.center.y + x * sine + y * cosine };
  });
}

