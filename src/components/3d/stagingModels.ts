import type { StagingSample } from '../../staging';
import type { AssetPart, AssetPlacement } from './assetModels';

const propParts: AssetPart[] = [
  { shape: 'box', at: [0, .499, 0], size: [1, .998, .996], color: '#795d83' },
  { shape: 'box', at: [0, .998, .31], size: [.38, .004, .07], color: '#fff2d2' },
  { shape: 'box', at: [0, .75, .498], size: [.38, .11, .004], color: '#fff2d2' },
];

export function stagingPlacements(objects: readonly StagingSample[] | undefined, width: number, height: number): AssetPlacement[] {
  return objects?.filter(object => object.visible).map(object => ({
    parts: propParts, at: [object.x - width / 2, 0, object.y - height / 2],
    scale: [object.width, object.height, object.depth], angle: object.angle * Math.PI / 180,
  })) ?? [];
}
